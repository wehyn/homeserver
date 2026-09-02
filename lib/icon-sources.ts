import type { ManagedApp } from "./types";

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

export function getIconSources(app: Pick<ManagedApp, "id" | "name" | "url" | "icon">, proxy = true) {
  if (!proxy) return [];
  const knownIcon = getKnownIconUrl(app);
  const customIcon = getCustomIconUrl(app);
  const favicon = getFaviconUrls(app.url, app.id);
  return [knownIcon, customIcon, ...favicon].filter(Boolean);
}

function getFaviconUrls(url: string, appId?: string) {
  try {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol)) return [];
    return appId ? [`/api/icon?id=${encodeURIComponent(appId)}`] : [];
  } catch {
    return [];
  }
}

function getKnownIconUrl(app: Pick<ManagedApp, "id" | "name">) {
  const normalizedId = app.id.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedName = app.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isCrafty = normalizedId === "craftycontroller"
    || ["crafty", "craftycontroller", "crafty4"].includes(normalizedName);
  if (isCrafty) return craftyIconUrl;
  return "";
}

function normalizeIconUrl(iconUrl: string) {
  return legacyColorizedIconUrls[iconUrl] || iconUrl;
}

function getCustomIconUrl(app: Pick<ManagedApp, "id" | "name" | "icon">) {
  const iconUrl = normalizeIconUrl(app.icon?.trim() || "");
  if (!iconUrl || !isFaviconFirstApp(app)) return iconUrl;
  return defaultBrandIconUrls.has(iconUrl) ? "" : iconUrl;
}

function isFaviconFirstApp(app: Pick<ManagedApp, "id" | "name">) {
  const normalizedId = app.id.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedName = app.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalizedId === "immich" || normalizedName === "immich"
    || normalizedId === "pihole" || normalizedName === "pihole";
}
