import { useEffect, useState, type ComponentProps, type ComponentType, type CSSProperties } from "react";
import { Activity, Cloud, FolderKanban, LayoutGrid, Network, ShieldCheck, Sparkles } from "lucide-react";
import type { ManagedApp } from "@/lib/types";

const craftyIconUrl = "https://gitlab.com/uploads/-/system/project/avatar/20430749/Crafty_4-0_Logo_square.ico?width=128";
const immichIconUrl = "https://cdn.simpleicons.org/immich";
const piholeIconUrl = "https://cdn.simpleicons.org/pihole";

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
  if (normalizedId === "immich" || normalizedName === "immich") return immichIconUrl;
  if (normalizedId === "pihole" || normalizedName === "pihole") return piholeIconUrl;
  return "";
}

export function AppIcon({ app, large = false, proxy = true }: { app: ManagedApp; large?: boolean; proxy?: boolean }) {
  const Icon = iconPalette[app.id] || LayoutGrid;
  const customIcon = app.icon?.trim() || "";
  const favicon = getFaviconUrls(app.url, proxy ? app.id : undefined);
  const knownIcon = getKnownIconUrl(app);
  const iconSources = [knownIcon, customIcon, ...favicon].filter(Boolean);
  const sourceKey = iconSources.join("\u0000");
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [sourceKey]);
  const iconSource = iconSources[sourceIndex] || "";

  return <div className={`app-icon ${large ? "app-icon-large" : ""}`} data-app-id={app.id} style={{ "--app-color": app.color } as CSSProperties}>
    {iconSource ? <img key={iconSource} src={iconSource} alt="" referrerPolicy="no-referrer" onError={() => setSourceIndex((current) => current + 1)} /> : <Icon size={large ? 27 : 22} strokeWidth={1.8} aria-hidden="true" />}
  </div>;
}
