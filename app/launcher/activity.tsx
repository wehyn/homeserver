import { useEffect, useState } from "react";
import { Activity, ChevronDown, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import type { ActivityEvent } from "@/lib/types";
import { formatRelativeTime, startActivityClock } from "@/lib/relative-time";

export function ActivityRow({ activity, now }: { activity: ActivityEvent; now?: number }) {
  return <div className="activity-row"><span className={`activity-icon ${activityTone(activity)}`} aria-hidden="true">{activityIcon(activity)}</span><div><strong>{activityTitle(activity)}</strong><small>{formatRelativeTime(activity.createdAt, now)}</small></div><ChevronDown size={14} className="activity-arrow" aria-hidden="true" focusable="false" /></div>;
}

export function ActivityList({ activities }: { activities: ActivityEvent[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => startActivityClock(() => setNow(Date.now())), []);
  return <div>{activities.map((activity) => <ActivityRow key={activity.id} activity={activity} now={now} />)}</div>;
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
