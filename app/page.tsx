"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  Activity, Check, ChevronDown, Cloud, Cpu, Database,
  FolderKanban, Gauge, HardDrive, LayoutGrid, Network,
  Pencil, Plus, Power, RefreshCw, Search, Settings2, ShieldCheck, Sparkles,
  Trash2, TriangleAlert, X,
} from "lucide-react";
import { seedApps } from "@/lib/seed";
import { getAppUrlParts, isHostLocalService, resolveAppLaunchUrl, updateAppUrl, type AppUrlProtocol } from "@/lib/app-url";
import type { ActivityEvent, AppStatus, ManagedApp, ServerOverview } from "@/lib/types";
import { ThemeToggle } from "@/app/theme-toggle";

const categories = ["All apps", "Favorites", "Media", "Infrastructure", "Productivity", "Gaming"];
const craftyIconUrl = "https://gitlab.com/uploads/-/system/project/avatar/20430749/Crafty_4-0_Logo_square.ico?width=128";
const immichIconUrl = "https://cdn.simpleicons.org/immich/ffb86b";
const piholeIconUrl = "https://cdn.simpleicons.org/pihole/65e6a5";

const iconPalette: Record<string, React.ComponentType<React.ComponentProps<typeof Cloud>>> = {
  "crafty-controller": GamepadIcon,
  "cloud-drive": Cloud,
  immich: Sparkles,
  jellyfin: PlayIcon,
  "adguard-home": ShieldCheck,
  "uptime-kuma": Activity,
  paperless: FolderKanban,
  router: Network,
};

function GamepadIcon(props: React.ComponentProps<typeof Cloud>) { return <Gamepad2 {...props} />; }
function PlayIcon(props: React.ComponentProps<typeof Cloud>) { return <Play {...props} />; }
function Gamepad2(props: React.ComponentProps<typeof Cloud>) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.4 9.2h11.2a4.6 4.6 0 0 1 4.3 6.2l-1 2.8a2.5 2.5 0 0 1-4.4.5l-1.7-2.2H9.2l-1.7 2.2a2.5 2.5 0 0 1-4.4-.5l-1-2.8a4.6 4.6 0 0 1 4.3-6.2Z"/><path d="M7 12v4m-2-2h4m8-1h.01m2 2h.01"/></svg>; }
function Play(props: React.ComponentProps<typeof Cloud>) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m10 8 5 4-5 4V8Z"/></svg>; }

const statusCopy: Record<AppStatus, string> = { online: "Online", degraded: "Slow response", offline: "Offline", unknown: "Not checked" };
const motionTransition = { duration: 0.2, ease: "easeOut" as const };

function getFaviconUrls(url: string, appId?: string) {
  try {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol)) return [];
    const directUrl = new URL("/favicon.ico", target).href;
    return appId ? [`/api/icon?id=${encodeURIComponent(appId)}`, directUrl] : [directUrl];
  } catch {
    return [];
  }
}

function getKnownIconUrl(app: ManagedApp) {
  const normalizedId = app.id.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedName = app.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isCrafty = normalizedId === "craftycontroller"
    || ["crafty", "craftycontroller", "crafty4"].includes(normalizedName);
  if (isCrafty) return craftyIconUrl;
  if (normalizedId === "immich" || normalizedName === "immich") return immichIconUrl;
  if (normalizedId === "pihole" || normalizedName === "pihole") return piholeIconUrl;
  return "";
}

function AppIcon({ app, large = false, proxy = true }: { app: ManagedApp; large?: boolean; proxy?: boolean }) {
  const Icon = iconPalette[app.id] || LayoutGrid;
  const customIcon = app.icon?.trim() || "";
  const favicon = getFaviconUrls(app.url, proxy ? app.id : undefined);
  const knownIcon = getKnownIconUrl(app);
  const iconSources = [customIcon, knownIcon, ...favicon].filter(Boolean);
  const sourceKey = iconSources.join("\u0000");
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [sourceKey]);
  const iconSource = iconSources[sourceIndex] || "";

  return <div className={`app-icon ${large ? "app-icon-large" : ""}`} style={{ "--app-color": app.color } as React.CSSProperties}>
    {iconSource ? <img key={iconSource} src={iconSource} alt="" referrerPolicy="no-referrer" onError={() => setSourceIndex((current) => current + 1)} /> : <Icon size={large ? 27 : 22} strokeWidth={1.8} aria-hidden="true" />}
  </div>;
}

