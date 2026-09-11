import sqlite3
import time
import uuid
from contextlib import contextmanager
from typing import Optional

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    jti TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    device_id TEXT,
    issued_at INTEGER NOT NULL,
    last_geo TEXT,
    last_ip TEXT,
    last_seen_at INTEGER NOT NULL,
    trust_score INTEGER NOT NULL DEFAULT 80,
    killed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    open_ports TEXT,
    firewall_status TEXT,
    os_platform TEXT,
    local_time TEXT,
    timestamp TEXT,
    posture_score INTEGER,
    killed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    subject TEXT NOT NULL,
    resource_or_permission TEXT,
    score INTEGER,
    decision TEXT NOT NULL,
    reason TEXT,
    mode TEXT,
    timestamp TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    pending_admin_action INTEGER NOT NULL DEFAULT 0,
    admin_decision TEXT
);

CREATE TABLE IF NOT EXISTS kill_switch (
    target TEXT PRIMARY KEY,
    reason TEXT,
    event_id TEXT,
    timestamp TEXT
);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)


# --- sessions ---

def create_session(jti: str, username: str, device_id: Optional[str], trust_score: int = 80):
    now = int(time.time())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (jti, username, device_id, issued_at, last_seen_at, trust_score) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (jti, username, device_id, now, now, trust_score),
        )


def get_session(jti: str) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE jti = ?", (jti,)).fetchone()
    return row


def touch_session(jti: str, geo: Optional[str], ip: Optional[str], trust_score: Optional[int] = None):
    now = int(time.time())
    with get_conn() as conn:
        if trust_score is not None:
            conn.execute(
                "UPDATE sessions SET last_geo=?, last_ip=?, last_seen_at=?, trust_score=? WHERE jti=?",
                (geo, ip, now, trust_score, jti),
            )
        else:
            conn.execute(
                "UPDATE sessions SET last_geo=?, last_ip=?, last_seen_at=? WHERE jti=?",
                (geo, ip, now, jti),
            )


def list_active_sessions():
    with get_conn() as conn:
        return conn.execute("SELECT * FROM sessions ORDER BY last_seen_at DESC").fetchall()


# --- devices ---

def upsert_device(device_id: str, open_ports, firewall_status, os_platform, local_time, timestamp, posture_score):
    import json

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO devices (device_id, open_ports, firewall_status, os_platform, local_time, timestamp, posture_score)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                open_ports=excluded.open_ports,
                firewall_status=excluded.firewall_status,
                os_platform=excluded.os_platform,
                local_time=excluded.local_time,
                timestamp=excluded.timestamp,
                posture_score=excluded.posture_score
            """,
            (device_id, json.dumps(open_ports), firewall_status, os_platform, local_time, timestamp, posture_score),
        )


def get_device(device_id: str) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM devices WHERE device_id = ?", (device_id,)).fetchone()


def list_devices():
    with get_conn() as conn:
        return conn.execute("SELECT * FROM devices ORDER BY device_id").fetchall()


# --- events ---

def log_event(
    type_: str,
    subject: str,
    resource_or_permission: str,
    score: int,
    decision: str,
    reason: str,
    mode: Optional[str],
    timestamp: str,
    pending_admin_action: bool = False,
) -> str:
    event_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO events
            (event_id, type, subject, resource_or_permission, score, decision, reason, mode, timestamp, created_at, pending_admin_action)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                type_,
                subject,
                resource_or_permission,
                score,
                decision,
                reason,
                mode,
                timestamp,
                int(time.time()),
                1 if pending_admin_action else 0,
            ),
        )
    return event_id


def list_recent_events(limit: int = 100, since_created_at: Optional[int] = None):
    with get_conn() as conn:
        if since_created_at is not None:
            return conn.execute(
                "SELECT * FROM events WHERE created_at > ? ORDER BY created_at DESC LIMIT ?",
                (since_created_at, limit),
            ).fetchall()
        return conn.execute(
            "SELECT * FROM events ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()


def list_pending_events():
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM events WHERE pending_admin_action = 1 AND admin_decision IS NULL ORDER BY created_at DESC"
        ).fetchall()


def get_event(event_id: str) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()


def resolve_event(event_id: str, admin_decision: str):
    with get_conn() as conn:
        conn.execute(
            "UPDATE events SET admin_decision = ?, pending_admin_action = 0 WHERE event_id = ?",
            (admin_decision, event_id),
        )


# --- kill switch ---

def kill_target(target: str, reason: str) -> str:
    event_id = str(uuid.uuid4())
    ts = str(int(time.time()))
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO kill_switch (target, reason, event_id, timestamp) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(target) DO UPDATE SET reason=excluded.reason, event_id=excluded.event_id, timestamp=excluded.timestamp",
            (target, reason, event_id, ts),
        )
        # a device_id target kills the device; a session's device_id also gets killed
        conn.execute("UPDATE devices SET killed = 1 WHERE device_id = ?", (target,))
        conn.execute("UPDATE sessions SET killed = 1 WHERE device_id = ? OR username = ?", (target, target))
    return event_id


def is_killed(target: str) -> bool:
    with get_conn() as conn:
        row = conn.execute("SELECT 1 FROM kill_switch WHERE target = ?", (target,)).fetchone()
    return row is not None


def list_kill_switch_status():
    with get_conn() as conn:
        return conn.execute("SELECT * FROM kill_switch ORDER BY timestamp DESC").fetchall()
