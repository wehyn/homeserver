export const ACTIVITY_CLOCK_INTERVAL_MS = 30_000;

export function formatRelativeTime(createdAt: string, now = Date.now()) {
  const elapsed = Math.max(0, now - new Date(createdAt).getTime());
  if (!Number.isFinite(elapsed)) return "Recently";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function startActivityClock(
  onTick: () => void,
  setIntervalFn: (callback: () => void, delay: number) => unknown = (callback, delay) => window.setInterval(callback, delay),
  clearIntervalFn: (handle: unknown) => void = (handle) => window.clearInterval(handle as number),
) {
  const interval = setIntervalFn(onTick, ACTIVITY_CLOCK_INTERVAL_MS);
  return () => clearIntervalFn(interval);
}
