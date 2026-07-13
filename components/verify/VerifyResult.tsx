import { format } from "date-fns";

import { cn } from "@/lib/ui";
import { Badge } from "@/components/ui";
import type { BadgeTone } from "@/lib/types";
import type { VerifyResponse, VerifyStatus } from "./types";

/* -------------------------------------------------------------------------- */
/* Per-status presentation                                                    */
/* -------------------------------------------------------------------------- */

interface StatusStyle {
  label: string;
  tone: BadgeTone;
  /** Trust-badge gradient / ring surface classes. */
  badge: string;
  icon: React.ReactNode;
}

const shieldCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <path
      d="M12 3 5 6v5.5c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6l-7-3Z"
      strokeLinejoin="round"
    />
    <path
      d="m9 12 2 2 4-4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const shieldAlert = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <path
      d="M12 3 5 6v5.5c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6l-7-3Z"
      strokeLinejoin="round"
    />
    <path d="M12 8.5v4" strokeLinecap="round" />
    <path d="M12 16h.01" strokeLinecap="round" />
  </svg>
);

const shieldQuestion = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <path
      d="M12 3 5 6v5.5c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6l-7-3Z"
      strokeLinejoin="round"
    />
    <path
      d="M10.4 9.6a1.7 1.7 0 0 1 3.3.5c0 1.2-1.7 1.5-1.7 2.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 15.5h.01" strokeLinecap="round" />
  </svg>
);

const STATUS_STYLES: Record<VerifyStatus, StatusStyle> = {
  authentic: {
    label: "Authentic",
    tone: "success",
    badge:
      "bg-tone-success-soft text-tone-success ring-tone-success-line",
    icon: shieldCheck,
  },
  tampered: {
    label: "Tampered",
    tone: "danger",
    badge: "bg-tone-danger-soft text-tone-danger ring-tone-danger-line",
    icon: shieldAlert,
  },
  unknown: {
    label: "Not found",
    tone: "warning",
    badge:
      "bg-tone-warning-soft text-tone-warning ring-tone-warning-line",
    icon: shieldQuestion,
  },
};

/* -------------------------------------------------------------------------- */

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : format(d, "MMMM d, yyyy 'at' h:mm a");
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-border py-3.5 first:border-t-0 first:pt-0 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm font-medium text-muted-foreground sm:w-40">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function VerifyResult({ result }: { result: VerifyResponse }) {
  const style = STATUS_STYLES[result.status];
  const summary = result.summary;
  const completedAt = summary ? formatDate(summary.completedAt) : null;
  const matchedHash = summary?.finalHash || result.computedHash || null;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-md"
      role="status"
      aria-live="polite"
    >
      {/* Trust badge banner */}
      <div className="flex items-center gap-4 border-b border-border bg-surface-2/50 p-5 sm:p-6">
        <span
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl ring-1 [&_svg]:size-8",
            style.badge,
          )}
          aria-hidden="true"
        >
          {style.icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {style.label}
            </h2>
            <Badge tone={style.tone} size="sm">
              {result.status === "authentic"
                ? "Verified"
                : result.status === "tampered"
                  ? "No match"
                  : "Unverified"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.message}
          </p>
        </div>
      </div>

      {/* Details */}
      {(summary || matchedHash) && (
        <dl className="p-5 sm:p-6">
          {summary && (
            <Row label="Document">
              <span className="font-medium">{summary.title}</span>
            </Row>
          )}
          {summary && (
            <Row label="Document ID">
              <span className="break-all font-mono text-xs text-muted-foreground">
                {summary.documentId}
              </span>
            </Row>
          )}
          {completedAt && <Row label="Completed">{completedAt}</Row>}
          {summary && summary.signers.length > 0 && (
            <Row label="Signers">
              <ul className="space-y-1.5">
                {summary.signers.map((s, i) => {
                  const signedAt = formatDate(s.signedAt);
                  return (
                    <li key={`${s.email}-${i}`} className="leading-snug">
                      <span className="font-medium">{s.name}</span>{" "}
                      <span className="text-muted-foreground">
                        &lt;{s.email}&gt;
                      </span>
                      {signedAt && (
                        <span className="block text-xs text-muted-foreground">
                          Signed {signedAt}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Row>
          )}
          {matchedHash && (
            <Row
              label={
                result.status === "authentic" && result.computedHash
                  ? "Matched SHA-256"
                  : "SHA-256"
              }
            >
              <code className="block break-all rounded-md bg-surface-2 px-2.5 py-2 font-mono text-xs text-foreground">
                {matchedHash}
              </code>
              {result.status === "tampered" && result.computedHash && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  This is the fingerprint of the file you uploaded. It does not
                  match any completed document.
                </p>
              )}
            </Row>
          )}
        </dl>
      )}
    </div>
  );
}
