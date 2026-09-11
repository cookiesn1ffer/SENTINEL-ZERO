import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Ban,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Eye,
  Fingerprint,
  Globe2,
  KeyRound,
  Laptop,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Network,
  Pause,
  Play,
  Search,
  Server,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  adminDecision,
  type Decision,
  type DeviceRow,
  fetchDevices,
  fetchEvents,
  fetchKillSwitchStatus,
  fetchMode,
  fetchPending,
  fetchSessions,
  type KillSwitchRow,
  killSwitch as killSwitchApi,
  type SentinelEvent,
  type SessionRow,
  setModeApi,
} from "@/lib/sentinel-api";

type NavItem = { label: string; icon: LucideIcon; badge?: string };

const navItems: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Identities", icon: UsersRound },
  { label: "Devices", icon: Laptop },
  { label: "Access policies", icon: LockKeyhole },
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
// live data hook — polls sys1 through sentinel-api.ts every 3s
// ---------------------------------------------------------------------------

function useLiveData(paused: boolean) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [events, setEvents] = useState<SentinelEvent[]>([]);
  const [pending, setPending] = useState<SentinelEvent[]>([]);
  const [killRows, setKillRows] = useState<KillSwitchRow[]>([]);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<number>(Date.now());

  const refresh = useCallback(async () => {
    try {
      const [s, d, e, p, k] = await Promise.all([
        fetchSessions(),
        fetchDevices(),
        fetchEvents(200),
        fetchPending(),
        fetchKillSwitchStatus(),
      ]);
      setSessions(s);
      setDevices(d);
      setEvents(e);
      setPending(p);
      setKillRows(k);
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

  return { sessions, devices, events, pending, killRows, online, lastSync, refresh };
}

function useMode() {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  useEffect(() => {
    fetchMode()
      .then(setMode)
      .catch(() => {});
  }, []);
  const change = useCallback(async (next: "auto" | "manual") => {
    setMode(next);
    try {
      await setModeApi(next);
    } catch {
      toast.error("Could not reach the console backend to change mode");
    }
  }, []);
  return { mode, change };
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

function SignalChart({ points }: { points: number[] }) {
  const safePoints = points.length >= 2 ? points : [50, 50];
  const line = safePoints.map((p, i) => `${(i / (safePoints.length - 1)) * 100},${100 - p}`).join(" ");
  const area = `0,100 ${line} 100,100`;
  return (
    <div className="signal-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Recent decision score chart">
        <defs>
          <linearGradient id="signal-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#55e6db" stopOpacity=".34" />
            <stop offset="100%" stopColor="#55e6db" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((lineY) => (
          <line key={lineY} x1="0" x2="100" y1={lineY} y2={lineY} className="chart-grid" />
        ))}
        <polygon points={area} fill="url(#signal-fill)" />
        <polyline points={line} fill="none" className="chart-line" />
        <circle cx="95.65" cy={100 - safePoints[safePoints.length - 1]} r="1.6" className="chart-dot" />
      </svg>
      <div className="chart-labels">
        <span>oldest</span>
        <span>now</span>
      </div>
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
  deviceCount,
  lastSync,
}: {
  active: string;
  onSelect: (label: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
  online: boolean;
  deviceCount: number;
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
          <div className="brand-sub">admin console</div>
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
      <SectionLabel>Control plane</SectionLabel>
      <nav className="nav-list" aria-label="Main navigation">
        {navItems.map(({ label, icon: Icon, badge }) => (
          <button key={label} className={cn("nav-item", active === label && "nav-active")} onClick={() => { onSelect(label); onClose(); }}>
            <Icon size={17} strokeWidth={active === label ? 2 : 1.6} />
            <span>{label}</span>
            {label === "Devices" && deviceCount > 0 && <span className="nav-badge">{deviceCount}</span>}
            {badge && <span className="nav-badge">{badge}</span>}
          </button>
        ))}
      </nav>
      <SectionLabel>System</SectionLabel>
      <nav className="nav-list">
        <button className="nav-item" onClick={() => toast.info("Config lives in sys1/app/config.py and env vars.")}>
          <SlidersHorizontal size={17} />
          <span>Configuration</span>
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
          <div className="user-avatar">A</div>
          <div>
            <strong>admin</strong>
            <small>Administrator</small>
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
  onModeChange,
  online,
}: {
  active: string;
  onMobileMenu: () => void;
  mode: "auto" | "manual";
  onModeChange: (next: "auto" | "manual") => void;
  online: boolean;
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button mobile-menu" onClick={onMobileMenu} aria-label="Open navigation">
          <Menu size={19} />
        </button>
        <div className="breadcrumbs">
          <span>Admin</span>
          <span className="crumb-slash">/</span>
          <strong>{active}</strong>
        </div>
      </div>
      <div className="topbar-actions">
        <div className="mode-toggle" role="group" aria-label="Operation mode">
          <button className={mode === "auto" ? "mode-active-auto" : ""} onClick={() => onModeChange("auto")}>
            Auto
          </button>
          <button className={mode === "manual" ? "mode-active-manual" : ""} onClick={() => onModeChange("manual")}>
            Manual
          </button>
        </div>
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
        <button className="icon-button notification-button" onClick={() => toast.success("No new critical alerts.")} aria-label="Notifications">
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

function EventStream({
  events,
  paused,
  onToggle,
}: {
  events: SentinelEvent[];
  paused: boolean;
  onToggle: () => void;
}) {
  const rows = events.slice(0, 10);
  return (
    <div className="panel event-panel">
      <div className="panel-heading">
        <div>
          <SectionLabel>Live telemetry</SectionLabel>
          <h2>Decision stream</h2>
        </div>
        <button className="stream-toggle" onClick={onToggle}>
          {paused ? <Play size={13} /> : <Pause size={13} />}
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <div className="event-list">
        {rows.length === 0 && <div className="pending-empty">No events yet — waiting on signals from the worker console / agents.</div>}
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

function DevicesPanel({ devices, onKill }: { devices: DeviceRow[]; onKill: (target: string) => void }) {
  return (
    <div className="panel policy-panel">
      <div className="panel-heading">
        <div>
          <SectionLabel>Posture</SectionLabel>
          <h2>Devices</h2>
        </div>
      </div>
      <div className="policy-list">
        {devices.length === 0 && <div className="pending-empty">No devices have reported posture yet.</div>}
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
              <StatusPill tone={d.killed ? "red" : color === "cyan" ? "cyan" : "amber"}>{d.killed ? "Killed" : "Active"}</StatusPill>
              <div className="coverage">
                <div className="coverage-track">
                  <span style={{ width: `${Math.round((d.posture_score / 30) * 100)}%` }} className={`coverage-${color}`} />
                </div>
                <small>{Math.round((d.posture_score / 30) * 100)}%</small>
              </div>
              {!d.killed && (
                <button className="scenario-run-btn warn" onClick={() => onKill(d.device_id)} title="Kill this device">
                  Kill
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KillSwitchPanel({ killRows, onKill }: { killRows: KillSwitchRow[]; onKill: (target: string) => void }) {
  const [target, setTarget] = useState("");
  return (
    <div className="panel attack-panel">
      <div className="panel-heading">
        <div>
          <SectionLabel>Admin control</SectionLabel>
          <h2>Kill switch</h2>
        </div>
        <StatusPill tone={killRows.length ? "red" : "muted"}>{killRows.length} killed</StatusPill>
      </div>
      <p className="attack-copy">Kill a device or app by id — used manually, or fires automatically when the engine detects a CRITICAL manifest violation.</p>
      <div className="pending-actions" style={{ marginBottom: 12 }}>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="device_id or app_id"
          className="command-trigger"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          className="scenario-run-btn warn"
          onClick={() => {
            if (target.trim()) {
              onKill(target.trim());
              setTarget("");
            }
          }}
        >
          Kill
        </button>
      </div>
      <div className="pending-list">
        {killRows.length === 0 && <div className="pending-empty">Nothing has been killed yet.</div>}
        {killRows.slice(0, 5).map((k) => (
          <div className="pending-row" key={k.event_id}>
            <div className="pending-row-head">
              <strong>{k.target}</strong>
              <StatusPill tone="red">killed</StatusPill>
            </div>
            <div className="pending-reason">{k.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingApprovals({
  pending,
  onApprove,
  onDeny,
}: {
  pending: SentinelEvent[];
  onApprove: (eventId: string) => void;
  onDeny: (eventId: string) => void;
}) {
  return (
    <div className="panel pending-panel">
      <div className="panel-heading">
        <div>
          <SectionLabel>Manual mode</SectionLabel>
          <h2>Pending approvals ({pending.length})</h2>
        </div>
      </div>
      {pending.length === 0 ? (
        <div className="pending-empty">Nothing waiting on admin approval.</div>
      ) : (
        <div className="pending-list">
          {pending.map((p) => (
            <div className="pending-row" key={p.event_id}>
              <div className="pending-row-head">
                <strong>
                  {p.subject} requesting {p.resource_or_permission}
                </strong>
                <StatusPill tone="amber">score {p.score}</StatusPill>
              </div>
              <div className="pending-reason">{p.reason}</div>
              <div className="pending-actions">
                <button className="approve-btn" onClick={() => onApprove(p.event_id)}>
                  <Check size={12} /> Approve
                </button>
                <button className="deny-btn" onClick={() => onDeny(p.event_id)}>
                  <X size={12} /> Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Overview({
  data,
  paused,
  onToggleStream,
  onApprove,
  onDeny,
  onKill,
}: {
  data: ReturnType<typeof useLiveData>;
  paused: boolean;
  onToggleStream: () => void;
  onApprove: (eventId: string) => void;
  onDeny: (eventId: string) => void;
  onKill: (target: string) => void;
}) {
  const { sessions, devices, events, pending, killRows } = data;

  const allowCount = events.filter((e) => e.decision === "ALLOW").length;
  const threatCount = events.filter((e) => e.decision === "DENY" || e.decision === "CRITICAL").length;
  const activeSessions = sessions.filter((s) => !s.killed).length;

  const chartPoints = useMemo(() => {
    const chronological = [...events].reverse();
    return chronological.map((e) => Math.max(0, Math.min(100, e.score ?? 0)));
  }, [events]);

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
            <span className="status-dot dot-cyan pulse" /> Admin console / live
          </div>
          <h1>
            Approvals &amp; monitoring<span className="heading-period">.</span>
          </h1>
          <p className="hero-copy">
            Every request is continuously re-evaluated. <strong>{events.length}</strong> decisions in view right now.
          </p>
        </div>
        <button className="primary-action" onClick={() => toast.success("Refreshing...") || data.refresh()}>
          <Eye size={16} /> Refresh now <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="metric-grid">
        <MetricCard label="Requests evaluated" value={String(events.length)} note="most recent window" icon={Fingerprint} />
        <MetricCard label="Access granted" value={String(allowCount)} note={events.length ? `${Math.round((allowCount / events.length) * 100)}% of requests` : "—"} icon={Shield} />
        <MetricCard label="Threats blocked" value={String(threatCount)} note="DENY + CRITICAL" icon={Ban} tone="red" />
        <MetricCard label="Active sessions" value={String(activeSessions)} note={`${sessions.length} total`} icon={UsersRound} />
      </div>
      <div className="main-grid">
        <div className="panel signal-panel">
          <div className="panel-heading">
            <div>
              <SectionLabel>Decision signal</SectionLabel>
              <h2>Request activity</h2>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-line" /> decisions
              </span>
            </div>
          </div>
          <div className="signal-summary">
            <span>
              <strong>{events.length}</strong> total decisions
            </span>
          </div>
          <SignalChart points={chartPoints} />
        </div>
        <div className="panel posture-panel">
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
                <KeyRound size={14} />
              </span>
              <span>Active sessions</span>
              <strong>{activeSessions}</strong>
            </div>
            <div>
              <span className="factor-icon">
                <Network size={14} />
              </span>
              <span>Pending approvals</span>
              <strong>{pending.length}</strong>
            </div>
          </div>
        </div>
        <EventStream events={events} paused={paused} onToggle={onToggleStream} />
        <div className="right-stack">
          <DevicesPanel devices={devices} onKill={onKill} />
          <KillSwitchPanel killRows={killRows} onKill={onKill} />
        </div>
      </div>
      <PendingApprovals pending={pending} onApprove={onApprove} onDeny={onDeny} />
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
  const { mode, change: changeMode } = useMode();

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

  async function handleApprove(eventId: string) {
    try {
      await adminDecision(eventId, "approve");
      toast.success("Approved");
      data.refresh();
    } catch (e) {
      toast.error("Approve failed", { description: errMsg(e) });
    }
  }

  async function handleDeny(eventId: string) {
    try {
      await adminDecision(eventId, "deny");
      toast.info("Denied");
      data.refresh();
    } catch (e) {
      toast.error("Deny failed", { description: errMsg(e) });
    }
  }

  async function handleKill(target: string) {
    try {
      await killSwitchApi(target, "manual admin action from admin console");
      toast.error(`Killed ${target}`);
      data.refresh();
    } catch (e) {
      toast.error("Kill switch failed", { description: errMsg(e) });
    }
  }

  const page =
    active === "Overview" ? (
      <Overview data={data} paused={paused} onToggleStream={() => setPaused((v) => !v)} onApprove={handleApprove} onDeny={handleDeny} onKill={handleKill} />
    ) : (
      <PlaceholderPage
        title={active}
        icon={navItems.find((item) => item.label === active)?.icon ?? LayoutDashboard}
        description="This module isn't wired up in this build — everything live currently lives on the Overview page."
      />
    );

  return (
    <div className="console-shell">
      <div className="noise-layer" />
      <Sidebar
        active={active}
        onSelect={setActive}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        online={data.online}
        deviceCount={data.devices.length}
        lastSync={data.lastSync}
      />
      <main className="main-shell">
        <TopBar active={active} onMobileMenu={() => setMobileOpen(true)} mode={mode} onModeChange={changeMode} online={data.online} />
        {page}
      </main>
      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}
    </div>
  );
}
