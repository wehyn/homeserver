"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  Activity, Check, ChevronDown, Cloud, Cpu, Database,
  ExternalLink, FolderKanban, Gauge, HardDrive, LayoutGrid, Menu, MoreHorizontal,
  Network, Pencil, Plus, Power, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Star,
  Thermometer, Trash2, TriangleAlert, X, Zap,
} from "lucide-react";
import { seedApps } from "@/lib/seed";
import type { ActivityEvent, AppStatus, DockerContainerState, ManagedApp, ServerOverview } from "@/lib/types";
import { ThemeToggle } from "@/app/theme-toggle";

const categories = ["All apps", "Favorites", "Media", "Infrastructure", "Productivity", "Gaming"];
const craftyIconUrl = "https://gitlab.com/uploads/-/system/project/avatar/20430749/Crafty_4-0_Logo_square.ico?width=128";

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
const containerStateCopy: Record<DockerContainerState, string> = { created: "Created", restarting: "Restarting", running: "Running", removing: "Removing", paused: "Paused", exited: "Stopped", dead: "Dead", unknown: "Unknown" };
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
  return isCrafty ? craftyIconUrl : "";
}

function AppIcon({ app, large = false, proxy = true }: { app: ManagedApp; large?: boolean; proxy?: boolean }) {
  const Icon = iconPalette[app.id] || LayoutGrid;
  const customIcon = app.icon?.trim() || "";
  const favicon = customIcon ? [] : getFaviconUrls(app.url, proxy ? app.id : undefined);
  const knownIcon = customIcon ? "" : getKnownIconUrl(app);
  const iconSources = customIcon ? [customIcon] : [knownIcon, ...favicon].filter(Boolean);
  const sourceKey = iconSources.join("\u0000");
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [sourceKey]);
  const iconSource = iconSources[sourceIndex] || "";

  return <div className={`app-icon ${large ? "app-icon-large" : ""}`} style={{ "--app-color": app.color } as React.CSSProperties}>
    {iconSource && <img key={iconSource} src={iconSource} alt="" referrerPolicy="no-referrer" onError={() => setSourceIndex((current) => current + 1)} />}
    <Icon className={iconSource ? "icon-fallback" : undefined} size={large ? 27 : 22} strokeWidth={1.8} />
  </div>;
}

function StatCard({ icon: Icon, label, value, detail, progress, tone, href, loading = false, className = "", children }: { icon: typeof Cpu; label: string; value: string; detail: string; progress?: number; tone: string; href?: string; loading?: boolean; className?: string; children?: React.ReactNode }) {
  const content = <>
    <div className="stat-card-top"><span className={`stat-icon ${tone}`}><Icon size={16} /></span><span>{label}</span></div>
    <div className="stat-value">{value}</div><div className="stat-detail">{detail}</div>
    {progress !== undefined && <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>}
    {children}
  </>;
  const cardClassName = `stat-card${className ? ` ${className}` : ""}`;
  return href ? <Link className={`${cardClassName} stat-card-link`} href={href} aria-label={`View ${label.toLowerCase()} details`} aria-busy={loading}>{content}</Link> : <div className={cardClassName} aria-busy={loading}>{content}</div>;
}

