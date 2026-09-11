import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Ban,
  Bell,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Database,
  Eye,
  Fingerprint,
  Globe2,
  KeyRound,
  Laptop,
  LayoutDashboard,
  Loader2,
  Menu,
  Network,
  Pause,
  Play,
  Search,
  Server,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  TerminalSquare,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  type Attack1Result,
  type Attack2Result,
  type Attack3Result,
  type Decision,
  type DeviceRow,
  fetchDevices,
  fetchEvents,
  fetchMode,
  fetchSessions,
  resetAttack1,
  runAttack1,
  runAttack2,
  runAttack3,
  type SentinelEvent,
  type SessionRow,
} from "@/lib/sentinel-api";

type NavItem = { label: string; icon: LucideIcon };

const navItems: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "My device", icon: Laptop },
  { label: "Attack lab", icon: TerminalSquare },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function decisionTone(decision: Decision): "cyan" | "amber" | "red" {
  if (decision === "ALLOW") return "cyan";
  if (decision === "CHALLENGE") return "amber";
  return "red"; // DENY or CRITICAL
}

function decisionIcon(decision: Decision): LucideIcon {
  if (decision === "ALLOW") return Check;
  if (decision === "CHALLENGE") return Globe2;
  if (decision === "CRITICAL") return ShieldAlert;
  return Ban;
}

