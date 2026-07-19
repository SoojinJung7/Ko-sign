import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { documents, fields as fieldsTable } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { getDictionary } from "@/lib/i18n/server";
import { EmptyState } from "@/components/ui";
import { UseTemplateButton, DeleteTemplateButton } from "./TemplateActions";

export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.templates.pageTitle };
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const newEnvelopeCta =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default async function TemplatesPage() {
  const user = await requireAdmin();
  const t = await getDictionary();

  const templates = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, user.id), eq(documents.isTemplate, true)))
    .orderBy(desc(documents.createdAt));

  // Field counts per template, in one grouped query.
  const fieldCount = new Map<string, number>();
  if (templates.length > 0) {
    const rows = await db
      .select({
        documentId: fieldsTable.documentId,
        n: sql<number>`count(*)::int`,
      })
      .from(fieldsTable)
      .where(
        inArray(
          fieldsTable.documentId,
          templates.map((d) => d.id),
        ),
      )
      .groupBy(fieldsTable.documentId);
    for (const r of rows) fieldCount.set(r.documentId, Number(r.n));
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t.templates.heading}
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {t.templates.description}
        </p>
      </header>

      <section className="mt-8">
        {templates.length === 0 ? (
          <EmptyState
            title={t.templates.empty}
            description={t.templates.emptyDescription}
            action={
              <Link href="/dashboard" className={newEnvelopeCta}>
                {t.sender.allEnvelopes}
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {templates.map((tpl) => {
              const count = fieldCount.get(tpl.id) ?? 0;
              return (
                <li
                  key={tpl.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:p-5"
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
                      <rect x="4" y="3" width="16" height="18" rx="2" />
                      <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {tpl.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        {count}
                        {count === 1
                          ? t.templates.fieldSuffixOne
                          : t.templates.fieldSuffixOther}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t.sender.createdLabel} {dateFmt.format(tpl.createdAt)}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <UseTemplateButton templateId={tpl.id} />
                    <DeleteTemplateButton templateId={tpl.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
