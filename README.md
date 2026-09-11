# Sentinel Zero

Zero Trust access-control engine built for **Kurukshetra 2.0** (Domain 2 — Cybersecurity).

Every request — human or app — is continuously re-evaluated against device posture, behavioral context, and declared permissions. Nothing is trusted once and forgotten; a session that looked fine 10 seconds ago can be challenged or denied on the next request if the signals around it change.

## Architecture

Two systems, built in parallel against a frozen API contract:

```
┌─────────────────────┐         ┌──────────────────────────┐
│   sys2 (System 2)    │  HTTP   │    sys1 (System 1)        │
│  Agent + Dashboard    │ ──────▶ │  Core Engine & PEP         │
│  + Attack Demos       │ ◀────── │  (Policy Enforcement Point)│
└─────────────────────┘  JSON    └──────────────────────────┘
```

- **`sys1/` — Core Engine & Policy Enforcement Point.** Owns auth (JWT issuing), trust/posture scoring, app-manifest matching, and the event/audit log. This is the only source of truth for ALLOW / CHALLENGE / DENY / CRITICAL decisions.
- **`sys2/` — Agent, Dashboard & Attack Demos.** Collects real device signals, sends them to System 1, and renders whatever comes back. Owns no scoring logic — it's a signal producer and a decision renderer.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Policy engine API | **Python 3 + FastAPI** | fast to scaffold, async, auto-generated OpenAPI docs at `/docs` |
| Policy engine storage | **SQLite** | zero-setup persistence, plenty for a hackathon's session/event volume |
| Auth | **PyJWT + bcrypt** | short-lived signed tokens; passwords hashed, never stored in plaintext |
| Device agent | **Python + psutil** | real listening-port scans, no OS-specific agent framework needed |
| Dashboard | **Streamlit** | live-updating admin UI without building a separate frontend |
| Agent ↔ server transport | **`requests`, plain JSON over HTTP** | matches the frozen API contract exactly |

No JS frontend, no message queue, no external DB — deliberately minimal for a 24–48hr build.

## How decisions are made

Every permission request gets a **0–100 score**:

```
score = risk_tier_base(app)  −  20 × (# conditional perms needing approval)  +  (posture_score − 15)
```

| Score | Decision |
|---|---|
| ≥ 70 | ALLOW |
| 40–69 | CHALLENGE |
| < 40 | DENY |
| requested permission not declared anywhere in the app's manifest | **CRITICAL** (score band is irrelevant — this is an automatic manifest violation, kill-switch fires immediately) |

Device posture itself is a **0–30** signal: starts at 30, −15 if the firewall is off, up to −20 for unusual open listening ports (excluding known-safe ports like 80/443 and Sentinel Zero's own control-plane port).

### App manifests (who's allowed to ask for what)

| App | Baseline (always OK) | Conditional (needs approval unless marked auto) | Risk tier |
|---|---|---|---|
| `notes` | — | `multi_app_context` (auto-approved) | low |
| `browser` | `network`, `dns` | `camera` (needs approval) | high |
| `music` | `audio`, `network` | — | medium |
| `document_editor` | — | `network` (needs approval, e.g. cloud sync) | medium |

Anything an app requests outside baseline + conditional = **CRITICAL**, because that's a manifest violation, not a policy judgment call.

## API contract (System 1)

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | issue a JWT |
| `POST /api/agent/posture` | report device posture, get back the 0–30 posture score |
| `POST /api/agent/permission-request` | app requests permissions, get back ALLOW/CHALLENGE/DENY/CRITICAL |
| `POST /api/access/request` | generic continuous-authorization check for an already-issued token (drives the impossible-travel demo) |
| `POST /api/admin/decision` | admin approves/denies a pending CHALLENGE |
| `POST /api/admin/kill-switch` | admin (or the server itself, on CRITICAL) kills a device/app |
| `GET /api/events/recent` / `GET /api/events/stream` | unified event feed (polling or SSE) |
| `GET /api/dashboard/*` | sessions, devices, pending approvals, kill-switch status — dashboard reads |

Full request/response shapes live in `sys1/app/models.py`.

## Attack demos (System 2)

Three scripted, runnable-on-cue demos, each hitting the real server with real signals:

1. **Port exposure** (`sys2/attacks/attack1_port_exposure.py`) — opens real rogue listening sockets, posture score craters, a subsequent request flips from ALLOW to CHALLENGE.
2. **Impossible travel** (`sys2/attacks/attack2_impossible_travel.py`) — replays the same JWT tagged with two geos 5 seconds apart → DENY, flagged as a behavioral anomaly.
3. **Manifest violation** (`sys2/attacks/attack3_manifest_violation.py`) — the `notes` app suddenly requests `network`, which isn't in its manifest at all → CRITICAL, automatic kill-switch.

This is manifest/behavioral-deviation detection, **not** malware analysis or real process-injection detection — keep that framing in the pitch.

## Web consoles

Two separate React/Vite apps, split by who's meant to use them:

- **`console-admin/`** — approvals & monitoring only. Sessions, devices, the unified event timeline, the manual/auto mode toggle, the Pending Approvals queue (approve/deny), and the kill switch. No attack triggers here.
- **`console-worker/`** — the device/agent side. Live posture + event feed for "this device," and the Attack Lab with one-click buttons for all 3 attack demos. No admin powers (no approve/deny, no kill switch) — mode is shown read-only.

Both are thin clients: all scoring/matching logic still lives in `sys1`. Each console has its own small Express backend (`server/`) whose only job is things a browser can't do itself — opening real listening sockets for attack 1, and reading/writing the shared manual/auto mode flag (`sys2/.mode_state.json`, the same file `sys2`'s Python agents read). Everything else (sessions, devices, events, admin actions) is a direct browser call to `sys1`, which already allows CORS from anywhere.

