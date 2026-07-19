import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { documents, recipients } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n/server";
import { cn } from "@/lib/ui";
import {
  DOC_STATUS_TONE,
  DOC_STATUSES,
  type BadgeTone,
  type DocStatus,
} from "@/lib/types";
import { EmptyState, StatusBadge } from "@/components/ui";

export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.sender.dashboardTitle };
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const toneDot: Record<BadgeTone, string> = {
  neutral: "bg-tone-neutral",
  info: "bg-tone-info",
  success: "bg-tone-success",
  warning: "bg-tone-warning",
  danger: "bg-tone-danger",
  brand: "bg-tone-brand",
};

const newEnvelopeCta =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const PlusIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getDictionary();

  const docs = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.userId, user.id), eq(documents.isTemplate, false)),
    )
    .orderBy(desc(documents.createdAt));

  // Recipient counts in a single grouped query.
  const recipientCount = new Map<string, number>();
  if (docs.length > 0) {
    const rows = await db
      .select({
        documentId: recipients.documentId,
        n: sql<number>`count(*)::int`,
      })
      .from(recipients)
      .where(
        inArray(
          recipients.documentId,
          docs.map((d) => d.id),
        ),
      )
      .groupBy(recipients.documentId);
    for (const r of rows) recipientCount.set(r.documentId, Number(r.n));
  }

  const statusCounts = DOC_STATUSES.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<DocStatus, number>,
  );
  for (const d of docs) statusCounts[d.status] += 1;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      {/* Header */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t.sender.envelopesHeading}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {docs.length === 0
              ? t.sender.noEnvelopesYet
              : `${docs.length}${docs.length === 1 ? t.sender.totalSuffixOne : t.sender.totalSuffixOther}`}
          </p>
        </div>
        <Link href="/documents/new" className={newEnvelopeCta}>
          {PlusIcon}
          {t.sender.newEnvelope}
        </Link>
      </header>

      {/* Status summary */}
      {docs.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DOC_STATUSES.map((status) => {
            const tone = DOC_STATUS_TONE[status];
            return (
              <div
                key={status}
                className="rounded-xl border border-border bg-card p-4"
              >
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      toneDot[tone],
                    )}
                    aria-hidden="true"
                  />
                  {t.status.doc[status]}
                </dt>
                <dd className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                  {statusCounts[status]}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {/* List */}
      <section className="mt-8">
        {docs.length === 0 ? (
          <EmptyState
            title={t.sender.emptyTitle}
            description={t.sender.emptyDescription}
            action={
              <Link href="/documents/new" className={newEnvelopeCta}>
                {PlusIcon}
                {t.sender.createFirstEnvelope}
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {docs.map((doc) => {
              const count = recipientCount.get(doc.id) ?? 0;
              return (
                <li key={doc.id}>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-[box-shadow,border-color,transform] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-5"
                  >
                    <span
                      className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-brand-500 dark:text-brand-300 sm:inline-flex"
                      aria-hidden="true"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <path
                          d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"
                          strokeLinejoin="round"
                        />
                        <path d="M14 3v5h5" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {doc.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          {count}
                          {count === 1
                            ? t.sender.recipientSuffixOne
                            : t.sender.recipientSuffixOther}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {t.sender.createdLabel} {dateFmt.format(doc.createdAt)}
                        </span>
                      </p>
                    </div>
                    <StatusBadge
                      kind="document"
                      status={doc.status}
                      label={t.status.doc[doc.status]}
                      className="shrink-0"
                    />
                    <svg
                      className="hidden shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