export default function Home() {
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState("");
  const [overview, setOverview] = useState<ServerOverview | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedApp | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [overviewRefreshing, setOverviewRefreshing] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [clockTime, setClockTime] = useState("");
  const [clockDate, setClockDate] = useState("");
  const activeHealthRefreshesRef = useRef(0);
  const healthRefreshVersionRef = useRef(0);
  const healthRequestRef = useRef<AbortController | null>(null);
  const overviewRequestRef = useRef<AbortController | null>(null);
  const savedNoticeTimeoutRef = useRef<number | null>(null);
  const settingsTriggerRef = useRef<HTMLElement | null>(null);
  const appsRef = useRef(apps);
  appsRef.current = apps;

  const openSettings = useCallback((nextEditing: ManagedApp | null) => {
    const activeElement = document.activeElement;
    settingsTriggerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setMutationError("");
    setEditing(nextEditing);
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setEditing(null);
  }, []);

  useEffect(() => {
    if (settingsOpen) return;
    const trigger = settingsTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
    settingsTriggerRef.current = null;
  }, [settingsOpen]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockTime(new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now));
      setClockDate(new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now));
    };
    updateClock();
    const interval = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (savedNoticeTimeoutRef.current !== null) window.clearTimeout(savedNoticeTimeoutRef.current);
    healthRequestRef.current?.abort();
    overviewRequestRef.current?.abort();
  }, []);

  const loadApps = useCallback(async () => {
    setAppsLoading(true);
    setAppsError("");
    try {
      const response = await fetch("/api/apps", { cache: "no-store" }).catch(() => null);
      const data = response ? await response.json().catch(() => ({})) as { apps?: ManagedApp[]; error?: string } : {};
      if (!response?.ok || !Array.isArray(data.apps)) throw new Error(data.error || "Unable to load applications.");
      setApps(data.apps);
    } catch (caught) {
      setAppsError(caught instanceof Error ? caught.message : "Unable to load applications.");
    } finally {
      setAppsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  const refreshActivities = useCallback(async () => {
    try {
      const response = await fetch("/api/activity", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json() as { activities?: ActivityEvent[] };
      if (data.activities) setActivities(data.activities);
    } catch {
      // Activity history is supplementary; a malformed or unavailable response must not
      // make an otherwise successful app mutation look like it failed.
    }
  }, []);

  useEffect(() => {
    void refreshActivities();
  }, [refreshActivities]);

  const refreshOverview = useCallback(async () => {
    overviewRequestRef.current?.abort();
    const controller = new AbortController();
    overviewRequestRef.current = controller;
    setOverviewRefreshing(true);
    try {
      const response = await fetch("/api/overview", { cache: "no-store", signal: controller.signal }).catch(() => null);
      if (controller.signal.aborted) return;
      if (!response?.ok) throw new Error("Unable to load system overview.");
      const data = await response.json() as ServerOverview;
      setOverview(data);
      setOverviewError("");
    } catch (caught) {
      if (!controller.signal.aborted) setOverviewError(caught instanceof Error ? caught.message : "Unable to load system overview.");
    } finally {
      if (overviewRequestRef.current === controller) overviewRequestRef.current = null;
      if (!controller.signal.aborted) setOverviewRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshOverview();
    const interval = window.setInterval(() => void refreshOverview(), 5_000);
    return () => window.clearInterval(interval);
  }, [refreshOverview]);

  const refreshHealth = useCallback(async () => {
    healthRequestRef.current?.abort();
    const refreshVersion = healthRefreshVersionRef.current + 1;
    healthRefreshVersionRef.current = refreshVersion;
    const checkedApps = appsRef.current.filter((app) => app.healthUrl || app.url);
    if (!checkedApps.length) {
      setRefreshing(false);
      return;
    }
    const controller = new AbortController();
    healthRequestRef.current = controller;
    activeHealthRefreshesRef.current += 1;
    setRefreshing(true);
    try {
      const results = await Promise.all(checkedApps.map(async (app) => {
        const response = await fetch(`/api/health?id=${encodeURIComponent(app.id)}`, { signal: controller.signal }).catch(() => null);
        const result = response ? await response.json().catch(() => ({ status: "unknown" })) : { status: "unknown" };
        return { id: app.id, status: isAppStatus(result.status) ? result.status : "unknown" as AppStatus };
      }));
      if (controller.signal.aborted || refreshVersion !== healthRefreshVersionRef.current) return;
      setApps((current) => current.map((app) => {
        const result = results.find((item) => item.id === app.id);
        return result ? { ...app, status: result.status } : app;
      }));
      void refreshActivities();
    } finally {
      activeHealthRefreshesRef.current -= 1;
      const isCurrentRequest = healthRequestRef.current === controller;
      if (isCurrentRequest) healthRequestRef.current = null;
      if (!controller.signal.aborted || !isCurrentRequest) setRefreshing(activeHealthRefreshesRef.current > 0);
    }
  }, [refreshActivities]);

  useEffect(() => {
    if (appsLoading) return;
    void refreshHealth();
    const interval = window.setInterval(() => void refreshHealth(), 30_000);
    return () => window.clearInterval(interval);
  }, [refreshHealth, appsLoading, apps.map((app) => `${app.id}:${app.healthUrl || app.url}:${app.casaosScheme || ""}:${app.casaosHostname || ""}:${app.casaosPortMap || ""}:${app.casaosIndex || ""}:${app.allowInsecureTls ? "insecure" : "strict"}`).join("|")]);

  const visibleApps = useMemo(() => apps.filter((app) => app.isVisible), [apps]);

  async function saveApp(app: ManagedApp) {
    if (saving) return;
    setSaving(true);
    setMutationError("");
    setSavedNotice(false);
    try {
      const response = await fetch("/api/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(app) }).catch(() => null);
      const result = response ? await response.json().catch(() => null) as { app?: ManagedApp; error?: string } | null : null;
      if (!response?.ok || !result?.app) throw new Error(result?.error || "Unable to save application.");
      setApps((current) => current.some((item) => item.id === app.id) ? current.map((item) => item.id === app.id ? result.app! : item) : [...current, result.app!]);
      setAppsError("");
      await refreshActivities();
      setEditing(null);
      setSavedNotice(true);
      if (savedNoticeTimeoutRef.current !== null) window.clearTimeout(savedNoticeTimeoutRef.current);
      savedNoticeTimeoutRef.current = window.setTimeout(() => setSavedNotice(false), 2200);
      void loadApps();
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : "Unable to save application.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteApp(id: string) {
    setMutationError("");
    setSavedNotice(false);
    setDeletingId(id);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const response = await fetch("/api/apps", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
      const result = response ? await response.json().catch(() => null) as { error?: string } | null : null;
      if (!response?.ok) throw new Error(result?.error || "Unable to delete application.");
      setApps((current) => current.filter((app) => app.id !== id));
      await refreshActivities();
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : "Unable to delete application.");
    } finally {
      setDeletingId(null);
    }
  }

  const cpuValue = overview ? formatPercent(overview.cpu) : "—";
  const memoryValue = overview ? formatPercent(overview.memory) : "—";
  const storageValue = overview ? formatPercent(overview.storage) : "—";
  const memoryDetail = overviewError ? "System metrics unavailable" : overview ? `${overview.memoryUsed} of ${overview.memoryTotal}` : "Loading";
  const storageDetail = overviewError ? "System metrics unavailable" : overview ? `${overview.storageUsed} of ${overview.storageTotal}` : "Loading";  const temperatureValue = overview ? formatTemperature(overview.temperatureC) : "—";
  const powerValue = overview ? formatPower(overview.powerWatts) : "—";

  let launcherContent: React.ReactNode;
  if (appsLoading) {
    launcherContent = <motion.div key="apps-loading" className="empty-state" role="status" aria-live="polite" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><RefreshCw size={24} className="spin" aria-hidden="true" /><strong>Loading applications…</strong><span>Checking the application registry.</span></motion.div>;
  } else if (appsError) {
    launcherContent = <motion.div key="apps-error" className="empty-state" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><TriangleAlert size={28} aria-hidden="true" /><strong>Applications unavailable</strong><span>{appsError}</span><button className="small-primary" onClick={() => void loadApps()}>Try again</button></motion.div>;
  } else if (visibleApps.length) {
    launcherContent = <motion.div key="app-grid" className="launcher-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition}>
      <AnimatePresence initial={false} mode="popLayout">
        {visibleApps.map((app) => <motion.div key={app.id} className="launcher-tile-wrap" layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={motionTransition}><LauncherTile app={app} /></motion.div>)}
      </AnimatePresence>
    </motion.div>;
  } else {
    launcherContent = <motion.div key="empty-state" className="empty-state" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><Search size={28} /><strong>No visible applications</strong><span>Add an application or make one visible in management.</span><button className="small-primary" onClick={() => openSettings(null)}>Manage applications</button></motion.div>;
  }

  return <main className="launcher">
    <header className="launcher-bar">
      <div className="launcher-clock" aria-hidden="true"><span className="launcher-time">{clockTime || "—"}</span><span className="launcher-date">{clockDate}</span></div>
      <div className="launcher-actions">
        <span className="launcher-chip" role="status" aria-label={`System uptime: ${overview?.uptime || "—"}`}><span className="launcher-chip-icon"><Gauge size={12} aria-hidden="true" /></span><span className="launcher-chip-value">{overview?.uptime || "—"}</span></span>
        <button type="button" className="launcher-icon-button" onClick={() => { void refreshOverview(); void refreshHealth(); }} title={overviewError ? "Retry system metrics" : "Refresh metrics and service health"} aria-label={overviewError ? "Retry system metrics" : "Refresh metrics and service health"}><RefreshCw size={18} className={refreshing || overviewRefreshing ? "spin" : ""} /></button>
        <ThemeToggle />
        <button type="button" className="launcher-icon-button" onClick={() => openSettings(null)} aria-label="Application management" title="Application management"><Settings2 size={18} /></button>
      </div>
    </header>
    <section className="launcher-body" aria-busy={appsLoading}>
      <AnimatePresence mode="wait" initial={false}>
        {launcherContent}
      </AnimatePresence>
      <section className="launcher-widgets" aria-label="System status">
        <LauncherWidget icon={<Cpu size={16} />} label="CPU" value={cpuValue} progress={overview ? overview.cpu : undefined} tone="green" href="/processor" loading={overviewRefreshing}><div className="launcher-telemetry"><div><span>Package</span><strong>{temperatureValue}</strong></div><div><span>Power</span><strong>{powerValue}</strong></div></div></LauncherWidget>
        <LauncherWidget icon={<Database size={16} />} label="Memory" value={memoryValue} detail={memoryDetail} progress={overview ? overview.memory : undefined} tone="blue" href="/memory" loading={overviewRefreshing} />
        <LauncherWidget icon={<HardDrive size={16} />} label="Storage" value={storageValue} detail={storageDetail} progress={overview ? overview.storage : undefined} tone="orange" loading={overviewRefreshing} />
      </section>
    </section>
    <AnimatePresence initial={false}>
      {settingsOpen && <motion.div key="application-modal" className="panel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition} onClick={closeSettings}><SettingsPanel apps={apps} activities={activities} editing={editing} deletingId={deletingId} saving={saving} mutationError={mutationError} onRefreshActivity={() => void refreshActivities()} onClose={closeSettings} onEdit={setEditing} onSave={saveApp} onDelete={deleteApp} /></motion.div>}
    </AnimatePresence>
    {savedNotice && <div className="toast"><Check size={16} />Changes saved</div>}
    {mutationError && <div className="toast toast-error" role="alert"><TriangleAlert size={16} />{mutationError}</div>}
  </main>;
}

function LauncherTile({ app }: { app: ManagedApp }) {
  const [launchUrl, setLaunchUrl] = useState(app.url);

  useEffect(() => {
    setLaunchUrl(resolveAppLaunchUrl(app, window.location.hostname));
  }, [app]);

  return <a className="launcher-tile" href={launchUrl} target="_blank" rel="noreferrer" title={`${app.name} · ${statusCopy[app.status]}`}>
    <span className="launcher-iconwrap"><AppIcon app={app} large /></span>
    <span className="launcher-name">{app.name}</span>
  </a>;
}

function LauncherGauge({ percent, children }: { percent?: number; children: React.ReactNode }) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.75;
  const gap = circumference - arc;
  const clamped = percent === undefined ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <div className="launcher-gauge">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="launcher-gauge-track" cx="60" cy="60" r={r} strokeWidth="11" fill="none" strokeDasharray={`${arc} ${gap}`} transform="rotate(135 60 60)" />
        {percent !== undefined && <circle className="launcher-gauge-fill" cx="60" cy="60" r={r} strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray={`${arc} ${circumference}`} strokeDashoffset={arc * (1 - clamped / 100)} transform="rotate(135 60 60)" />}
      </svg>
      <div className="launcher-gauge-value">{children}</div>
    </div>
  );
}

function LauncherWidget({ icon, label, value, detail, progress, tone, href, loading = false, children }: { icon: React.ReactNode; label: string; value: string; detail?: string; progress?: number; tone: string; href?: string; loading?: boolean; children?: React.ReactNode }) {
  const content = <>
    <div className="launcher-widget-top"><span className={`stat-icon ${tone}`}>{icon}</span><span>{label}</span></div>
    <div className="launcher-gauge-wrap"><LauncherGauge percent={progress}>{value}</LauncherGauge></div>
    {detail && <div className="launcher-widget-detail">{detail}</div>}
    {children}
  </>;
  return href ? <Link className="launcher-widget launcher-widget-link" href={href} aria-label={`View ${label.toLowerCase()} details`} aria-busy={loading}>{content}</Link> : <div className="launcher-widget" aria-busy={loading}>{content}</div>;
}

function ActivityRow({ activity }: { activity: ActivityEvent }) {
  return <div className="activity-row"><span className={`activity-icon ${activityTone(activity)}`}>{activityIcon(activity)}</span><div><strong>{activityTitle(activity)}</strong><small>{formatRelativeTime(activity.createdAt)}</small></div><ChevronDown size={14} className="activity-arrow" /> </div>;
}

function activityTitle(activity: ActivityEvent) {
  if (activity.type === "app-created") return `${activity.appName} added`;
  if (activity.type === "app-updated") return `${activity.appName} updated`;
  if (activity.type === "app-deleted") return `${activity.appName} removed`;
  if (activity.status === "online") return `${activity.appName} is back online`;
  if (activity.status === "degraded") return `${activity.appName} is responding slowly`;
  if (activity.status === "offline") return `${activity.appName} is offline`;
  return `${activity.appName} status checked`;
}

function activityTone(activity: ActivityEvent) {
  if (activity.type === "status-changed" && activity.status === "offline") return "purple";
  if (activity.type === "status-changed" && activity.status === "degraded") return "blue";
  return activity.type === "app-deleted" ? "purple" : "green";
}

function activityIcon(activity: ActivityEvent) {
  if (activity.type === "app-deleted") return <Trash2 size={16} />;
  if (activity.type === "app-created") return <Plus size={16} />;
  if (activity.type === "app-updated") return <Pencil size={16} />;
  if (activity.status === "offline") return <X size={16} />;
  return <Power size={16} />;
}

function formatRelativeTime(createdAt: string) {
  const elapsed = Math.max(0, Date.now() - new Date(createdAt).getTime());
  if (!Number.isFinite(elapsed)) return "Recently";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function SettingsPanel({ apps, activities, editing, deletingId, saving, mutationError, onRefreshActivity, onClose, onEdit, onSave, onDelete }: { apps: ManagedApp[]; activities: ActivityEvent[]; editing: ManagedApp | null; deletingId: string | null; saving: boolean; mutationError: string; onRefreshActivity: () => void; onClose: () => void; onEdit: (app: ManagedApp | null) => void; onSave: (app: ManagedApp) => void; onDelete: (id: string) => void }) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusableElements = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])")
      );
      if (!focusableElements.length) {
        event.preventDefault();
        return;
      }
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editing, onClose]);

  return <section ref={panelRef} className={`settings-panel${editing ? " details-panel" : ""}`} role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><div className="panel-header"><div><p className="eyebrow">Workspace</p><h2 id="settings-title">{editing ? "Application details" : "Application management"}</h2></div><button type="button" ref={closeButtonRef} className="close-button" onClick={onClose} aria-label="Close application modal"><X size={19} aria-hidden="true" /></button></div><AnimatePresence mode="wait" initial={false}>{editing ? <motion.div key={`form-${editing.id}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={motionTransition}><AppForm app={editing} isNew={!apps.some((app) => app.id === editing.id)} saving={saving} onCancel={() => onEdit(null)} onSave={onSave} onDelete={onDelete} /></motion.div> : <motion.div key="application-list" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={motionTransition}><div className="panel-section"><div className="panel-section-heading"><div><h3>Applications</h3><p>Manage what appears on your home screen.</p></div><button type="button" className="small-primary" onClick={() => onEdit(blankApp(apps.length))}><Plus size={15} aria-hidden="true" />Add</button></div><div className="settings-list"><AnimatePresence initial={false} mode="popLayout">{apps.map((app) => <motion.div className="settings-app" key={app.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, x: 8 }} transition={motionTransition}><AppIcon app={app} /><div><strong>{app.name}</strong><small>{app.category} · {statusCopy[app.status]}</small></div><button type="button" className="edit-button" disabled={deletingId === app.id} onClick={() => onEdit(app)} aria-label={`Edit ${app.name}`}><Pencil size={15} aria-hidden="true" /></button></motion.div>)}</AnimatePresence></div></div><div className="panel-section"><div className="panel-section-heading"><div><h3>Recent activity</h3><p>App changes and health events.</p></div>{activities.length > 0 && <button type="button" className="more-button" onClick={onRefreshActivity} aria-label="Refresh recent activity"><RefreshCw size={15} aria-hidden="true" /></button>}</div>{activities.length ? <div className="settings-activity">{activities.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}</div> : <div className="activity-empty"><Activity size={20} /><strong>No recent activity</strong><small>App changes and health events will appear here.</small></div>}</div><div className="panel-section settings-note"><ShieldCheck size={20} /><div><strong>Local-first by default</strong><p>Your app registry is stored on this server. No account or cloud sync required.</p></div></div></motion.div>}</AnimatePresence></section>;
}

function AppForm({ app, isNew, saving, onCancel, onSave, onDelete }: { app: ManagedApp; isNew: boolean; saving: boolean; onCancel: () => void; onSave: (app: ManagedApp) => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState(app);
  const [currentHost, setCurrentHost] = useState(() => getAppUrlParts(app.url)?.host || "");
  const urlParts = getAppUrlParts(form.url);
  const hostLocalService = isHostLocalService(form);
  const automaticHost = currentHost || urlParts?.host || "";
  const update = (key: keyof ManagedApp, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const updateWebUi = (protocol: AppUrlProtocol, port: string) => {
    if (!automaticHost) return;
    update("url", updateAppUrl(form.url, protocol, automaticHost, port));
  };
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const savedForm = hostLocalService && automaticHost
      ? { ...form, url: updateAppUrl(form.url, urlParts?.protocol || "http", automaticHost, urlParts?.port || "") }
      : form;
    onSave(savedForm);
  };
  const handleDelete = () => {
    if (!window.confirm(`Delete ${form.name || "this application"}? This cannot be undone.`)) return;
    onDelete(form.id);
    onCancel();
  };
  useEffect(() => {
    setCurrentHost(window.location.hostname);
  }, []);
  return <form className="app-form" onSubmit={handleSubmit}>
    <button type="button" className="back-button" onClick={onCancel}>← <span>All applications</span></button>
    <div className="form-title"><AppIcon app={form} large proxy={false} /><div><p className="eyebrow">{isNew ? "New service" : "Edit service"}</p><h3>{isNew ? "Add application" : form.name}</h3></div></div>
    <label>Title<input required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="My application" /></label>
    {hostLocalService ? <div className="web-ui-editor"><div className="web-ui-fields">
      <label>Protocol<select value={urlParts?.protocol || "http"} onChange={(event) => updateWebUi(event.target.value as AppUrlProtocol, urlParts?.port || "")}><option value="http">HTTP</option><option value="https">HTTPS</option></select></label>
      <label className="web-ui-host">IP<input value={automaticHost} readOnly aria-readonly="true" /></label>
      <label>Port<input required type="number" min="1" max="65535" inputMode="numeric" value={urlParts?.port || ""} onChange={(event) => updateWebUi(urlParts?.protocol || "http", event.target.value)} /></label>
    </div></div> : <div className="web-ui-editor"><input required type="url" aria-label="Application URL" value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://app.local" /></div>}
    <label>Description<input value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What is this for?" /></label>
    <label>Icon URL <span className="optional">optional</span><input type="url" value={form.icon || ""} onChange={(event) => update("icon", event.target.value)} placeholder="Leave blank to use app favicon" /></label>
    <label>Health URL <span className="optional">optional</span><input type="url" value={form.healthUrl || ""} onChange={(event) => update("healthUrl", event.target.value)} placeholder="https://.../health" /></label>
    <div className="form-columns form-columns-equal"><label>Compose project <span className="optional">optional</span><input value={form.dockerProject || ""} onChange={(event) => update("dockerProject", event.target.value)} placeholder="project-name" /></label><label>Compose service <span className="optional">optional</span><input value={form.dockerService || ""} onChange={(event) => update("dockerService", event.target.value)} placeholder="service-name" /></label></div>
    <DockerDetails app={form} />
    <label className="toggle-row"><span><strong>Allow self-signed TLS</strong><small>Health checks and favicon fetching; use for trusted private services.</small></span><button type="button" className={`toggle ${form.allowInsecureTls ? "toggle-on" : ""}`} onClick={() => update("allowInsecureTls", !form.allowInsecureTls)} aria-label="Allow self-signed TLS" aria-pressed={form.allowInsecureTls}><span /></button></label>
    <label className="toggle-row"><span><strong>Favorite application</strong><small>Show in your Favorites filter</small></span><button type="button" className={`toggle ${form.isFavorite ? "toggle-on" : ""}`} onClick={() => update("isFavorite", !form.isFavorite)} aria-label="Favorite application" aria-pressed={form.isFavorite}><span /></button></label>
    <div className="form-actions"><button type="button" className="button subtle" onClick={onCancel} disabled={saving}>Cancel</button>{!isNew && <button type="button" className="delete-button" onClick={handleDelete} disabled={saving}><Trash2 size={15} aria-hidden="true" />Delete</button>}<button type="submit" className="button primary" disabled={saving}><Check size={16} aria-hidden="true" />{saving ? "Saving…" : "Save changes"}</button></div>
  </form>;
}

function DockerDetails({ app }: { app: ManagedApp }) {
  const details = app.dockerDetails;
  const hasDockerLink = Boolean(details || app.source === "docker" || app.dockerProject || app.dockerService || app.containerId || app.containerName || app.containerImage);
  const image = details?.image || app.containerImage || "Not reported";
  const networks = details ? (details.networks.length ? details.networks.join(", ") : "No networks reported") : hasDockerLink ? "Awaiting Docker discovery" : "Not linked";
  const empty = hasDockerLink ? "Docker discovery is unavailable" : "No Docker metadata";
  return <section className="docker-details" aria-label="Container metadata">
    {!hasDockerLink && <div className="docker-details-empty"><strong>No Docker or Compose metadata</strong><p>Add a Compose project and service above to connect this application to its read-only service details.</p></div>}
    <div className="docker-metadata-grid">
      <MetadataItem label="Docker image tag" value={image} mono />
      <MetadataItem label="Network" value={networks} />
      {app.containerState && <MetadataItem label="Container status" value={app.containerState} />}
    </div>
    <DockerMetadataList label="Ports" empty={details ? "No declared ports" : empty} items={details ? formatDockerPorts(details.ports) : undefined} />
    <DockerMetadataList label="Volumes" empty={details ? "No mounted volumes" : empty} items={details?.volumes.map(formatDockerVolume)} />
    <DockerMetadataList label="Environment variables" empty={details ? "No environment variables reported" : empty} items={details?.environment.map((variable) => `${variable.name}=${variable.value}`)} mono />
  </section>;
}

function MetadataItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="docker-metadata-item"><span>{label}</span><strong className={mono ? "docker-mono" : ""}>{value}</strong></div>;
}

function DockerMetadataList({ label, empty, items, mono = false }: { label: string; empty: string; items?: string[]; mono?: boolean }) {
  return <div className="docker-metadata-list"><span>{label}</span>{items?.length ? <ul>{items.map((item, index) => <li key={`${label}-${index}`} className={mono ? "docker-mono" : ""}>{item}</li>)}</ul> : <strong>{empty}</strong>}</div>;
}

function formatDockerPorts(ports: NonNullable<ManagedApp["dockerDetails"]>["ports"]) {
  const groups: NonNullable<ManagedApp["dockerDetails"]>["ports"][] = [];
  for (const port of ports) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    if (previous && canJoinPortRange(previous, port)) current.push(port);
    else groups.push([port]);
  }
  return groups.map(formatDockerPortRange);
}

function canJoinPortRange(previous: NonNullable<ManagedApp["dockerDetails"]>["ports"][number], next: NonNullable<ManagedApp["dockerDetails"]>["ports"][number]) {
  if (previous.protocol !== next.protocol || previous.hostIp !== next.hostIp || next.containerPort !== previous.containerPort + 1) return false;
  if (previous.hostPort === null || next.hostPort === null) return previous.hostPort === null && next.hostPort === null;
  return next.hostPort === previous.hostPort + 1;
}

function formatDockerPortRange(ports: NonNullable<ManagedApp["dockerDetails"]>["ports"]) {
  const first = ports[0];
  const last = ports[ports.length - 1];
  const host = first.hostPort === null
    ? "container-only"
    : `${first.hostIp && first.hostIp !== "0.0.0.0" ? `${first.hostIp}:` : ""}${formatPortRange(first.hostPort, last.hostPort ?? first.hostPort)}`;
  return `${host} → ${formatPortRange(first.containerPort, last.containerPort)}/${first.protocol}`;
}

function formatPortRange(first: number, last: number) {
  return first === last ? `${first}` : `${first}–${last}`;
}

function formatDockerVolume(volume: NonNullable<ManagedApp["dockerDetails"]>["volumes"][number]) {
  return `${volume.type} · ${volume.source || "anonymous"} → ${volume.target}${volume.mode ? ` (${volume.mode})` : ""}`;
}

function blankApp(order: number): ManagedApp { return { id: `app-${Date.now()}`, name: "", description: "", category: "Productivity", url: "", icon: "", color: "#65e6a5", healthUrl: "", allowInsecureTls: false, status: "unknown", source: "manual", isFavorite: false, isVisible: true, sortOrder: order }; }
function formatPercent(value: number) { return `${value.toFixed(2)}%`; }
function formatTemperature(value: number | null) { return value === null ? "Unavailable" : `${value}°C`; }
function formatPower(value: number | null) { return value === null ? "Unavailable" : `${value.toFixed(2)} W`; }
function isAppStatus(value: unknown): value is AppStatus { return value === "online" || value === "degraded" || value === "offline" || value === "unknown"; }
