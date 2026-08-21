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

  return <a className="launcher-tile" href={launchUrl} target="_blank" rel="noreferrer" title={`${app.name} · ${statusCopy[app.status]}`}>
    <span className="launcher-iconwrap"><AppIcon app={app} large /></span>
    <span className="launcher-name">{app.name}</span>
  </a>;
}

export function LauncherGauge({ percent, children }: { percent?: number; children: ReactNode }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.75;
  const gap = circumference - arc;
  const clamped = percent === undefined ? 0 : Math.min(100, Math.max(0, percent));

  return <div className="launcher-gauge">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle className="launcher-gauge-track" cx="60" cy="60" r={radius} strokeWidth="11" fill="none" strokeDasharray={`${arc} ${gap}`} transform="rotate(135 60 60)" />
      {percent !== undefined && <circle className="launcher-gauge-fill" cx="60" cy="60" r={radius} strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray={`${arc} ${circumference}`} strokeDashoffset={arc * (1 - clamped / 100)} transform="rotate(135 60 60)" />}
    </svg>
    <div className="launcher-gauge-value">{children}</div>
  </div>;
}

export function LauncherWidget({ icon, label, value, detail, progress, tone, onOpen, loading = false, children }: { icon: ReactNode; label: string; value: string; detail?: string; progress?: number; tone: string; onOpen?: () => void; loading?: boolean; children?: ReactNode }) {
  const content = <>
    <div className="launcher-widget-top"><span className={`stat-icon ${tone}`}>{icon}</span><span>{label}</span></div>
    <div className="launcher-gauge-wrap"><LauncherGauge percent={progress}>{value}</LauncherGauge></div>
    {detail && <div className="launcher-widget-detail">{detail}</div>}
    {children}
  </>;

  return onOpen
    ? <button type="button" className="launcher-widget launcher-widget-link" onClick={onOpen} aria-label={`View ${label.toLowerCase()} details`} aria-busy={loading}>{content}</button>
    : <div className="launcher-widget" aria-busy={loading}>{content}</div>;
}
