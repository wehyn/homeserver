"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  Activity, Check, ChevronDown, Cloud, Cpu, Database,
  ExternalLink, FolderKanban, Gauge, HardDrive, LayoutGrid, Menu, MoreHorizontal,
  Network, Pencil, Plus, Power, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Star,
  Trash2, X,
} from "lucide-react";
import { seedApps } from "@/lib/seed";
import type { ActivityEvent, AppStatus, ManagedApp, ServerOverview } from "@/lib/types";

const categories = ["All apps", "Favorites", "Media", "Infrastructure", "Productivity", "Gaming"];

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

function AppIcon({ app, large = false }: { app: ManagedApp; large?: boolean }) {
  const Icon = iconPalette[app.id] || LayoutGrid;
  return <div className={`app-icon ${large ? "app-icon-large" : ""}`} style={{ "--app-color": app.color } as React.CSSProperties}>
    {app.icon ? <img src={app.icon} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Icon size={large ? 27 : 22} strokeWidth={1.8} />}
    {app.icon && <Icon className="icon-fallback" size={large ? 27 : 22} strokeWidth={1.8} />}
  </div>;
}

function StatusDot({ status }: { status: AppStatus }) { return <span className={`status-dot status-${status}`} aria-label={statusCopy[status]} />; }

function StatCard({ icon: Icon, label, value, detail, progress, tone, href }: { icon: typeof Cpu; label: string; value: string; detail: string; progress?: number; tone: string; href?: string }) {
  const content = <>
    <div className="stat-card-top"><span className={`stat-icon ${tone}`}><Icon size={16} /></span><span>{label}</span></div>
    <div className="stat-value">{value}</div><div className="stat-detail">{detail}</div>
    {progress !== undefined && <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>}
  </>;
  return href ? <Link className="stat-card stat-card-link" href={href} aria-label={`View ${label.toLowerCase()} details`}>{content}</Link> : <div className="stat-card">{content}</div>;
}

