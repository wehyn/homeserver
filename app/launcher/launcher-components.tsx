import { useEffect, useState, type ReactNode } from "react";
import { resolveAppLaunchUrl } from "@/lib/app-url";
import type { ManagedApp } from "@/lib/types";
import { AppIcon } from "./icons";
import { statusCopy } from "./utils";

export function LauncherTile({ app }: { app: ManagedApp }) {
  const [launchUrl, setLaunchUrl] = useState(app.url);

  useEffect(() => {
    setLaunchUrl(resolveAppLaunchUrl(app, window.location.hostname));
  }, [app]);

  return <a className="launcher-tile" href={launchUrl} target="_blank" rel="noreferrer" aria-label={app.name} title={`${app.name} · ${statusCopy[app.status]}`}>
    <span className="launcher-iconwrap"><AppIcon app={app} large /></span>
  </a>;
}

export function SystemMetric({ icon, label, value, progress, tone, onOpen, loading = false, variant = "bar" }: { icon: ReactNode; label: string; value: string; progress?: number; tone: "green" | "blue" | "orange"; onOpen?: () => void; loading?: boolean; variant?: "ring" | "bar" }) {
  const clamped = progress === undefined ? 0 : Math.min(100, Math.max(0, progress));
  const metricClass = variant === "ring" ? "system-metric-ring" : "system-metric-storage";
  const content = variant === "ring" ? <>
    <span className="system-ring-header"><span className={`system-metric-icon ${tone}`}>{icon}</span><span className="system-metric-label">{label}</span></span>
    <span className="system-ring-wrap" role="progressbar" aria-label={`${label} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress === undefined ? undefined : Math.round(clamped)}>
      <svg className={`system-ring-svg ${tone}`} viewBox="0 0 120 120" aria-hidden="true">
        <circle className="system-ring-track" cx="60" cy="60" r="45" pathLength="100" strokeDasharray="78 22" />
        <circle className="system-ring-fill" cx="60" cy="60" r="45" pathLength="100" strokeDasharray={`${clamped * .78} ${100 - (clamped * .78)}`} />
      </svg>
      <strong className="system-ring-value">{value}</strong>
    </span>
  </> : <>
    <span className={`system-metric-icon ${tone}`}>{icon}</span>
    <span className="system-metric-label">{label}</span>
    <strong className="system-metric-value">{value}</strong>
    <span className="system-meter" role="progressbar" aria-label={`${label} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress === undefined ? undefined : Math.round(clamped)}>
      <span className={`system-meter-fill ${tone}`} style={{ width: `${clamped}%` }} />
    </span>
  </>;

  return onOpen
    ? <button type="button" className={`system-metric ${metricClass} system-metric-link`} onClick={onOpen} aria-label={`View ${label.toLowerCase()} details`} aria-busy={loading}>{content}</button>
    : <div className={`system-metric ${metricClass}`} aria-busy={loading}>{content}</div>;
}
