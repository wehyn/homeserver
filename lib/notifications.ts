export type ServiceStatus = "online" | "degraded" | "offline" | "unknown";
export type AlertableStatus = Exclude<ServiceStatus, "unknown">;
export type NotificationKind = "outage" | "recovery";

export type NotificationEvent = {
  appId: string;
  appName: string;
  previousStatus: AlertableStatus;
  status: AlertableStatus;
  kind: NotificationKind;
  title: string;
  body: string;
};

export const notificationPreferenceKey = "nimbus.notifications.enabled";

function isAlertableStatus(status: ServiceStatus | undefined): status is AlertableStatus {
  return status !== undefined && status !== "unknown";
}

export function getNotificationTransition(
  appId: string,
  appName: string,
  previousStatus: ServiceStatus | undefined,
  status: ServiceStatus,
): NotificationEvent | null {
  if (!isAlertableStatus(previousStatus) || !isAlertableStatus(status) || previousStatus === status) return null;

  const kind = status === "online" ? "recovery" : "outage";
  const title = kind === "recovery" ? `${appName} is back online` : `${appName} needs attention`;
  const body = kind === "recovery"
    ? `${appName} recovered from ${previousStatus}.`
    : `${appName} changed from ${previousStatus} to ${status}.`;

  return { appId, appName, previousStatus, status, kind, title, body };
}
