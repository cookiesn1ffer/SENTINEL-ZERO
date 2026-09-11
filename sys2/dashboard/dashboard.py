import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import streamlit as st

from shared.client import get, post
from shared.mode_state import get_mode, set_mode

st.set_page_config(page_title="Sentinel Zero", layout="wide", page_icon="🛡️")

CSS = """
<style>
.block-container { padding-top: 2rem; max-width: 1200px; }

.sz-hero {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 0.25rem;
}
.sz-hero h1 { margin: 0; font-size: 1.9rem; }
.sz-sub { color: #9aa4b2; font-size: 0.95rem; margin-bottom: 1.5rem; }

.sz-status { display:inline-flex; align-items:center; gap:6px; font-size:0.85rem;
    padding: 4px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); }
.sz-status.ok { color:#4bd67a; }
.sz-status.bad { color:#ff4b4b; }
.sz-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
.sz-dot.ok { background:#4bd67a; }
.sz-dot.bad { background:#ff4b4b; }

.sz-section-title { font-size: 1.05rem; font-weight: 700; margin: 1.6rem 0 0.6rem 0;
    text-transform: uppercase; letter-spacing: .04em; color: #c7cdd6; }

.sz-card { background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.09);
    border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; }
.sz-card.critical { border-left: 4px solid #ff4b4b; background: rgba(255,75,75,0.07); }
.sz-card.deny     { border-left: 4px solid #ff9f4b; background: rgba(255,159,75,0.06); }
.sz-card.challenge{ border-left: 4px solid #4ba3ff; background: rgba(75,163,255,0.06); }
.sz-card.allow    { border-left: 4px solid #4bd67a; background: rgba(75,214,122,0.05); }
.sz-card.neutral  { border-left: 4px solid #5b6472; }

.sz-row { display:flex; align-items:center; justify-content:space-between; gap: 10px; }
.sz-badge { display:inline-block; padding: 2px 10px; border-radius: 999px;
    font-size: 0.68rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.sz-badge.critical { background:#ff4b4b; color:#fff; }
.sz-badge.deny     { background:#ff9f4b; color:#2a1400; }
.sz-badge.challenge{ background:#4ba3ff; color:#fff; }
.sz-badge.allow    { background:#4bd67a; color:#062; }
.sz-badge.killed   { background:#ff4b4b; color:#fff; }
.sz-badge.active   { background:#4bd67a; color:#062; }

.sz-title { font-weight: 650; font-size: 0.95rem; }
.sz-meta  { color: #9aa4b2; font-size: 0.8rem; margin-top: 2px; }
.sz-mono  { font-family: ui-monospace, monospace; color: #c7cdd6; }
.sz-empty { color: #6b7280; font-style: italic; padding: 10px 2px; }

div[data-testid="stMetric"] { background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; padding: 14px 16px; }
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)


def safe_get(path: str, label: str):
    try:
        resp = get(path)
        resp.raise_for_status()
        return resp.json(), True
    except Exception as e:
        st.session_state.setdefault("_errors", []).append(f"{label}: {e}")
        return [], False


def badge(text: str, cls: str) -> str:
    return f'<span class="sz-badge {cls}">{text}</span>'


def decision_cls(decision: str) -> str:
    d = (decision or "").lower()
    return d if d in {"allow", "challenge", "deny", "critical"} else "neutral"


st.session_state["_errors"] = []
sessions, ok1 = safe_get("/api/dashboard/sessions", "sessions")
devices, ok2 = safe_get("/api/dashboard/devices", "devices")
events, ok3 = safe_get("/api/events/recent?limit=200", "events")
pending, ok4 = safe_get("/api/dashboard/pending", "pending")
kill_status, ok5 = safe_get("/api/dashboard/kill-switch-status", "kill-switch status")
server_ok = all([ok1, ok2, ok3, ok4, ok5])

# ---------- HERO ----------
status_cls = "ok" if server_ok else "bad"
status_text = "server online" if server_ok else "server unreachable"
st.markdown(
    f"""
    <div class="sz-hero">
        <h1>🛡️ Sentinel Zero</h1>
        <span class="sz-status {status_cls}"><span class="sz-dot {status_cls}"></span>{status_text}</span>
    </div>
    <div class="sz-sub">Zero Trust Control Plane — continuous posture, permission &amp; behavioral evaluation</div>
    """,
    unsafe_allow_html=True,
)
if not server_ok:
    for err in st.session_state["_errors"]:
        st.error(err)

# ---------- MODE TOGGLE ----------
current_mode = get_mode()
mode_col, spacer = st.columns([2, 5])
with mode_col:
    new_mode = st.radio(
        "OPERATION MODE",
        ["auto", "manual"],
        index=0 if current_mode == "auto" else 1,
        horizontal=True,
    )
if new_mode != current_mode:
    set_mode(new_mode)
    st.rerun()

# ---------- KPI ROW ----------
active_sessions = sum(1 for s in sessions if not s.get("killed"))
active_devices = sum(1 for d in devices if not d.get("killed"))
critical_count = sum(1 for e in events if e.get("decision") == "CRITICAL")

k1, k2, k3, k4 = st.columns(4)
k1.metric("Active Sessions", active_sessions, delta=f"{len(sessions)} total" if sessions else None, delta_color="off")
k2.metric("Devices Online", active_devices, delta=f"{len(devices)} total" if devices else None, delta_color="off")
k3.metric("Pending Approvals", len(pending))
k4.metric("Critical Events", critical_count, delta=None if critical_count == 0 else "needs attention",
          delta_color="inverse" if critical_count else "off")

# ---------- SESSIONS & DEVICES ----------
st.markdown('<div class="sz-section-title">Sessions &amp; Devices</div>', unsafe_allow_html=True)
sess_col, dev_col = st.columns(2)

with sess_col:
    st.caption("SESSIONS")
    with st.container(height=260, border=False):
        if not sessions:
            st.markdown('<div class="sz-empty">no active sessions</div>', unsafe_allow_html=True)
        for s in sessions:
            state = "killed" if s.get("killed") else "active"
            st.markdown(
                f"""
                <div class="sz-card {'critical' if s.get('killed') else 'allow'}">
                  <div class="sz-row">
                    <span class="sz-title">{s['username']} <span class="sz-mono">@ {s.get('device_id') or '?'}</span></span>
                    {badge(state, state)}
                  </div>
                  <div class="sz-meta">token <span class="sz-mono">{s['jti'][:8]}</span> — trust score {s['trust_score']}/100</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