function timeLabel(ts: string): string {
  const n = Number(ts);
  const date = Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ---------------------------------------------------------------------------
// live data hook — read-only monitoring, polls sys1 every 3s
// ---------------------------------------------------------------------------

function useLiveData(paused: boolean) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [events, setEvents] = useState<SentinelEvent[]>([]);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<number>(Date.now());

  const refresh = useCallback(async () => {
    try {
      const [s, d, e] = await Promise.all([fetchSessions(), fetchDevices(), fetchEvents(200)]);
      setSessions(s);
      setDevices(d);
      setEvents(e);
      setOnline(true);
      setLastSync(Date.now());
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (paused) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [paused, refresh]);

  return { sessions, devices, events, online, lastSync, refresh };
}

function useMode() {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  useEffect(() => {
    const poll = () => fetchMode().then(setMode).catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);
  return mode;
}

// ---------------------------------------------------------------------------
// small shared pieces
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="section-label">{children}</div>;
}

function StatusPill({ children, tone = "cyan" }: { children: React.ReactNode; tone?: "cyan" | "amber" | "red" | "muted" }) {
  return (
    <span className={cn("status-pill", `pill-${tone}`)}>
      <span className="pill-dot" />
      {children}
    </span>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone = "cyan" }: { label: string; value: string; note: string; icon: LucideIcon; tone?: "cyan" | "amber" | "red" }) {
  return (
    <div className="metric-card group">
      <div className="metric-topline">
        <div className={cn("metric-icon", `tone-${tone}`)}>
          <Icon size={16} strokeWidth={1.7} />
        </div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}

function PostureRing({ score }: { score: number | null }) {
  const display = score === null ? "--" : String(Math.round(score));
  const healthy = score !== null && score >= 70;
  return (
    <div className="posture-ring-wrap">
      <div className="posture-ring">
        <div className="posture-ring-inner">
          <span>{display}</span>
          <small>/ 100</small>
        </div>
      </div>
      <div className="ring-caption">
        <span className={cn("status-dot", healthy ? "dot-cyan" : "dot-amber")} />
        {score === null ? "No devices reporting" : healthy ? "Healthy posture" : "Degraded posture"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// shell
// ---------------------------------------------------------------------------

function LogoMark() {
  return (
    <div className="logo-mark" aria-hidden="true">
      <span className="logo-ring" />
      <span className="logo-core" />
      <span className="logo-cut" />
    </div>
  );
}

function Sidebar({
  active,
  onSelect,
  mobileOpen,
  onClose,
  online,
  lastSync,
}: {
  active: string;
  onSelect: (label: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
  online: boolean;
  lastSync: number;
}) {
  const secondsAgo = Math.max(0, Math.round((Date.now() - lastSync) / 1000));
  return (
    <aside className={cn("sidebar", mobileOpen && "sidebar-open")}>
      <div className="brand-row">
        <LogoMark />
        <div>
          <div className="brand-name">
            SENTINEL<span>_</span>ZERO
          </div>
          <div className="brand-sub">worker console</div>
        </div>
        <button className="icon-button mobile-close" onClick={onClose} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>
      <div className="workspace-switcher">
        <div className="workspace-avatar">K</div>
        <div className="workspace-copy">
          <span>Kurukshetra 2.0</span>
          <small>Domain 2 · Cybersecurity</small>
        </div>
        <ChevronDown size={15} />
      </div>
      <SectionLabel>Agent</SectionLabel>
      <nav className="nav-list" aria-label="Main navigation">
        {navItems.map(({ label, icon: Icon }) => (
          <button key={label} className={cn("nav-item", active === label && "nav-active")} onClick={() => { onSelect(label); onClose(); }}>
            <Icon size={17} strokeWidth={active === label ? 2 : 1.6} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <SectionLabel>System</SectionLabel>
      <nav className="nav-list">
        <button className="nav-item" onClick={() => toast.info("Agent scripts live in sys2/agent.")}>
          <SlidersHorizontal size={17} />
          <span>Agent config</span>
        </button>
        <button className="nav-item" onClick={() => toast.info("See README.md at the repo root.")}>
          <CircleHelp size={17} />
          <span>Documentation</span>
        </button>
      </nav>
      <div className="sidebar-footer">
        <div className="agent-status">
          <span className={cn("status-dot", online ? "dot-cyan pulse" : "dot-red")} />
          <div>
            <strong>{online ? "Policy engine reachable" : "Policy engine unreachable"}</strong>
            <small>synced {secondsAgo}s ago</small>
          </div>
        </div>
        <div className="user-row">
          <div className="user-avatar">S</div>
          <div>
            <strong>this device</strong>
            <small>Employee session</small>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  active,
  onMobileMenu,
  mode,
  online,
}: {
  active: string;
  onMobileMenu: () => void;
  mode: "auto" | "manual";
  online: boolean;
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button mobile-menu" onClick={onMobileMenu} aria-label="Open navigation">
          <Menu size={19} />
        </button>
        <div className="breadcrumbs">
          <span>Worker</span>
          <span className="crumb-slash">/</span>
          <strong>{active}</strong>
        </div>
      </div>
      <div className="topbar-actions">
        <StatusPill tone={mode === "manual" ? "amber" : "cyan"}>mode: {mode}</StatusPill>
        <span className={cn("server-pill", online ? "pill-online" : "pill-offline")}>
          <span className="pill-dot" />
          {online ? "sys1 online" : "sys1 unreachable"}
        </span>
        <button className="command-trigger" onClick={() => toast.info("Command palette not wired up in this build.")}>
          <Search size={15} />
          <span>Search anything</span>
          <kbd>
            <Command size={11} />K
          </kbd>
        </button>
        <button className="icon-button notification-button" onClick={() => toast.success("No new alerts.")} aria-label="Notifications">
          <Bell size={17} />
        </button>
        <div className="topbar-date">
          <Clock3 size={14} /> {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// overview panels
// ---------------------------------------------------------------------------

function EventStream({ events, paused, onToggle }: { events: SentinelEvent[]; paused: boolean; onToggle: () => void }) {
  const rows = events.slice(0, 8);
  return (
    <div className="panel event-panel">
      <div className="panel-heading">
        <div>
          <SectionLabel>Live telemetry</SectionLabel>
          <h2>What just happened</h2>
        </div>
        <button className="stream-toggle" onClick={onToggle}>
          {paused ? <Play size={13} /> : <Pause size={13} />}
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <div className="event-list">
        {rows.length === 0 && <div className="pending-empty">No events yet — run something from the Attack lab below.</div>}
        {rows.map((event) => {
          const tone = decisionTone(event.decision);
          const Icon = decisionIcon(event.decision);
          return (
            <div className={cn("event-row", paused && "event-paused")} key={event.event_id}>
              <div className={cn("event-icon", `event-${tone}`)}>
                <Icon size={15} />
              </div>
              <div className="event-content">
                <div className="event-title">
                  {event.decision === "CRITICAL" && <StatusPill tone="red">CRITICAL</StatusPill>} {event.subject} → {event.resource_or_permission ?? "—"}
                </div>
                <div className="event-detail">{event.reason ?? `score ${event.score}`}</div>
              </div>
              <time>{timeLabel(event.timestamp)}</time>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyDevicePanel({ devices }: { devices: DeviceRow[] }) {
  return (
    <div className="panel policy-panel">
      <div className="panel-heading">
        <div>
          <SectionLabel>Posture</SectionLabel>
          <h2>My device</h2>
        </div>
      </div>
      <div className="policy-list">
        {devices.length === 0 && <div className="pending-empty">No posture reported yet — start the posture agent.</div>}
        {devices.map((d) => {
          const color = d.killed ? "red" : d.posture_score >= 20 ? "cyan" : "amber";
          return (
            <div className="policy-row" key={d.device_id}>
              <div className={cn("policy-status", `policy-${color}`)}>
                <span />
              </div>
              <div className="policy-name">
                <strong>{d.device_id}</strong>
                <small>firewall {d.firewall_status}</small>
              </div>
              <StatusPill tone={d.killed ? "red" : color === "cyan" ? "cyan" : "amber"}>{d.killed ? "Killed by admin" : "Active"}</StatusPill>
              <div className="coverage">
                <div className="coverage-track">
                  <span style={{ width: `${Math.round((d.posture_score / 30) * 100)}%` }} className={`coverage-${color}`} />
                </div>
                <small>{Math.round((d.posture_score / 30) * 100)}%</small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttackLab({
  running,
  rogueOpen,
  onAttack1,
  onReset1,
  onAttack2,
  onAttack3,
}: {
  running: { 1: boolean; 2: boolean; 3: boolean };
  rogueOpen: boolean;
  onAttack1: () => void;
  onReset1: () => void;
  onAttack2: () => void;
  onAttack3: () => void;
}) {
  return (
    <div className="panel attack-panel">
      <div className="attack-glow" />
      <div className="panel-heading">
        <div>
          <SectionLabel>Simulation environment</SectionLabel>
          <h2>Attack lab</h2>
        </div>
        <StatusPill tone="amber">3 scenarios</StatusPill>
      </div>
      <p className="attack-copy">Runs real signals against the live policy engine from this device — real sockets, a real token replay, a real manifest violation. No production traffic touched.</p>
      <div className="attack-scenarios">
        <div className="scenario-row">
          <div className="scenario-number">01</div>
          <div>
            <strong>Port exposure</strong>
            <small>network boundary</small>
          </div>
          {running[1] ? (
            <Loader2 size={14} className="spin" />
          ) : rogueOpen ? (
            <button className="scenario-run-btn reset-btn" onClick={onReset1}>
              Close sockets
            </button>
          ) : (
            <button className="scenario-run-btn" onClick={onAttack1}>
              Run
            </button>
          )}
        </div>
        <div className="scenario-row">
          <div className="scenario-number">02</div>
          <div>
            <strong>Impossible travel</strong>
            <small>identity anomaly · ~5s</small>
          </div>
          {running[2] ? <Loader2 size={14} className="spin" /> : (
            <button className="scenario-run-btn" onClick={onAttack2}>
              Run
            </button>
          )}
        </div>
        <div className="scenario-row">
          <div className="scenario-number scenario-warn">03</div>
          <div>
            <strong>Manifest violation</strong>
            <small>service posture</small>
          </div>
          {running[3] ? <Loader2 size={14} className="spin" /> : (
            <button className="scenario-run-btn warn" onClick={onAttack3}>
              Run
            </button>
          )}
        </div>
      </div>
      <div className="footnote">
        <span>
          <Database size={13} /> sys1 policy engine, live
        </span>
        <span>
          <Bot size={13} /> console-backend <span className="status-dot dot-cyan" />
        </span>
      </div>
    </div>
  );
}

function Overview({
  data,
  mode,
  paused,
  onToggleStream,
  running,
  rogueOpen,
  onAttack1,
  onReset1,
  onAttack2,
  onAttack3,
}: {
  data: ReturnType<typeof useLiveData>;
  mode: "auto" | "manual";
  paused: boolean;
  onToggleStream: () => void;
  running: { 1: boolean; 2: boolean; 3: boolean };
  rogueOpen: boolean;
  onAttack1: () => void;
  onReset1: () => void;
  onAttack2: () => void;
  onAttack3: () => void;
}) {
  const { sessions, devices, events } = data;

  const allowCount = events.filter((e) => e.decision === "ALLOW").length;
  const threatCount = events.filter((e) => e.decision === "DENY" || e.decision === "CRITICAL").length;
  const activeSessions = sessions.filter((s) => !s.killed).length;

  const avgPosture = useMemo(() => {
    if (devices.length === 0) return null;
    const sum = devices.reduce((acc, d) => acc + d.posture_score, 0);
    return Math.round((sum / devices.length / 30) * 100);
  }, [devices]);

  return (
    <div className="page-content">
      <div className="hero-row">
        <div>
          <div className="eyebrow">
            <span className="status-dot dot-cyan pulse" /> Worker console / live
          </div>
          <h1>
            My device<span className="heading-period">.</span>
          </h1>
          <p className="hero-copy">
            This device is continuously evaluated by Sentinel Zero. Currently in <strong>{mode.toUpperCase()}</strong> mode.
          </p>
        </div>
        <button className="primary-action" onClick={() => toast.success("Refreshing...") || data.refresh()}>
          <Eye size={16} /> Refresh now <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="metric-grid">
        <MetricCard label="Requests evaluated" value={String(events.length)} note="most recent window" icon={Fingerprint} />
        <MetricCard label="Access granted" value={String(allowCount)} note={events.length ? `${Math.round((allowCount / events.length) * 100)}% of requests` : "—"} icon={Shield} />
        <MetricCard label="Blocked / flagged" value={String(threatCount)} note="DENY + CRITICAL" icon={Ban} tone="red" />
        <MetricCard label="Active sessions" value={String(activeSessions)} note={`${sessions.length} total`} icon={KeyRound} />
      </div>
      <div className="main-grid">
        <div className="panel posture-panel" style={{ gridColumn: 1 }}>
          <div className="panel-heading">
            <div>
              <SectionLabel>System posture</SectionLabel>
              <h2>Trust score</h2>
            </div>
          </div>
          <PostureRing score={avgPosture} />
          <div className="posture-factors">
            <div>
              <span className="factor-icon">
                <Server size={14} />
              </span>
              <span>Devices online</span>
              <strong>{devices.filter((d) => !d.killed).length}</strong>
            </div>
            <div>
              <span className="factor-icon">
                <Network size={14} />
              </span>
              <span>Threats blocked</span>
              <strong>{threatCount}</strong>
            </div>
          </div>
        </div>
        <MyDevicePanel devices={devices} />
        <EventStream events={events} paused={paused} onToggle={onToggleStream} />
        <AttackLab running={running} rogueOpen={rogueOpen} onAttack1={onAttack1} onReset1={onReset1} onAttack2={onAttack2} onAttack3={onAttack3} />
      </div>
    </div>
  );
}

function PlaceholderPage({ title, icon: Icon, description }: { title: string; icon: LucideIcon; description: string }) {
  return (
    <div className="page-content placeholder-page">
      <div className="placeholder-icon">
        <Icon size={26} />
      </div>
      <div className="eyebrow">
        <span className="status-dot dot-cyan" /> Sentinel module
      </div>
      <h1>
        {title}
        <span className="heading-period">.</span>
      </h1>
      <p>{description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// root
// ---------------------------------------------------------------------------

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const data = useLiveData(paused);
  const mode = useMode();
  const [running, setRunning] = useState<{ 1: boolean; 2: boolean; 3: boolean }>({ 1: false, 2: false, 3: false });
  const [rogueOpen, setRogueOpen] = useState(false);

  const errMsg = (e: any) => {
    // The console backend forwards sys1's error body as-is under `.error`.
    // sys1 (FastAPI) shapes errors as { detail: string | [...] }, not
    // { reason }, so this has to actually unwrap that rather than assume a
    // shape — otherwise String(someObject) silently renders "[object Object]".
    const inner = e?.response?.data?.error ?? e?.response?.data;
    if (typeof inner === "string") return inner;
    if (inner?.detail) return typeof inner.detail === "string" ? inner.detail : JSON.stringify(inner.detail);
    if (inner?.reason) return String(inner.reason);
    if (inner && typeof inner === "object") {
      try {
        return JSON.stringify(inner);
      } catch {
        /* fall through */
      }
    }
    return e?.message ?? String(e);
  };

  async function handleAttack1() {
    setRunning((r) => ({ ...r, 1: true }));
    try {
      const res: Attack1Result = await runAttack1();
      setRogueOpen(true);
      toast.success("Attack 1 — port exposure", {
        description: `Rogue ports opened: ${res.opened.join(", ")}. Posture ${res.postureScore}/30. Browser baseline: ${res.before.decision} (${res.before.score}) → ${res.after.decision} (${res.after.score}).`,
      });
      data.refresh();
    } catch (e) {
      toast.error("Attack 1 failed", { description: errMsg(e) });
    } finally {
      setRunning((r) => ({ ...r, 1: false }));
    }
  }

  async function handleReset1() {
    try {
      await resetAttack1();
      setRogueOpen(false);
      toast.info("Rogue sockets closed");
      data.refresh();
    } catch (e) {
      toast.error("Could not close rogue sockets", { description: errMsg(e) });
    }
  }

  async function handleAttack2() {
    setRunning((r) => ({ ...r, 2: true }));
    try {
      const res: Attack2Result = await runAttack2();
      toast.success("Attack 2 — impossible travel", {
        description: `Pune: ${res.first.decision} (${res.first.score}) → Singapore 5s later: ${res.second.decision} (${res.second.score}). ${res.second.reason}`,
      });
      data.refresh();
    } catch (e) {
      toast.error("Attack 2 failed", { description: errMsg(e) });
    } finally {
      setRunning((r) => ({ ...r, 2: false }));
    }
  }

  async function handleAttack3() {
    setRunning((r) => ({ ...r, 3: true }));
    try {
      const res: Attack3Result = await runAttack3();
      toast.error("Attack 3 — manifest violation", {
        description: `notes → network: ${res.result.decision}. ${res.killStatus.length ? `Kill-switch fired on ${res.killStatus[0].target}.` : ""}`,
      });
      data.refresh();
    } catch (e) {
      toast.error("Attack 3 failed", { description: errMsg(e) });
    } finally {
      setRunning((r) => ({ ...r, 3: false }));
    }
  }

  const page =
    active === "Overview" || active === "My device" || active === "Attack lab" ? (
      <Overview
        data={data}
        mode={mode}
        paused={paused}
        onToggleStream={() => setPaused((v) => !v)}
        running={running}
        rogueOpen={rogueOpen}
        onAttack1={handleAttack1}
        onReset1={handleReset1}
        onAttack2={handleAttack2}
        onAttack3={handleAttack3}
      />
    ) : (
      <PlaceholderPage title={active} icon={LayoutDashboard} description="Not wired up in this build." />
    );

  return (
    <div className="console-shell">
      <div className="noise-layer" />
      <Sidebar active={active} onSelect={setActive} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} online={data.online} lastSync={data.lastSync} />
      <main className="main-shell">
        <TopBar active={active} onMobileMenu={() => setMobileOpen(true)} mode={mode} online={data.online} />
        {page}
      </main>
      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}
    </div>
  );
}