## Repo structure

```
sentinel-zero-sys1/
├── sys1/                      # Core Engine & PEP (FastAPI + SQLite)
│   ├── app/
│   │   ├── main.py            # routes
│   │   ├── auth.py            # JWT issuing + session dependency
│   │   ├── scoring.py         # posture + permission-request scoring
│   │   ├── manifests.py       # app manifest definitions (source of truth)
│   │   ├── db.py              # SQLite schema + queries
│   │   ├── models.py          # request/response schemas
│   │   └── config.py
│   └── requirements.txt
│
├── sys2/                      # Agent, Dashboard & Attack Demos
│   ├── shared/
│   │   ├── client.py          # login + token cache + HTTP helpers
│   │   ├── posture.py         # real psutil posture reads
│   │   ├── mode_state.py      # shared manual/auto flag (local file)
│   │   └── manifests_ref.py   # hand-synced copy of sys1's manifests
│   ├── agent/
│   │   ├── posture_agent.py   # reports posture on a loop
│   │   └── app_monitor.py     # detects/simulates app permission traffic
│   ├── dashboard/
│   │   └── dashboard.py       # Streamlit admin UI
│   ├── attacks/
│   │   ├── attack1_port_exposure.py
│   │   ├── attack2_impossible_travel.py
│   │   └── attack3_manifest_violation.py
│   └── requirements.txt
│
├── console-admin/              # Web console: approvals & monitoring (Aarush)
│   ├── client/src/pages/Home.tsx
│   ├── client/src/lib/sentinel-api.ts   # sys1 client + token cache
│   └── server/                 # Express backend (mode flag; attack routes unused by this UI)
│
├── console-worker/             # Web console: device/agent + attack lab (Sourabh)
│   ├── client/src/pages/Home.tsx
│   ├── client/src/lib/sentinel-api.ts
│   └── server/                 # Express backend: real rogue-socket open/close + attack routes
│
└── .gitignore
```

## Running it

### One-click launchers (recommended)

```bash
./scripts/start-all.sh       # everything: sys1 + both web consoles
./scripts/start-system1.sh   # sys1 + admin console only (Aarush's side)
./scripts/start-system2.sh   # sys1 + worker console only (Sourabh's side)
./scripts/stop-all.sh        # stop everything
```

Each script installs missing deps on first run (Python venv, `pnpm install`), is idempotent (safe to re-run — skips anything already up), and logs to `.sentinel-logs/`. `start-system1.sh` and `start-system2.sh` both bring up `sys1` if it isn't already running, since both consoles depend on it; running both scripts back to back just adds whatever's missing rather than double-starting anything.

URLs once up: sys1 docs `http://127.0.0.1:8000/docs`, admin console `http://localhost:3000`, worker console `http://localhost:3010`. Default login for both consoles: `admin` / `admin123`.

### Manual / step-by-step

**1. Start the policy engine:**
```bash
cd sys1
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt   # first time only
./venv/bin/uvicorn app.main:app --port 8000
```
Default login: `admin` / `admin123`. API docs at `http://127.0.0.1:8000/docs`.

**2. Start the dashboard:**
```bash
cd sys2
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt   # first time only
./venv/bin/streamlit run dashboard/dashboard.py
```
Opens at `http://localhost:8501`.

**3. (Optional) start background agents** for live traffic:
```bash
./venv/bin/python agent/posture_agent.py
./venv/bin/python agent/app_monitor.py
```

**4. Run an attack demo on cue:**
```bash
./venv/bin/python attacks/attack1_port_exposure.py
./venv/bin/python attacks/attack2_impossible_travel.py
./venv/bin/python attacks/attack3_manifest_violation.py
```

Toggle **Manual / Auto** mode from the dashboard sidebar — in manual mode, CHALLENGE decisions wait for an admin approve/deny in the Pending Approvals panel instead of resolving automatically.

**5. Start the web consoles** (each needs its own backend + frontend, `pnpm install` on first run):
```bash
cd console-admin
pnpm install                          # first time only
pnpm dev:api                          # backend on :3001
pnpm dev                              # frontend on :3000, in another terminal

cd console-worker
pnpm install                          # first time only
pnpm dev:api                          # backend on :3011
pnpm dev                              # frontend on :3010, in another terminal
```
Admin console: `http://localhost:3000`. Worker console: `http://localhost:3010`. Both can run at the same time as everything above — they're just alternate UIs onto the same `sys1` server.

## Config (env vars, all optional)

| Variable | Default | Used by |
|---|---|---|
| `SENTINEL_SERVER_URL` | `http://127.0.0.1:8000` | sys2 (all scripts) |
| `SENTINEL_USERNAME` / `SENTINEL_PASSWORD` | `admin` / `admin123` | sys2 (all scripts) |
| `SENTINEL_DEVICE_ID` | machine hostname | sys2 (all scripts) |
| `SENTINEL_JWT_SECRET` | dev default — change before any real deployment | sys1 |
| `SENTINEL_ADMIN_PASSWORD` | `admin123` | sys1 |
| `SENTINEL_TOKEN_EXPIRE_SECONDS` | `3600` | sys1 |
| `SENTINEL_IMPOSSIBLE_TRAVEL_WINDOW` | `60` (seconds) | sys1 |
