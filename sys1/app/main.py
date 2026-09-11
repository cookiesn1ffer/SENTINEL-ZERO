import asyncio
import json
import time

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import db, scoring
from .auth import CurrentSession, authenticate, get_current_session
from .config import IMPOSSIBLE_TRAVEL_WINDOW_SECONDS
from .models import (
    AccessRequest,
    AccessResponse,
    AdminDecisionRequest,
    AdminDecisionResponse,
    EventOut,
    KillSwitchRequest,
    KillSwitchResponse,
    LoginRequest,
    LoginResponse,
    PermissionRequest,
    PermissionResponse,
    PostureResponse,
    PostureSignal,
)

app = FastAPI(title="Sentinel Zero — System 1 (Core Engine & PEP)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    db.init_db()


def _row_to_event(row) -> EventOut:
    return EventOut(
        event_id=row["event_id"],
        type=row["type"],
        subject=row["subject"],
        resource_or_permission=row["resource_or_permission"],
        score=row["score"],
        decision=row["decision"],
        reason=row["reason"],
        mode=row["mode"],
        timestamp=row["timestamp"],
        pending_admin_action=bool(row["pending_admin_action"]),
    )


# --- auth ---


@app.post("/api/auth/login", response_model=LoginResponse)
def login(body: LoginRequest):
    result = authenticate(body.username, body.password, body.device_id)
    if result is None:
        raise HTTPException(401, "invalid credentials")
    token, expires_in = result
    return LoginResponse(token=token, expires_in=expires_in)


# --- agent signals ---


@app.post("/api/agent/posture", response_model=PostureResponse)
def posture(body: PostureSignal, session: CurrentSession = Depends(get_current_session)):
    if db.is_killed(body.device_id):
        raise HTTPException(403, "device has been killed by admin")

    posture_score = scoring.score_posture(body.open_ports, body.firewall_status)
    db.upsert_device(
        body.device_id, body.open_ports, body.firewall_status, body.os_platform,
        body.local_time, body.timestamp, posture_score,
    )
    db.touch_session(session.jti, body.geo, body.client_ip)
    return PostureResponse(posture_score_component=posture_score)


@app.post("/api/agent/permission-request", response_model=PermissionResponse)
def permission_request(body: PermissionRequest, session: CurrentSession = Depends(get_current_session)):
    dp = body.device_posture
    if db.is_killed(dp.device_id):
        event_id = db.log_event(
            "app_permission_request", body.app_id, ",".join(body.requested_permissions),
            0, "CRITICAL", "device has been killed by admin", body.mode, body.timestamp,
        )
        return PermissionResponse(decision="CRITICAL", score=0, reason="device has been killed by admin",
                                   pending_admin_action=False, event_id=event_id)

    posture_score = scoring.score_posture(dp.open_ports, dp.firewall_status)
    db.upsert_device(dp.device_id, dp.open_ports, dp.firewall_status, dp.os_platform,
                      dp.local_time, dp.timestamp, posture_score)

    score, decision, reason = scoring.score_permission_request(
        body.app_id, body.requested_permissions, posture_score
    )

    pending_admin_action = body.mode == "manual" and decision == "CHALLENGE"

    event_id = db.log_event(
        "app_permission_request",
        body.app_id,
        ",".join(body.requested_permissions),
        score,
        decision,
        reason,
        body.mode,
        body.timestamp,
        pending_admin_action=pending_admin_action,
    )

    if decision == "CRITICAL":
        # manifest violation: kill the offending app/device immediately,
        # regardless of manual/auto mode, and surface it in the event log.
        db.kill_target(dp.device_id, f"CRITICAL manifest violation: {reason}")

    db.touch_session(session.jti, dp.geo, dp.client_ip, trust_score=score)

    return PermissionResponse(
        decision=decision, score=score, reason=reason,
        pending_admin_action=pending_admin_action, event_id=event_id,
    )


# --- generic continuous-authorization check (drives attack demo 2) ---


@app.post("/api/access/request", response_model=AccessResponse)
def access_request(body: AccessRequest, session: CurrentSession = Depends(get_current_session)):
    row = session.row
    anomaly = False
    anomaly_reason = ""

    if body.geo and row["last_geo"] and body.geo != row["last_geo"]:
        elapsed = int(time.time()) - row["last_seen_at"]
        if elapsed < IMPOSSIBLE_TRAVEL_WINDOW_SECONDS:
            anomaly = True
            anomaly_reason = (
                f"impossible travel: token used from '{row['last_geo']}' then "
                f"'{body.geo}' only {elapsed}s later"
            )

    base_trust = row["trust_score"] if row["trust_score"] is not None else 80
    score, decision, reason = scoring.score_access_request(base_trust, anomaly, anomaly_reason)

    ts = body.timestamp or str(int(time.time()))
    event_id = db.log_event(
        "api_request", session.username, body.resource, score, decision, reason,
        mode=None, timestamp=ts, pending_admin_action=False,
    )

    db.touch_session(session.jti, body.geo or row["last_geo"], body.client_ip, trust_score=score)

    return AccessResponse(decision=decision, score=score, reason=reason, event_id=event_id)


# --- admin ---


@app.post("/api/admin/decision", response_model=AdminDecisionResponse)
def admin_decision(body: AdminDecisionRequest, session: CurrentSession = Depends(get_current_session)):
    event = db.get_event(body.event_id)
    if event is None:
        raise HTTPException(404, "unknown event_id")
    db.resolve_event(body.event_id, body.admin_decision)
    return AdminDecisionResponse(status="ok")


@app.post("/api/admin/kill-switch", response_model=KillSwitchResponse)
def kill_switch(body: KillSwitchRequest, session: CurrentSession = Depends(get_current_session)):
    event_id = db.kill_target(body.target, body.reason)
    db.log_event(
        "api_request", body.target, "kill-switch", 0, "CRITICAL",
        f"admin kill switch triggered: {body.reason}", mode="manual",
        timestamp=str(int(time.time())),
    )
    return KillSwitchResponse(status="killed", event_id=event_id)


# --- dashboard reads ---


@app.get("/api/events/recent", response_model=list[EventOut])
def events_recent(limit: int = 100):
    return [_row_to_event(r) for r in db.list_recent_events(limit=limit)]


@app.get("/api/events/stream")
async def events_stream():
    async def gen():
        last_created_at = int(time.time())
        while True:
            rows = db.list_recent_events(limit=50, since_created_at=last_created_at)
            for row in reversed(rows):  # oldest of the batch first
                last_created_at = max(last_created_at, row["created_at"])
                yield f"data: {json.dumps(_row_to_event(row).model_dump())}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/api/dashboard/sessions")
def dashboard_sessions():
    return [dict(r) for r in db.list_active_sessions()]


@app.get("/api/dashboard/devices")
def dashboard_devices():
    return [dict(r) for r in db.list_devices()]


@app.get("/api/dashboard/pending")
def dashboard_pending():
    return [_row_to_event(r) for r in db.list_pending_events()]


@app.get("/api/dashboard/kill-switch-status")
def dashboard_kill_switch_status():
    return [dict(r) for r in db.list_kill_switch_status()]