with dev_col:
    st.caption("DEVICES")
    with st.container(height=260, border=False):
        if not devices:
            st.markdown('<div class="sz-empty">no devices reporting yet</div>', unsafe_allow_html=True)
        for d in devices:
            state = "killed" if d.get("killed") else "active"
            st.markdown(
                f"""
                <div class="sz-card {'critical' if d.get('killed') else 'allow'}">
                  <div class="sz-row">
                    <span class="sz-title sz-mono">{d['device_id']}</span>
                    {badge(state, state)}
                  </div>
                  <div class="sz-meta">posture {d['posture_score']}/30 — firewall {d['firewall_status']}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

# ---------- PENDING APPROVALS ----------
st.markdown(f'<div class="sz-section-title">Pending Approvals ({len(pending)})</div>', unsafe_allow_html=True)
if not pending:
    st.markdown('<div class="sz-empty">nothing waiting on admin approval</div>', unsafe_allow_html=True)
for p in pending:
    with st.container(border=True):
        st.markdown(
            f"""
            <div class="sz-row">
              <span class="sz-title">{p['subject']} <span class="sz-meta">requesting</span>
                  <span class="sz-mono">{p['resource_or_permission']}</span></span>
              {badge('score ' + str(p['score']), decision_cls(p['decision']))}
            </div>
            <div class="sz-meta">{p['reason']}</div>
            """,
            unsafe_allow_html=True,
        )
        approve_col, deny_col, _ = st.columns([1, 1, 4])
        if approve_col.button("✅ Approve", key=f"approve-{p['event_id']}", use_container_width=True):
            post("/api/admin/decision", {"event_id": p["event_id"], "admin_decision": "approve"})
            st.rerun()
        if deny_col.button("❌ Deny", key=f"deny-{p['event_id']}", use_container_width=True):
            post("/api/admin/decision", {"event_id": p["event_id"], "admin_decision": "deny"})
            st.rerun()

# ---------- KILL SWITCH ----------
st.markdown('<div class="sz-section-title">Kill Switch</div>', unsafe_allow_html=True)
with st.container(border=True):
    target_col, reason_col, action_col = st.columns([2, 3, 1])
    target = target_col.text_input("Target (device_id / app_id)", label_visibility="collapsed",
                                    placeholder="device_id or app_id")
    reason = reason_col.text_input("Reason", label_visibility="collapsed", value="manual admin action")
    if action_col.button("🔪 Kill", use_container_width=True):
        if target:
            post("/api/admin/kill-switch", {"target": target, "reason": reason})
            st.rerun()

    if kill_status:
        for row in kill_status:
            st.markdown(
                f"""
                <div class="sz-card critical">
                  <div class="sz-row">
                    <span class="sz-title sz-mono">{row['target']}</span>
                    {badge('killed', 'killed')}
                  </div>
                  <div class="sz-meta">{row['reason']}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
    else:
        st.markdown('<div class="sz-empty">no targets killed</div>', unsafe_allow_html=True)

# ---------- EVENT TIMELINE ----------
st.markdown('<div class="sz-section-title">Event Timeline</div>', unsafe_allow_html=True)
with st.container(height=420, border=False):
    if not events:
        st.markdown('<div class="sz-empty">no events yet — start an agent or run an attack demo</div>',
                     unsafe_allow_html=True)
    for e in events:
        cls = decision_cls(e["decision"])
        st.markdown(
            f"""
            <div class="sz-card {cls}">
              <div class="sz-row">
                <span>{badge(e['decision'], cls)} <span class="sz-meta">{e['type']}</span></span>
                <span class="sz-meta">score {e['score']}</span>
              </div>
              <div class="sz-title">{e['subject']} → <span class="sz-mono">{e['resource_or_permission']}</span></div>
              <div class="sz-meta">{e['reason']}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

st.divider()
if st.checkbox("Live auto-refresh (2s)", value=True):
    time.sleep(2)
    st.rerun()
