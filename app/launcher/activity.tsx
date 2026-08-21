import { Activity, ChevronDown, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import type { ActivityEvent } from "@/lib/types";

export function ActivityRow({ activity }: { activity: ActivityEvent }) {
  return <div className="activity-row"><span className={`activity-icon ${activityTone(activity)}`}>{activityIcon(activity)}</span><div><strong>{activityTitle(activity)}</strong><small>{formatRelativeTime(activity.createdAt)}</small></div><ChevronDown size={14} className="activity-arrow" /></div>;
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