export default function Home() {
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState("");
  const [overview, setOverview] = useState<ServerOverview | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All apps");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedApp | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [overviewRefreshing, setOverviewRefreshing] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [currentDate, setCurrentDate] = useState("");
  const activeHealthRefreshesRef = useRef(0);
  const [searchShortcut, setSearchShortcut] = useState("⌘ K");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const settingsTriggerRef = useRef<HTMLElement | null>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const mobileSidebarCloseRef = useRef<HTMLButtonElement>(null);
  const appsRef = useRef(apps);
  appsRef.current = apps;

  const openSettings = useCallback((nextEditing: ManagedApp | null) => {
    const activeElement = document.activeElement;
    settingsTriggerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setEditing(nextEditing);
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setEditing(null);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    mobileMenuRef.current?.focus();
  }, []);

  useEffect(() => {
    const isApplePlatform = /Mac|iPhone|iPad|iPod/.test(window.navigator.platform);
    setSearchShortcut(isApplePlatform ? "⌘ K" : "Ctrl K");
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if (settingsOpen || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [settingsOpen]);

  useEffect(() => {
    if (settingsOpen) return;
    const trigger = settingsTriggerRef.current;
    if (trigger?.isConnected) {
      const mobileSidebarIsClosed = trigger.closest("#primary-navigation") && window.matchMedia("(max-width: 800px)").matches && !sidebarOpen;
      if (mobileSidebarIsClosed) mobileMenuRef.current?.focus();
      else trigger.focus();
    }
    settingsTriggerRef.current = null;
  }, [settingsOpen, sidebarOpen]);

  useEffect(() => {
    if (sidebarOpen && window.matchMedia("(max-width: 800px)").matches) mobileSidebarCloseRef.current?.focus();
  }, [sidebarOpen]);

  useEffect(() => {
    const updateDate = () => setCurrentDate(new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()));
    updateDate();
    const interval = window.setInterval(updateDate, 60_000);
    return () => window.clearInterval(interval);
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
    const response = await fetch("/api/activity", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json() as { activities?: ActivityEvent[] };
    if (data.activities) setActivities(data.activities);
  }, []);

  useEffect(() => {
    void refreshActivities();
  }, [refreshActivities]);

  const refreshOverview = useCallback(async () => {
    setOverviewRefreshing(true);
    try {
      const response = await fetch("/api/overview", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) throw new Error("Unable to load system overview.");
      const data = await response.json() as ServerOverview;
      setOverview(data);
      setOverviewError("");
    } catch (caught) {
      setOverviewError(caught instanceof Error ? caught.message : "Unable to load system overview.");
    } finally {
      setOverviewRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshOverview();
    const interval = window.setInterval(() => void refreshOverview(), 5_000);
    return () => window.clearInterval(interval);
  }, [refreshOverview]);

  const refreshHealth = useCallback(async () => {
    const checkedApps = appsRef.current.filter((app) => app.healthUrl || app.url);
    if (!checkedApps.length) return;
    activeHealthRefreshesRef.current += 1;
    setRefreshing(true);
    try {
      const results = await Promise.all(checkedApps.map(async (app) => {
        const healthTarget = app.healthUrl || app.url;
        const response = await fetch(`/api/health?id=${encodeURIComponent(app.id)}&url=${encodeURIComponent(healthTarget)}`).catch(() => null);
        const result = response ? await response.json().catch(() => ({ status: "unknown" })) : { status: "unknown" };
        return { id: app.id, status: result.status as AppStatus };
      }));
      setApps((current) => current.map((app) => {
        const result = results.find((item) => item.id === app.id);
        return result ? { ...app, status: result.status } : app;
      }));
      void refreshActivities();
    } finally {
      activeHealthRefreshesRef.current -= 1;
      setRefreshing(activeHealthRefreshesRef.current > 0);
    }
  }, [refreshActivities]);

  useEffect(() => {
    if (appsLoading) return;
    void refreshHealth();
    const interval = window.setInterval(() => void refreshHealth(), 30_000);
    return () => window.clearInterval(interval);
  }, [refreshHealth, appsLoading, apps.map((app) => `${app.id}:${app.healthUrl || app.url}:${app.casaosScheme || ""}:${app.casaosHostname || ""}:${app.casaosPortMap || ""}:${app.casaosIndex || ""}:${app.allowInsecureTls ? "insecure" : "strict"}`).join("|")]);

  const visibleApps = useMemo(() => apps.filter((app) => {
    const matchQuery = `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(query.toLowerCase());
    const matchCategory = category === "All apps" || (category === "Favorites" ? app.isFavorite : app.category === category);
    return app.isVisible && matchQuery && matchCategory;
  }), [apps, category, query]);

  const processorDetail = overviewError ? (overview ? "Last reading · update unavailable" : "System metrics unavailable") : overview ? `${overview.cpuCores} logical cores · live` : "Loading system metrics…";
  const storageDetail = overviewError ? (overview ? "Last reading · update unavailable" : "System metrics unavailable") : overview ? `${overview.storageUsed} of ${overview.storageTotal}` : "Loading system metrics…";
  const memoryDetail = overviewError ? (overview ? "Last reading · update unavailable" : "System metrics unavailable") : overview ? `${overview.memoryUsed} of ${overview.memoryTotal}` : "Loading system metrics…";
  const temperatureValue = overview ? formatTemperature(overview.temperatureC) : "—";
  const powerValue = overview ? formatPower(overview.powerWatts) : "—";
  const temperatureDetail = overviewError ? (overview ? "Last reading · update unavailable" : "System metrics unavailable") : !overview ? "Loading system metrics…" : overview.temperatureC === null ? "Sensor unavailable" : "CPU package sensor · live";
  const powerDetail = overviewError ? (overview ? "Last reading · update unavailable" : "System metrics unavailable") : !overview ? "Loading system metrics…" : overview.powerWatts === null ? (overview.powerSource ? "Sampling power sensor…" : "Power sensor unavailable") : "CPU package estimate · live";
  const storageStatus = overviewError ? (overview ? "stale" : "unavailable") : overview ? "used" : "loading";
  const storageLegendValue = (value?: string) => !overview || !value ? "—" : overviewError ? `${value} · stale` : value;

  async function saveApp(app: ManagedApp) {
    setApps((current) => current.some((item) => item.id === app.id) ? current.map((item) => item.id === app.id ? app : item) : [...current, app]);
    await fetch("/api/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(app) }).catch(() => undefined);
    setAppsError("");
    await refreshActivities();
    setEditing(null); setSavedNotice(true); window.setTimeout(() => setSavedNotice(false), 2200);
  }

  async function deleteApp(id: string) {
    setDeletingId(id);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    setApps((current) => current.filter((app) => app.id !== id));
    setDeletingId(null);
    await fetch("/api/apps", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => undefined);
    await refreshActivities();
  }

  return <main className="shell">
    <aside id="primary-navigation" className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} aria-label="Primary navigation">
      <div className="brand"><div className="brand-mark"><span /><span /></div><span>Nimbus</span><button type="button" ref={mobileSidebarCloseRef} className="mobile-sidebar-close" onClick={closeSidebar} aria-label="Close navigation menu"><X size={19} aria-hidden="true" /></button></div>
      <nav><p className="nav-label">Workspace</p><button type="button" className="nav-item active" onClick={closeSidebar}><LayoutGrid size={17} />Overview</button><p className="nav-label nav-label-space">System</p><button type="button" className="nav-item" onClick={() => { setSidebarOpen(false); openSettings(null); }}><Settings2 size={17} />Application management</button></nav>
      <div className="sidebar-bottom"><div className="sidebar-uptime" role="status" aria-live="polite" aria-atomic="true" aria-busy={overviewRefreshing} aria-label={`System uptime: ${overview?.uptime || "Loading"}`}><span className="sidebar-uptime-icon"><Gauge size={15} aria-hidden="true" /></span><div><span>System uptime</span><strong>{overview?.uptime || "—"}</strong></div></div></div>
    </aside>
    {sidebarOpen && <button type="button" className="sidebar-backdrop" onClick={closeSidebar} aria-label="Close navigation menu" />}
    <section className="content">
      <header className="topbar"><button type="button" ref={mobileMenuRef} className="mobile-menu" onClick={() => sidebarOpen ? closeSidebar() : setSidebarOpen(true)} aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={sidebarOpen} aria-controls="primary-navigation"><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>Overview</strong></div><div className="top-actions"><button type="button" className="icon-button" onClick={() => { void refreshOverview(); void refreshHealth(); }} title={overviewError ? "Retry system metrics" : "Refresh metrics and service health"} aria-label={overviewError ? "Retry system metrics" : "Refresh metrics and service health"}><RefreshCw size={17} className={refreshing || overviewRefreshing ? "spin" : ""} /></button><button type="button" className="icon-button" aria-label="Notifications"><BellIcon /></button><ThemeToggle /><button type="button" className="avatar-button" aria-label="Open account menu">D</button></div></header>
      <div className="main-inner">
        <section className="welcome-row"><div><p className="eyebrow">{currentDate}</p></div></section>
        <section className="overview-grid" aria-busy={overviewRefreshing}><StatCard icon={Cpu} label="Processor" value={overview ? formatPercent(overview.cpu) : "—"} detail={processorDetail} progress={overview ? overview.cpu : undefined} tone="green" href="/processor" className="processor-stat-card" loading={overviewRefreshing}><div className="processor-telemetry" role="group" aria-label="Processor hardware telemetry"><div className="processor-telemetry-item" title={temperatureDetail} aria-label={`CPU temperature: ${temperatureValue}. ${temperatureDetail}`}><span><Thermometer size={12} aria-hidden="true" />Temperature</span><strong>{temperatureValue}</strong></div><div className="processor-telemetry-item" title={powerDetail} aria-label={`CPU power: ${powerValue}. ${powerDetail}`}><span><Zap size={12} aria-hidden="true" />Power</span><strong>{powerValue}</strong></div></div></StatCard><StatCard icon={HardDrive} label="Storage used" value={overview ? formatPercent(overview.storage) : "—"} detail={storageDetail} progress={overview ? overview.storage : undefined} tone="orange" loading={overviewRefreshing} /><StatCard icon={Database} label="Memory" value={overview ? formatPercent(overview.memory) : "—"} detail={memoryDetail} progress={overview ? overview.memory : undefined} tone="blue" href="/memory" loading={overviewRefreshing} /></section>
        <section className="apps-section" aria-busy={appsLoading}><div className="section-heading"><div><div className="section-title-row"><h2>Applications</h2><span className="count-pill">{appsLoading ? "—" : apps.length}</span></div></div><button type="button" className="button primary" onClick={() => openSettings(blankApp(apps.length))}><Plus size={17} />Add application</button></div>
          <div className="toolbar"><div className="search-box"><Search size={18} aria-hidden="true" /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications..." aria-label="Search applications" /><kbd>{searchShortcut}</kbd></div><div className="filters-viewport" role="group" aria-label="Application category filters"><div className="filters">{categories.map((item) => <button type="button" key={item} className={category === item ? "filter active-filter" : "filter"} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}{item === "Favorites" && <Star size={12} fill="currentColor" aria-hidden="true" />}</button>)}</div></div></div>
          <AnimatePresence mode="wait" initial={false}>
            {appsLoading ? <motion.div key="apps-loading" className="empty-state" role="status" aria-live="polite" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><RefreshCw size={24} className="spin" aria-hidden="true" /><strong>Loading applications…</strong><span>Checking the application registry.</span></motion.div> : appsError ? <motion.div key="apps-error" className="empty-state" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><TriangleAlert size={24} aria-hidden="true" /><strong>Applications unavailable</strong><span>{appsError}</span><button className="small-primary" onClick={() => void loadApps()}>Try again</button></motion.div> : visibleApps.length ? <motion.div key="app-grid" className="app-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition}>
              <AnimatePresence initial={false} mode="popLayout">
                {visibleApps.map((app) => <motion.div key={app.id} className="app-card-motion" layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={motionTransition}><AppCard app={app} onEdit={() => openSettings(app)} /></motion.div>)}
              </AnimatePresence>
              <button type="button" className="add-card" onClick={() => openSettings(blankApp(apps.length))}><span><Plus size={21} /></span><strong>Add application</strong><small>Connect a new service</small></button>
            </motion.div> : <motion.div key="empty-state" className="empty-state" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><Search size={24} /><strong>No applications found</strong><span>Try another search or category.</span></motion.div>}
          </AnimatePresence>
        </section>
        <section className="lower-grid"><div className="activity-card"><div className="card-heading"><div><h3>Recent activity</h3></div><button type="button" className="more-button" onClick={() => void refreshActivities()} aria-label="Refresh recent activity"><MoreHorizontal size={17} aria-hidden="true" /></button></div>{activities.length ? activities.map((activity) => <ActivityRow key={activity.id} activity={activity} />) : <div className="activity-empty"><Activity size={20} /><strong>No recent activity</strong><small>App changes and health events will appear here.</small></div>}</div><div className="storage-card" aria-busy={overviewRefreshing}><div className="card-heading"><div><h3>Storage overview</h3></div></div><div className="storage-visual"><div className="donut" style={overview ? { background: `conic-gradient(var(--orange) 0 ${overview.storage}%, var(--donut-rest) ${overview.storage}% 100%)` } : undefined}><div><strong>{overview ? formatPercent(overview.storage) : "—"}</strong><small>{storageStatus}</small></div></div><div className="storage-legend"><div><span className="legend-dot orange-dot" />Used <b>{storageLegendValue(overview?.storageUsed)}</b></div><div><span className="legend-dot gray-dot" />Available <b>{storageLegendValue(overview?.storageAvailable)}</b></div><div><span className="legend-dot blue-dot" />Total <b>{storageLegendValue(overview?.storageTotal)}</b></div></div></div></div></section>
        <footer><span className="footer-spacer" /><span className="connection"><span className="sync-dot" />Connected locally</span></footer>
      </div>
    </section>
    <AnimatePresence initial={false}>
      {settingsOpen && <motion.div key="settings-panel" className="panel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition} onClick={closeSettings}><SettingsPanel apps={apps} editing={editing} deletingId={deletingId} onClose={closeSettings} onEdit={setEditing} onSave={saveApp} onDelete={deleteApp} /></motion.div>}
    </AnimatePresence>
    {savedNotice && <div className="toast"><Check size={16} />Changes saved</div>}
  </main>;
}

function AppCard({ app, onEdit }: { app: ManagedApp; onEdit: () => void }) {
  return <article className="app-card" style={{ "--app-color": app.color } as React.CSSProperties}>
    <div className="app-card-top"><span className="category-label">{app.category}</span><button type="button" className="card-menu" onClick={onEdit} aria-label={`Edit ${app.name}`}><MoreHorizontal size={17} aria-hidden="true" /></button></div>
    <a className="app-link" href={app.url} target="_blank" rel="noreferrer"><AppIcon app={app} large /><div className="app-card-copy"><div className="app-name-row"><h3>{app.name}</h3>{app.isFavorite && <Star className="favorite-star" size={14} fill="currentColor" aria-hidden="true" />}</div><p>{app.description}</p></div></a>
    <div className="app-card-bottom">{app.containerState && <span className={`container-status container-${app.containerState}`}><span className="container-status-dot" />Container: {containerStateCopy[app.containerState]}</span>}<span className="launch-link">Open <ExternalLink size={13} aria-hidden="true" /></span></div>
  </article>;
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

function SettingsPanel({ apps, editing, deletingId, onClose, onEdit, onSave, onDelete }: { apps: ManagedApp[]; editing: ManagedApp | null; deletingId: string | null; onClose: () => void; onEdit: (app: ManagedApp | null) => void; onSave: (app: ManagedApp) => void; onDelete: (id: string) => void }) {
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

  return <aside ref={panelRef} className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><div className="panel-header"><div><p className="eyebrow">Workspace</p><h2 id="settings-title">Application management</h2></div><button type="button" ref={closeButtonRef} className="close-button" onClick={onClose} aria-label="Close settings"><X size={19} aria-hidden="true" /></button></div><AnimatePresence mode="wait" initial={false}>{editing ? <motion.div key={`form-${editing.id}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={motionTransition}><AppForm app={editing} isNew={!apps.some((app) => app.id === editing.id)} onCancel={() => onEdit(null)} onSave={onSave} onDelete={onDelete} /></motion.div> : <motion.div key="application-list" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={motionTransition}><div className="panel-section"><div className="panel-section-heading"><div><h3>Applications</h3><p>Manage what appears on your home screen.</p></div><button type="button" className="small-primary" onClick={() => onEdit(blankApp(apps.length))}><Plus size={15} aria-hidden="true" />Add</button></div><div className="settings-list"><AnimatePresence initial={false} mode="popLayout">{apps.map((app) => <motion.div className="settings-app" key={app.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, x: 8 }} transition={motionTransition}><AppIcon app={app} /><div><strong>{app.name}</strong><small>{app.category} · {statusCopy[app.status]}</small></div><button type="button" className="edit-button" disabled={deletingId === app.id} onClick={() => onEdit(app)} aria-label={`Edit ${app.name}`}><Pencil size={15} aria-hidden="true" /></button></motion.div>)}</AnimatePresence></div></div><div className="panel-section settings-note"><ShieldCheck size={20} /><div><strong>Local-first by default</strong><p>Your app registry is stored on this server. No account or cloud sync required.</p></div></div></motion.div>}</AnimatePresence></aside>;
}

function AppForm({ app, isNew, onCancel, onSave, onDelete }: { app: ManagedApp; isNew: boolean; onCancel: () => void; onSave: (app: ManagedApp) => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState(app); const update = (key: keyof ManagedApp, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const handleDelete = () => {
    if (!window.confirm(`Delete ${form.name || "this application"}? This cannot be undone.`)) return;
    onDelete(form.id);
    onCancel();
  };
  return <form className="app-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}><button type="button" className="back-button" onClick={onCancel}>← <span>All applications</span></button><div className="form-title"><AppIcon app={form} large proxy={false} /><div><p className="eyebrow">{isNew ? "New service" : "Edit service"}</p><h3>{isNew ? "Add application" : form.name}</h3></div></div><label>Name<input required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="My application" /></label><label>Launch URL<input required type="url" value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://app.local" /></label><div className="form-columns"><label>Category<select value={form.category} onChange={(event) => update("category", event.target.value)}>{categories.slice(2).map((item) => <option key={item}>{item}</option>)}<option>Other</option></select></label><label>Accent color<input type="color" value={form.color} onChange={(event) => update("color", event.target.value)} /></label></div><label>Description<input value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What is this for?" /></label><label>Icon URL <span className="optional">optional</span><input type="url" value={form.icon || ""} onChange={(event) => update("icon", event.target.value)} placeholder="Leave blank to use app favicon" /></label><label>Health URL <span className="optional">optional</span><input type="url" value={form.healthUrl || ""} onChange={(event) => update("healthUrl", event.target.value)} placeholder="https://.../health" /></label><div className="form-columns form-columns-equal"><label>Compose project <span className="optional">optional</span><input value={form.dockerProject || ""} onChange={(event) => update("dockerProject", event.target.value)} placeholder="project-name" /></label><label>Compose service <span className="optional">optional</span><input value={form.dockerService || ""} onChange={(event) => update("dockerService", event.target.value)} placeholder="service-name" /></label></div><label className="toggle-row"><span><strong>Allow self-signed TLS</strong><small>Health checks and favicon fetching; use for trusted private services.</small></span><button type="button" className={`toggle ${form.allowInsecureTls ? "toggle-on" : ""}`} onClick={() => update("allowInsecureTls", !form.allowInsecureTls)} aria-label="Allow self-signed TLS" aria-pressed={form.allowInsecureTls}><span /></button></label><label className="toggle-row"><span><strong>Favorite application</strong><small>Show in your Favorites filter</small></span><button type="button" className={`toggle ${form.isFavorite ? "toggle-on" : ""}`} onClick={() => update("isFavorite", !form.isFavorite)} aria-label="Favorite application" aria-pressed={form.isFavorite}><span /></button></label><div className="form-actions"><button type="button" className="button subtle" onClick={onCancel}>Cancel</button>{!isNew && <button type="button" className="delete-button" onClick={handleDelete}><Trash2 size={15} aria-hidden="true" />Delete</button>}<button type="submit" className="button primary"><Check size={16} aria-hidden="true" />Save changes</button></div></form>;
}

function blankApp(order: number): ManagedApp { return { id: `app-${Date.now()}`, name: "", description: "", category: "Productivity", url: "", icon: "", color: "#65e6a5", healthUrl: "", allowInsecureTls: false, status: "unknown", source: "manual", isFavorite: false, isVisible: true, sortOrder: order }; }
function BellIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>; }
function formatPercent(value: number) { return `${value.toFixed(2)}%`; }
function formatTemperature(value: number | null) { return value === null ? "Unavailable" : `${value}°C`; }
function formatPower(value: number | null) { return value === null ? "Unavailable" : `${value.toFixed(2)} W`; }
