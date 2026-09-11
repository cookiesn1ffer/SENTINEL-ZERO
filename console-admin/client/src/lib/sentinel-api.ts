import axios from "axios";

const SYS1_URL = import.meta.env.VITE_SYS1_URL || "http://127.0.0.1:8000";
const USERNAME = import.meta.env.VITE_SENTINEL_USERNAME || "admin";
const PASSWORD = import.meta.env.VITE_SENTINEL_PASSWORD || "admin123";

const sys1 = axios.create({ baseURL: SYS1_URL, timeout: 8000 });
const consoleApi = axios.create({ baseURL: "/api/console", timeout: 20000 });

let token: string | null = null;
let tokenExpiresAt = 0;
let loginInFlight: Promise<string> | null = null;

async function getToken(): Promise<string> {
  if (token && Date.now() < tokenExpiresAt - 30_000) return token;
  // Several dashboard reads fire in parallel (Promise.all in useLiveData) —
  // without this guard each would race to log in before the first resolves,
  // minting a fresh session per concurrent caller instead of sharing one.
  if (!loginInFlight) {
    loginInFlight = sys1
      .post("/api/auth/login", { username: USERNAME, password: PASSWORD })
      .then((resp) => {
        token = resp.data.token;
        tokenExpiresAt = Date.now() + (resp.data.expires_in ?? 3600) * 1000;
        return token!;
      })
      .finally(() => {
        loginInFlight = null;
      });
  }
  return loginInFlight;
}

async function authed() {
  return { headers: { Authorization: `Bearer ${await getToken()}` } };
}

// ---------- types ----------

export type Decision = "ALLOW" | "CHALLENGE" | "DENY" | "CRITICAL";

export interface SentinelEvent {
  event_id: string;
  type: string;
  subject: string;
  resource_or_permission: string | null;
  score: number | null;
  decision: Decision;
  reason: string | null;
  mode: string | null;
  timestamp: string;
  pending_admin_action: boolean;
}

export interface SessionRow {
  jti: string;
  username: string;
  device_id: string | null;
  trust_score: number;
  killed: number;
}

export interface DeviceRow {
  device_id: string;
  posture_score: number;
  firewall_status: string;
  killed: number;
}

export interface KillSwitchRow {
  target: string;
  reason: string;
  event_id: string;
  timestamp: string;
}

// ---------- dashboard reads (direct to sys1, CORS is open there) ----------

export async function fetchSessions(): Promise<SessionRow[]> {
  const resp = await sys1.get("/api/dashboard/sessions", await authed());
  return resp.data;
}

export async function fetchDevices(): Promise<DeviceRow[]> {
  const resp = await sys1.get("/api/dashboard/devices", await authed());
  return resp.data;
}

export async function fetchEvents(limit = 100): Promise<SentinelEvent[]> {
  const resp = await sys1.get(`/api/events/recent?limit=${limit}`, await authed());
  return resp.data;
}

export async function fetchPending(): Promise<SentinelEvent[]> {
  const resp = await sys1.get("/api/dashboard/pending", await authed());
  return resp.data;
}

export async function fetchKillSwitchStatus(): Promise<KillSwitchRow[]> {
  const resp = await sys1.get("/api/dashboard/kill-switch-status", await authed());
  return resp.data;
}

// ---------- admin writes (direct to sys1) ----------

export async function adminDecision(eventId: string, decision: "approve" | "deny") {
  const resp = await sys1.post(
    "/api/admin/decision",
    { event_id: eventId, admin_decision: decision },
    await authed(),
  );
  return resp.data;
}

export async function killSwitch(target: string, reason: string) {
  const resp = await sys1.post("/api/admin/kill-switch", { target, reason }, await authed());
  return resp.data;
}

// ---------- manual/auto mode (shared with sys2's agents via the console backend) ----------

export async function fetchMode(): Promise<"auto" | "manual"> {
  const resp = await consoleApi.get("/mode");
  return resp.data.mode;
}

export async function setModeApi(mode: "auto" | "manual") {
  const resp = await consoleApi.post("/mode", { mode });
  return resp.data.mode as "auto" | "manual";
}

// ---------- attack demos (real backend actions) ----------

export interface Attack1Result {
  opened: number[];
  postureScore: number;
  before: { decision: Decision; score: number; reason: string };
  after: { decision: Decision; score: number; reason: string };
}

export async function runAttack1(): Promise<Attack1Result> {
  const resp = await consoleApi.post("/attack1/run");
  return resp.data;
}

export async function resetAttack1() {
  const resp = await consoleApi.post("/attack1/reset");
  return resp.data;
}

export interface Attack2Result {
  first: { decision: Decision; score: number; reason: string };
  second: { decision: Decision; score: number; reason: string };
}

export async function runAttack2(): Promise<Attack2Result> {
  const resp = await consoleApi.post("/attack2/run");
  return resp.data;
}

export interface Attack3Result {
  result: { decision: Decision; score: number; reason: string };
  killStatus: KillSwitchRow[];
}

export async function runAttack3(): Promise<Attack3Result> {
  const resp = await consoleApi.post("/attack3/run");
  return resp.data;
}
