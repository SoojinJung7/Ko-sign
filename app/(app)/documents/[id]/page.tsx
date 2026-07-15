import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { documents, recipients } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getAuditTrail } from "@/lib/audit";
import { RECIPIENT_STATUS_LABEL } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@/components/ui";
import { AuditTrail } from "@/components/audit/AuditTrail";

import {
  FinishProcessingBanner,
  ResendButton,
  VoidEnvelopeButton,
} from "./DocumentActions";

export const runtime = "nodejs";

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const linkPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const [doc] = await db
    .select({ title: documents.title })
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
    .limit(1);
  return { title: doc?.title ?? "Envelope" };
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) notFound();

  const docRecipients = await db
    .select()
    .from(recipients)
    .where(eq(recipients.documentId, doc.id))
    .orderBy(asc(recipients.order), asc(recipients.createdAt));

  const auditTrail = await getAuditTrail(doc.id);

  const canResend = doc.status === "sent";

  // An in-progress envelope whose signers are all done should have finalized
  // itself. If it hasn't, finalization failed after the last signature landed
  // and only the owner can drive the retry.
  const signers = docRecipients.filter((r) => r.role === "signer");
  const stalled =
    doc.status === "sent" &&
    signers.length > 0 &&
    signers.every((r) => r.status === "signed");

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      {/* Breadcrumb */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        All envelopes
      </Link>

      {/* Header */}
      <header className="mt-4 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {doc.title}
            </h1>
            <StatusBadge kind="document" status={doc.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {doc.originalFileName} · Created {dateTimeFmt.format(doc.createdAt)}
            {doc.sentAt ? ` · Sent ${dateTimeFmt.format(doc.sentAt)}` : ""}
            {doc.completedAt
              ? ` · Completed ${dateTimeFmt.format(doc.completedAt)}`
              : ""}
          </p>
        </div>

        {/* Primary status-driven action */}
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {doc.status === "draft" && (
            <Link href={`/documents/${doc.id}/prepare`} className={linkPrimary}>
              Continue preparing
            </Link>
          )}
          {doc.status === "completed" && (
            <a
              href={`/api/documents/${doc.id}/download`}
              className={linkPrimary}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                <path d="M5 21h14" />
              </svg>
              Download signed PDF
            </a>
          )}
          {doc.status === "sent" && <VoidEnvelopeButton documentId={doc.id} />}
        </div>
      </header>

      {stalled && <FinishProcessingBanner documentId={doc.id} />}

      {/* Message */}
      {doc.message && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Message to recipients</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {doc.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recipients */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            Recipients ({docRecipients.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {docRecipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recipients have been added yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {docRecipients.map((r) => {
                const eligibleToResend =
                  canResend &&
                  r.role === "signer" &&
                  r.status !== "signed" &&
                  r.status !== "declined";
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <span
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold tabular-nums text-muted-foreground"
                      title={`Signing order ${r.order}`}
                      aria-label={`Signing order ${r.order}`}
                    >
                      {r.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.name}
                        {r.role === "viewer" && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (viewer)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.email}
                        {r.phone ? ` · ${r.phone}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge
                        kind="recipient"
                        status={r.status}
                        aria-label={`Status: ${RECIPIENT_STATUS_LABEL[r.status]}`}
                      />
                      {eligibleToResend && <ResendButton recipientId={r.id} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Audit trail */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTrail events={auditTrail} recipients={docRecipients} />
        </CardContent>
      </Card>
    </div>
  );
}