export default function Home() {
  const [apps, setApps] = useState<ManagedApp[]>(seedApps);
  const [overview, setOverview] = useState<ServerOverview>({ uptime: "—", cpu: 0, cpuCores: 0, memory: 0, memoryUsed: "—", memoryTotal: "—", storage: 0, storageUsed: "—", storageAvailable: "—", storageTotal: "—", network: "Local network", updatedAt: "" });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All apps");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedApp | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [currentDate, setCurrentDate] = useState("");
  const appsRef = useRef(apps);
  appsRef.current = apps;

  useEffect(() => {
    const updateDate = () => setCurrentDate(new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()));
    updateDate();
    const interval = window.setInterval(updateDate, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch("/api/apps").then((res) => res.json()).then((data) => data.apps && setApps(data.apps)).catch(() => undefined);
  }, []);

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
      if (!response?.ok) return;
      const data = await response.json() as ServerOverview;
      setOverview(data);
    } finally {
      setOverviewRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshOverview();
    const interval = window.setInterval(() => void refreshOverview(), 30_000);
    return () => window.clearInterval(interval);
  }, [refreshOverview]);

  const refreshHealth = useCallback(async () => {
    const checkedApps = appsRef.current.filter((app) => app.healthUrl || app.url);
    if (!checkedApps.length) return;
    setRefreshing(true);
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
    setRefreshing(false);
  }, [refreshActivities]);

  useEffect(() => {
    void refreshHealth();
    const interval = window.setInterval(() => void refreshHealth(), 30_000);
    return () => window.clearInterval(interval);
  }, [refreshHealth, apps.map((app) => `${app.id}:${app.healthUrl || app.url}`).join("|")]);

  const visibleApps = useMemo(() => apps.filter((app) => {
    const matchQuery = `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(query.toLowerCase());
    const matchCategory = category === "All apps" || (category === "Favorites" ? app.isFavorite : app.category === category);
    return app.isVisible && matchQuery && matchCategory;
  }), [apps, category, query]);

  const onlineCount = apps.filter((app) => app.status === "online").length;

  async function saveApp(app: ManagedApp) {
    setApps((current) => current.some((item) => item.id === app.id) ? current.map((item) => item.id === app.id ? app : item) : [...current, app]);
    await fetch("/api/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(app) }).catch(() => undefined);
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
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><span /><span /></div><span>Nimbus</span></div>
      <nav><p className="nav-label">Workspace</p><button className="nav-item active"><LayoutGrid size={17} />Overview</button><p className="nav-label nav-label-space">System</p><button className="nav-item" onClick={() => setSettingsOpen(true)}><Settings2 size={17} />Application management</button></nav>
      <div className="sidebar-bottom"><div className="status-summary"><span className="live-pulse" /><div><strong>All systems nominal</strong><small>{onlineCount} of {apps.length} services online</small></div></div></div>
    </aside>
    <section className="content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>Overview</strong></div><div className="top-actions"><button className="icon-button" onClick={() => { void refreshOverview(); void refreshHealth(); }} title="Refresh metrics and service health" aria-label="Refresh metrics and service health"><RefreshCw size={17} className={refreshing || overviewRefreshing ? "spin" : ""} /></button><button className="icon-button"><BellIcon /></button><button className="avatar-button">D</button></div></header>
      <div className="main-inner">
        <section className="welcome-row"><div><p className="eyebrow">{currentDate}</p></div><div className="welcome-actions"><button className="button primary" onClick={() => { setEditing(blankApp(apps.length)); setSettingsOpen(true); }}><Plus size={17} />Add application</button></div></section>
        <section className="overview-grid"><StatCard icon={Gauge} label="System uptime" value={overview.uptime} detail="Since last restart" tone="purple" /><StatCard icon={Cpu} label="Processor" value={formatPercent(overview.cpu)} detail={`${overview.cpuCores || "—"} logical cores · live`} progress={overview.cpu} tone="green" href="/processor" /><StatCard icon={HardDrive} label="Storage used" value={formatPercent(overview.storage)} detail={`${overview.storageUsed} of ${overview.storageTotal}`} progress={overview.storage} tone="orange" /><StatCard icon={Database} label="Memory" value={formatPercent(overview.memory)} detail={`${overview.memoryUsed} of ${overview.memoryTotal}`} progress={overview.memory} tone="blue" href="/memory" /></section>
        <section className="apps-section"><div className="section-heading"><div><div className="section-title-row"><h2>Your applications</h2><span className="count-pill">{apps.length}</span></div></div></div>
          <div className="toolbar"><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications..." /><kbd>⌘ K</kbd></div><div className="filters">{categories.map((item) => <button key={item} className={category === item ? "filter active-filter" : "filter"} onClick={() => setCategory(item)}>{item}{item === "Favorites" && <Star size={12} fill="currentColor" />}</button>)}</div></div>
          <AnimatePresence mode="wait" initial={false}>
            {visibleApps.length ? <motion.div key="app-grid" className="app-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition}>
              <AnimatePresence initial={false} mode="popLayout">
                {visibleApps.map((app) => <motion.div key={app.id} className="app-card-motion" layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={motionTransition}><AppCard app={app} onEdit={() => { setEditing(app); setSettingsOpen(true); }} /></motion.div>)}
              </AnimatePresence>
              <button className="add-card" onClick={() => { setEditing(blankApp(apps.length)); setSettingsOpen(true); }}><span><Plus size={21} /></span><strong>Add application</strong><small>Connect a new service</small></button>
            </motion.div> : <motion.div key="empty-state" className="empty-state" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><Search size={24} /><strong>No applications found</strong><span>Try another search or category.</span></motion.div>}
          </AnimatePresence>
        </section>
        <section className="lower-grid"><div className="activity-card"><div className="card-heading"><div><h3>Recent activity</h3></div><button className="more-button" onClick={() => void refreshActivities()} aria-label="Refresh recent activity"><MoreHorizontal size={17} /></button></div>{activities.length ? activities.map((activity) => <ActivityRow key={activity.id} activity={activity} />) : <div className="activity-empty"><Activity size={20} /><strong>No recent activity</strong><small>App changes and health events will appear here.</small></div>}</div><div className="storage-card"><div className="card-heading"><div><h3>Storage overview</h3></div></div><div className="storage-visual"><div className="donut" style={{ background: `conic-gradient(var(--orange) 0 ${overview.storage}%, rgba(255,255,255,.09) ${overview.storage}% 100%)` }}><div><strong>{formatPercent(overview.storage)}</strong><small>used</small></div></div><div className="storage-legend"><div><span className="legend-dot orange-dot" />Used <b>{overview.storageUsed}</b></div><div><span className="legend-dot gray-dot" />Available <b>{overview.storageAvailable}</b></div><div><span className="legend-dot blue-dot" />Total <b>{overview.storageTotal}</b></div></div></div></div></section>
        <footer><span className="footer-spacer" /><span className="connection"><span className="sync-dot" />Connected locally</span></footer>
      </div>
    </section>
    <AnimatePresence initial={false}>
      {settingsOpen && <motion.div key="settings-panel" className="panel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition} onClick={() => { setSettingsOpen(false); setEditing(null); }}><SettingsPanel apps={apps} editing={editing} deletingId={deletingId} onClose={() => { setSettingsOpen(false); setEditing(null); }} onEdit={setEditing} onSave={saveApp} onDelete={deleteApp} /></motion.div>}
    </AnimatePresence>
    {savedNotice && <div className="toast"><Check size={16} />Changes saved</div>}
  </main>;
}

function AppCard({ app, onEdit }: { app: ManagedApp; onEdit: () => void }) {
  return <article className="app-card" style={{ "--app-color": app.color } as React.CSSProperties}><div className="app-card-top"><span className="category-label">{app.category}</span><button className="card-menu" onClick={onEdit} aria-label={`Edit ${app.name}`}><MoreHorizontal size={17} /></button></div><a className="app-link" href={app.url} target="_blank" rel="noreferrer"><AppIcon app={app} large /><div className="app-card-copy"><div className="app-name-row"><h3>{app.name}</h3>{app.isFavorite && <Star className="favorite-star" size={14} fill="currentColor" />}</div><p>{app.description}</p></div></a><div className="app-card-bottom"><span className="status-label"><StatusDot status={app.status} />{statusCopy[app.status]}</span><span className="launch-link">Open <ExternalLink size={13} /></span></div></article>;
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
  return <aside className="settings-panel" onClick={(event) => event.stopPropagation()}><div className="panel-header"><div><p className="eyebrow">Workspace</p><h2>Application management</h2></div><button className="close-button" onClick={onClose}><X size={19} /></button></div><AnimatePresence mode="wait" initial={false}>{editing ? <motion.div key={`form-${editing.id}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={motionTransition}><AppForm app={editing} onCancel={() => onEdit(null)} onSave={onSave} onDelete={onDelete} /></motion.div> : <motion.div key="application-list" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={motionTransition}><div className="panel-section"><div className="panel-section-heading"><div><h3>Applications</h3><p>Manage what appears on your home screen.</p></div><button className="small-primary" onClick={() => onEdit(blankApp(apps.length))}><Plus size={15} />Add</button></div><div className="settings-list"><AnimatePresence initial={false} mode="popLayout">{apps.map((app) => <motion.div className="settings-app" key={app.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, x: 8 }} transition={motionTransition}><AppIcon app={app} /><div><strong>{app.name}</strong><small>{app.category} · {statusCopy[app.status]}</small></div><button className="edit-button" disabled={deletingId === app.id} onClick={() => onEdit(app)}><Pencil size={15} /></button></motion.div>)}</AnimatePresence></div></div><div className="panel-section settings-note"><ShieldCheck size={20} /><div><strong>Local-first by default</strong><p>Your app registry is stored on this server. No account or cloud sync required.</p></div></div></motion.div>}</AnimatePresence></aside>;
}

