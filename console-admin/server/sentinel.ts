import axios from "axios";
import { exec } from "child_process";
import fs from "fs";
import { hostname } from "os";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const execAsync = promisify(exec);

export const SYS1_URL = process.env.SENTINEL_SERVER_URL || "http://127.0.0.1:8000";
const USERNAME = process.env.SENTINEL_USERNAME || "admin";
const PASSWORD = process.env.SENTINEL_PASSWORD || "admin123";
export const DEVICE_ID = process.env.SENTINEL_DEVICE_ID || hostname();

const sys1 = axios.create({ baseURL: SYS1_URL, timeout: 8000 });

let token: string | null = null;
let tokenExpiresAt = 0;

let loginInFlight: Promise<string> | null = null;

async function getToken(force = false): Promise<string> {
  if (token && !force && Date.now() < tokenExpiresAt - 30_000) return token;
  if (!force && loginInFlight) return loginInFlight;

  // Deliberately NOT passing device_id here: this is the backend's own
  // control-plane session, used for every call it makes to sys1. If it were
  // tied to DEVICE_ID, killing that device (attack 1 / attack 3) would also
  // kill this session server-side — every subsequent call would 403 with no
  // way to recover short of restarting the process.
  const login = sys1
    .post("/api/auth/login", { username: USERNAME, password: PASSWORD })
    .then((resp) => {
      token = resp.data.token;
      tokenExpiresAt = Date.now() + (resp.data.expires_in ?? 3600) * 1000;
      return token!;
    })
    .finally(() => {
      loginInFlight = null;
    });

  if (!force) loginInFlight = login;
  return login;
}

async function authed() {
  return { headers: { Authorization: `Bearer ${await getToken()}` } };
}

// Wraps a sys1 call so a 403 (e.g. this session got killed some other way)
// forces one fresh login and retries once, instead of failing outright.
async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e?.response?.status === 403) {
      await getToken(true);
      return await fn();
    }
    throw e;
  }
}

export async function postureRead() {
  const openPorts = await scanListeningPorts();
  const firewallStatus = await firewallStatus_();
  return {
    device_id: DEVICE_ID,
    open_ports: openPorts,
    firewall_status: firewallStatus,
    os_platform: process.platform,
    local_time: new Date().toISOString(),
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
}

async function scanListeningPorts(): Promise<number[]> {
  try {
    const { stdout } = await execAsync("ss -tln");
    const ports = new Set<number>();
    for (const line of stdout.split("\n")) {
      const match = line.match(/:(\d+)\s+\d+\.\d+\.\d+\.\d+:\*\s*$/) || line.match(/:(\d+)\s*$/);
      if (match) ports.add(Number(match[1]));
    }
    return Array.from(ports)
      .filter((p) => !Number.isNaN(p))
      .sort((a, b) => a - b);
  } catch {
    return roguePorts.slice();
  }
}

async function firewallStatus_(): Promise<"on" | "off"> {
  for (const svc of ["ufw", "firewalld"]) {
    try {
      const { stdout } = await execAsync(`systemctl is-active ${svc}`);
      if (stdout.trim() === "active") return "on";
    } catch {
      /* service not present/active — keep checking */
    }
  }
  return "on"; // best-effort default, matches sys2's Python agent
}

// --- attack 1: port exposure — real listening sockets, opened by this process ---

const roguePorts = [4444, 6666, 9001, 13337, 31337];
let rogueServers: net.Server[] = [];

export function rogueSocketsOpen(): boolean {
  return rogueServers.length > 0;
}

export async function openRogueSockets(): Promise<number[]> {
  closeRogueSockets();
  const opened: number[] = [];
  for (const port of roguePorts) {
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer();
      server.on("error", reject);
      server.listen(port, "127.0.0.1", () => {
        rogueServers.push(server);
        opened.push(port);
        resolve();
      });
    }).catch(() => {
      /* port unavailable — skip it, not fatal for the demo */
    });
  }
  return opened;
}

export function closeRogueSockets(): number {
  const count = rogueServers.length;
  for (const s of rogueServers) s.close();
  rogueServers = [];
  return count;
}

// --- generic sys1 calls used by the attack routes ---

export async function requestBrowserBaseline(posture: Awaited<ReturnType<typeof postureRead>>) {
  const body = {
    app_id: "browser",
    requested_permissions: ["network", "dns"],
    device_posture: posture,
    mode: await currentMode(),
    timestamp: posture.timestamp,
  };
  const resp = await withAuthRetry(async () => sys1.post("/api/agent/permission-request", body, await authed()));
  return resp.data;
}

export async function reportPosture(posture: Awaited<ReturnType<typeof postureRead>>) {
  const resp = await withAuthRetry(async () => sys1.post("/api/agent/posture", posture, await authed()));
  return resp.data;
}

export async function accessRequest(geo: string) {
  const resp = await withAuthRetry(async () => sys1.post("/api/access/request", { resource: "/reports/sensitive", geo }, await authed()));
  return resp.data;
}

export async function manifestViolationRequest() {
  const posture = await postureRead();
  const body = {
    app_id: "notes",
    requested_permissions: ["network"],
    device_posture: posture,
    mode: await currentMode(),
    timestamp: posture.timestamp,
  };
  const resp = await withAuthRetry(async () => sys1.post("/api/agent/permission-request", body, await authed()));
  return resp.data;
}

export async function killSwitchStatus() {
  const resp = await withAuthRetry(async () => sys1.get("/api/dashboard/kill-switch-status", await authed()));
  return resp.data;
}

export async function forceFreshToken() {
  return getToken(true);
}

// --- shared manual/auto mode flag. Same JSON file sys2's Python agents
// (shared/mode_state.py) read/write, so toggling mode in the console also
// affects posture_agent.py / app_monitor.py if they're running alongside it.
const MODE_FILE =
  process.env.SENTINEL_MODE_FILE || path.resolve(__dirname, "..", "..", "sys2", ".mode_state.json");

export async function currentMode(): Promise<"auto" | "manual"> {
  try {
    const raw = fs.readFileSync(MODE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.mode === "manual" ? "manual" : "auto";
  } catch {
    return "auto";
  }
}

export function setMode(next: "auto" | "manual") {
  fs.writeFileSync(MODE_FILE, JSON.stringify({ mode: next }));
}
