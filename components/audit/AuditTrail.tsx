import { format } from "date-fns";

import { cn } from "@/lib/ui";
import {
  AUDIT_TYPE_LABEL,
  type AuditEvent,
  type AuditType,
  type BadgeTone,
} from "@/lib/types";

/**
 * Minimal recipient shape needed to humanize `recipientId` references. Callers
 * (e.g. Slice B's document detail) pass the envelope's recipients so each event
 * can name the person who triggered it.
 */
export interface AuditTrailRecipient {
  id: string;
  name: string;
  email?: string | null;
}

export interface AuditTrailProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Events oldest-first (as returned by `getAuditTrail`). */
  events: AuditEvent[];
  /** Optional roster used to resolve `recipientId` -> a readable name. */
  recipients?: AuditTrailRecipient[];
  /** Visual treatment. Both are fully accessible. Defaults to `timeline`. */
  variant?: "timeline" | "table";
  /** Accessible label for the region/table. */
  title?: string;
  /** Copy shown when there are no events yet. */
  emptyLabel?: string;
}

/** Semantic tone per event type — mirrors the app's status color language. */
const TONE_BY_TYPE: Record<AuditType, BadgeTone> = {
  created: "neutral",
  sent: "info",
  viewed: "brand",
  otp_sent: "info",
  otp_verified: "success",
  signed: "success",
  completed: "success",
  downloaded: "neutral",
  declined: "danger",
  voided: "warning",
};

const DOT_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-tone-neutral",
  info: "bg-tone-info",
  success: "bg-tone-success",
  warning: "bg-tone-warning",
  danger: "bg-tone-danger",
  brand: "bg-tone-brand",
};

function formatTimestamp(value: Date | string): {
  full: string;
  iso: string;
} {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const raw = String(value);
    return { full: raw, iso: raw };
  }
  return {
    full: format(date, "MMM d, yyyy 'at' h:mm a"),
    iso: date.toISOString(),
  };
}

function actorFor(
  event: AuditEvent,
  byId: Map<string, AuditTrailRecipient>,
): string | null {
  if (event.recipientId) {
    const match = byId.get(event.recipientId);
    if (match) return match.name;
  }
  // Some events stash a name/email in metadata (e.g. a downloader).
  const meta = event.metadata as Record<string, unknown> | null;
  const metaName = meta?.recipientName ?? meta?.name ?? meta?.email;
  return typeof metaName === "string" ? metaName : null;
}

/**
 * Reusable, accessible rendering of an immutable audit trail. Renders either a
 * vertical timeline (default) or a data table, with humanized labels,
 * timestamps, the acting recipient's name, and the originating IP address.
 */
export function AuditTrail({
  events,
  recipients = [],
  variant = "timeline",
  title = "Audit trail",
  emptyLabel = "No activity has been recorded yet.",
  className,
  ...props
}: AuditTrailProps) {
  const byId = new Map(recipients.map((r) => [r.id, r]));

  if (events.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border bg-surface-2/50 px-4 py-6 text-center text-sm text-muted-foreground",
          className,
        )}
        {...props}
      >
        {emptyLabel}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div
        className={cn(
          "overflow-x-auto rounded-xl border border-border",
          className,
        )}
        {...props}
      >
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-2.5">
                Event
              </th>
              <th scope="col" className="px-4 py-2.5">
                Who
              </th>
              <th scope="col" className="px-4 py-2.5">
                When
              </th>
              <th scope="col" className="px-4 py-2.5">
                IP address
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const tone = TONE_BY_TYPE[event.type] ?? "neutral";
              const actor = actorFor(event, byId);
              const ts = formatTimestamp(event.createdAt);
              return (
                <tr
                  key={event.id}
                  className="border-b border-border last:border-0"
                >
                  <th scope="row" className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          DOT_CLASS[tone],
                        )}
                        aria-hidden="true"
                      />
                      {AUDIT_TYPE_LABEL[event.type]}
                    </span>
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    {actor ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <time dateTime={ts.iso}>{ts.full}</time>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {event.ip ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section
      aria-label={title}
      className={cn("relative", className)}
      {...props}
    >
      <ol className="relative space-y-0">
        {events.map((event, index) => {
          const tone = TONE_BY_TYPE[event.type] ?? "neutral";
          const actor = actorFor(event, byId);
          const ts = formatTimestamp(event.createdAt);
          const isLast = index === events.length - 1;
          return (
            <li key={event.id} className="relative flex gap-3.5 pb-5 last:pb-0">
              {/* Connector line + node */}
              <div className="relative flex flex-col items-center">
                <span
                  className={cn(
                    "z-10 mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-background",
                    DOT_CLASS[tone],
                  )}
                  aria-hidden="true"
                />
                {!isLast && (
                  <span
                    className="absolute top-1 h-full w-px bg-border"
                    aria-hidden="true"
                  />
                )}
              </div>

              <div className="-mt-0.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {AUDIT_TYPE_LABEL[event.type]}
                    {actor && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {actor}
                      </span>
                    )}
                  </p>
                  <time
                    dateTime={ts.iso}
                    className="text-xs tabular-nums text-muted-foreground"
                  >
                    {ts.full}
                  </time>
                </div>
                {event.ip && (
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    IP {event.ip}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
