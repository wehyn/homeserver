import "server-only";

import type { NotificationEvent } from "./notifications";

const deliveryTimeoutMs = 4_500;

export async function deliverNotificationEvent(event: NotificationEvent) {
  const webhookUrl = process.env.NIMBUS_NOTIFICATION_WEBHOOK_URL?.trim() || "";

  if (webhookUrl && !isHttpUrl(webhookUrl)) throw new Error("Configured notification webhook must use HTTP(S).");
  if (!webhookUrl) return { delivered: false, configured: false, channels: 0 };

  const results = await Promise.allSettled([deliverWebhook(webhookUrl, event)]);
  const successful = results.filter((result) => result.status === "fulfilled" && result.value.ok).length;
  return { delivered: successful > 0, configured: true, channels: successful };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function deliverWebhook(url: string, event: NotificationEvent) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "nimbus", event }),
    signal: AbortSignal.timeout(deliveryTimeoutMs),
  });
}
