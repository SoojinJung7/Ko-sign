/**
 * User-facing timestamps must not depend on where the code runs. Server
 * components format on the host (UTC on Vercel), which silently rendered legal
 * audit times nine hours off. Every display formatter therefore pins the zone
 * explicitly and labels it, so a signed record is unambiguous.
 */

export const DISPLAY_TIME_ZONE = "Asia/Seoul";
export const DISPLAY_TIME_ZONE_LABEL = "KST";

const dateOnly = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
});

const timeOnly = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
});

/** e.g. `Sep 1, 2026` */
export function formatDate(value: Date): string {
  return dateOnly.format(value);
}

/** e.g. `Sep 1, 2026, 10:45 AM` */
export function formatDateTime(value: Date): string {
  return dateTime.format(value);
}

/**
 * Audit rows carry the zone label — these timestamps end up in the certificate
 * of completion and in disputes, where "10:45 AM" alone is not evidence.
 * e.g. `Sep 1, 2026 at 10:45 AM KST`
 */
export function formatAuditTimestamp(value: Date): string {
  return `${dateOnly.format(value)} at ${timeOnly.format(value)} ${DISPLAY_TIME_ZONE_LABEL}`;
}