function AppForm({ app, onCancel, onSave, onDelete }: { app: ManagedApp; onCancel: () => void; onSave: (app: ManagedApp) => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState(app); const update = (key: keyof ManagedApp, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const isNew = !seedApps.some((item) => item.id === app.id);
  return <form className="app-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}><button type="button" className="back-button" onClick={onCancel}>← <span>All applications</span></button><div className="form-title"><AppIcon app={form} large /><div><p className="eyebrow">{isNew ? "New service" : "Edit service"}</p><h3>{isNew ? "Add application" : form.name}</h3></div></div><label>Name<input required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="My application" /></label><label>Launch URL<input required type="url" value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://app.local" /></label><div className="form-columns"><label>Category<select value={form.category} onChange={(event) => update("category", event.target.value)}>{categories.slice(2).map((item) => <option key={item}>{item}</option>)}<option>Other</option></select></label><label>Accent color<input type="color" value={form.color} onChange={(event) => update("color", event.target.value)} /></label></div><label>Description<input value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What is this for?" /></label><label>Icon URL<span className="optional">optional</span><input type="url" value={form.icon || ""} onChange={(event) => update("icon", event.target.value)} placeholder="https://..." /></label><label>Health URL<span className="optional">optional</span><input type="url" value={form.healthUrl || ""} onChange={(event) => update("healthUrl", event.target.value)} placeholder="https://.../health" /></label><label className="toggle-row"><span><strong>Favorite application</strong><small>Show in your Favorites filter</small></span><button type="button" className={`toggle ${form.isFavorite ? "toggle-on" : ""}`} onClick={() => update("isFavorite", !form.isFavorite)}><span /></button></label><div className="form-actions"><button type="button" className="button subtle" onClick={onCancel}>Cancel</button>{!isNew && <button type="button" className="delete-button" onClick={() => { onDelete(form.id); onCancel(); }}><Trash2 size={15} />Delete</button>}<button type="submit" className="button primary"><Check size={16} />{isNew ? "Add application" : "Save changes"}</button></div></form>;
}

function blankApp(order: number): ManagedApp { return { id: `app-${Date.now()}`, name: "", description: "", category: "Productivity", url: "", icon: "", color: "#65e6a5", healthUrl: "", status: "unknown", source: "manual", isFavorite: false, isVisible: true, sortOrder: order }; }
function BellIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>; }
function formatPercent(value: number) { return `${value.toFixed(2)}%`; }
