"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Cpu, Database, HardDrive, RefreshCw, Search, Settings2, Thermometer, TriangleAlert, Zap } from "lucide-react";
import type { ActivityEvent, AppStatus, ManagedApp, ServerOverview } from "@/lib/types";
import SystemDetailsModal, { type SystemDetailKind } from "@/app/system-details-modal";
import { LauncherTile, SystemMetric } from "@/app/launcher/launcher-components";
import { SettingsPanel } from "@/app/launcher/settings-panel";
import { formatPercent, formatPower, formatTemperature, isAppStatus } from "@/app/launcher/utils";

const motionTransition = { duration: 0.2, ease: "easeOut" as const };

export default function Home() {
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState("");
  const [overview, setOverview] = useState<ServerOverview | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemDetails, setSystemDetails] = useState<SystemDetailKind | null>(null);
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
  const systemDetailsTriggerRef = useRef<HTMLElement | null>(null);
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

  const openSystemDetails = useCallback((kind: SystemDetailKind) => {
    const activeElement = document.activeElement;
    systemDetailsTriggerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setSystemDetails(kind);
  }, []);

  const closeSystemDetails = useCallback(() => {
    setSystemDetails(null);
  }, []);

  useEffect(() => {
    if (settingsOpen) return;
    const trigger = settingsTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
    settingsTriggerRef.current = null;
  }, [settingsOpen]);

  useEffect(() => {
    if (systemDetails) return;
    const trigger = systemDetailsTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
    systemDetailsTriggerRef.current = null;
  }, [systemDetails]);

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
      // Activity history is supplementary; a malformed response must not make an app mutation fail.
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
  const temperatureValue = overview ? formatTemperature(overview.temperatureC) : "—";
  const powerValue = overview ? formatPower(overview.powerWatts) : "—";

  let launcherContent: React.ReactNode;
  if (appsLoading) {
    launcherContent = <motion.div key="apps-loading" className="empty-state" role="status" aria-live="polite" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><RefreshCw size={24} className="spin" aria-hidden="true" /><strong>Loading applications…</strong><span>Checking the application registry.</span></motion.div>;
  } else if (appsError) {
    launcherContent = <motion.div key="apps-error" className="empty-state" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><TriangleAlert size={28} aria-hidden="true" /><strong>Applications unavailable</strong><span>{appsError}</span><button type="button" className="small-primary" onClick={() => void loadApps()}>Try again</button></motion.div>;
  } else if (visibleApps.length) {
    launcherContent = <motion.div key="app-grid" className="launcher-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition}><AnimatePresence initial={false} mode="popLayout">{visibleApps.map((app) => <motion.div key={app.id} className="launcher-tile-wrap" layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={motionTransition}><LauncherTile app={app} /></motion.div>)}</AnimatePresence></motion.div>;
  } else {
    launcherContent = <motion.div key="empty-state" className="empty-state" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransition}><Search size={28} aria-hidden="true" /><strong>No visible applications</strong><span>Add an application or make one visible in management.</span><button type="button" className="small-primary" onClick={() => openSettings(null)}>Manage applications</button></motion.div>;
  }

  return <main className="launcher">
    <header className="launcher-bar">
      <div className="launcher-clock"><span className="launcher-time">{clockTime || "—"}</span><span className="launcher-date">{clockDate}</span></div>
      <div className="launcher-actions"><span className="launcher-uptime" role="status" aria-label={`System uptime: ${overview?.uptime || "—"}`}>{overview?.uptime || "—"}</span><button type="button" className="launcher-icon-button" onClick={() => { void refreshOverview(); void refreshHealth(); }} title={overviewError ? "Retry system metrics" : "Refresh metrics and service health"} aria-label={overviewError ? "Retry system metrics" : "Refresh metrics and service health"}><RefreshCw size={22} className={refreshing || overviewRefreshing ? "spin" : ""} /></button><button type="button" className="launcher-icon-button" onClick={() => openSettings(null)} aria-label="Application management" title="Application management"><Settings2 size={22} /></button></div>
    </header>
    <section className="launcher-body">
      <section className="launcher-system" aria-label="System overview">
        <div className="system-card" aria-busy={overviewRefreshing}>
          <div className="system-ring-grid">
            <SystemMetric icon={<Cpu size={24} />} label="CPU" value={cpuValue} progress={overview?.cpu} tone="green" variant="ring" onOpen={() => openSystemDetails("processor")} loading={overviewRefreshing} />
            <SystemMetric icon={<Database size={24} />} label="Memory" value={memoryValue} progress={overview?.memory} tone="blue" variant="ring" onOpen={() => openSystemDetails("memory")} loading={overviewRefreshing} />
          </div>
          <SystemMetric icon={<HardDrive size={24} />} label="Storage" value={storageValue} progress={overview?.storage} tone="orange" variant="bar" loading={overviewRefreshing} />
          <div className="system-card-meta">
            <span><Thermometer size={21} aria-hidden="true" /><strong>{temperatureValue}</strong><span className="system-card-meta-separator">·</span><Zap size={15} aria-hidden="true" /><strong>{powerValue}</strong></span>
          </div>
        </div>
      </section>
      <section className="launcher-apps" aria-label="Applications" aria-busy={appsLoading}>
        <AnimatePresence mode="wait" initial={false}>{launcherContent}</AnimatePresence>
      </section>
    </section>
    <AnimatePresence initial={false}>{settingsOpen && <motion.div key="application-modal" className="panel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition} onClick={closeSettings}><SettingsPanel apps={apps} activities={activities} editing={editing} deletingId={deletingId} saving={saving} mutationError={mutationError} onRefreshActivity={() => void refreshActivities()} onClose={closeSettings} onEdit={setEditing} onSave={saveApp} onDelete={deleteApp} /></motion.div>}</AnimatePresence>
    <AnimatePresence initial={false}>{systemDetails && <SystemDetailsModal key={systemDetails} kind={systemDetails} onClose={closeSystemDetails} />}</AnimatePresence>
    {savedNotice && <div className="toast" role="status"><Check size={16} aria-hidden="true" />Changes saved</div>}
    {mutationError && !settingsOpen && <div className="toast toast-error" role="alert"><TriangleAlert size={16} aria-hidden="true" />{mutationError}</div>}
  </main>;
}
