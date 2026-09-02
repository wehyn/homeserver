import { useEffect, useState, type ComponentProps, type ComponentType, type CSSProperties } from "react";
import { Activity, Cloud, FolderKanban, LayoutGrid, Network, ShieldCheck, Sparkles } from "lucide-react";
import type { ManagedApp } from "@/lib/types";

const craftyIconUrl = "/icons/crafty-controller.ico";
const defaultBrandIconUrls = new Set([
  "https://cdn.simpleicons.org/immich",
  "https://cdn.simpleicons.org/pihole",
]);
const legacyColorizedIconUrls: Record<string, string> = {
  "https://cdn.simpleicons.org/minecraft/65E6A5": "https://cdn.simpleicons.org/minecraft",
  "https://cdn.simpleicons.org/nextcloud/8BE9FD": "https://cdn.simpleicons.org/nextcloud",
  "https://cdn.simpleicons.org/jellyfin/b08cff": "https://cdn.simpleicons.org/jellyfin",
  "https://cdn.simpleicons.org/adguard/65e6a5": "https://cdn.simpleicons.org/adguard",
  "https://cdn.simpleicons.org/uptimekuma/65e6a5": "https://cdn.simpleicons.org/uptimekuma",
  "https://cdn.simpleicons.org/paperlessngx/ffb86b": "https://cdn.simpleicons.org/paperlessngx",
  "https://cdn.simpleicons.org/openwrt/8be9fd": "https://cdn.simpleicons.org/openwrt",
  "https://cdn.simpleicons.org/immich/ffb86b": "https://cdn.simpleicons.org/immich",
};

const iconPalette: Record<string, ComponentType<ComponentProps<typeof Cloud>>> = {
  "crafty-controller": GamepadIcon,
  "cloud-drive": Cloud,
  immich: Sparkles,
  jellyfin: PlayIcon,
  "adguard-home": ShieldCheck,
  "uptime-kuma": Activity,
  paperless: FolderKanban,
  router: Network,
};

function GamepadIcon(props: ComponentProps<typeof Cloud>) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.4 9.2h11.2a4.6 4.6 0 0 1 4.3 6.2l-1 2.8a2.5 2.5 0 0 1-4.4.5l-1.7-2.2H9.2l-1.7 2.2a2.5 2.5 0 0 1-4.4-.5l-1-2.8a4.6 4.6 0 0 1 4.3-6.2Z"/><path d="M7 12v4m-2-2h4m8-1h.01m2 2h.01"/></svg>;
}

function PlayIcon(props: ComponentProps<typeof Cloud>) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m10 8 5 4-5 4V8Z"/></svg>;
}

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
  return "";
}

export function AppIcon({ app, large = false, proxy = true }: { app: ManagedApp; large?: boolean; proxy?: boolean }) {
  const Icon = iconPalette[app.id] || LayoutGrid;
  const customIcon = getCustomIconUrl(app);
  const favicon = getFaviconUrls(app.url, proxy ? app.id : undefined);
  const knownIcon = getKnownIconUrl(app);
  const iconSources = [knownIcon, customIcon, ...favicon].filter(Boolean);
  const sourceKey = iconSources.join("\u0000");
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [sourceKey]);
  const iconSource = iconSources[sourceIndex] || "";

  return <div className={`app-icon ${large ? "app-icon-large" : ""}`} data-app-id={app.id} style={{ "--app-color": app.color } as CSSProperties}>
    {iconSource ? <img key={iconSource} src={iconSource} alt="" aria-hidden="true" referrerPolicy="no-referrer" onError={() => setSourceIndex((current) => current + 1)} /> : <Icon size={large ? 27 : 22} strokeWidth={1.8} aria-hidden="true" focusable="false" />}
  </div>;
}

function normalizeIconUrl(iconUrl: string) {
  return legacyColorizedIconUrls[iconUrl] || iconUrl;
}

function getCustomIconUrl(app: ManagedApp) {
  const iconUrl = normalizeIconUrl(app.icon?.trim() || "");
  if (!iconUrl || !isFaviconFirstApp(app)) return iconUrl;
  return defaultBrandIconUrls.has(iconUrl) ? "" : iconUrl;
}

function isFaviconFirstApp(app: ManagedApp) {
  const normalizedId = app.id.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedName = app.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalizedId === "immich" || normalizedName === "immich"
    || normalizedId === "pihole" || normalizedName === "pihole";
}
