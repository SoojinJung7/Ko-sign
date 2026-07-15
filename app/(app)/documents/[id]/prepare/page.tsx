import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  documents,
  fieldGroups as fieldGroupsTable,
  fields as fieldsTable,
  recipients as recipientsTable,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n/server";
import {
  PrepareEditor,
  type EditorField,
  type EditorGroup,
  type EditorRecipient,
} from "@/components/prepare/PrepareEditor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.sender.prepareEnvelope };
}

export default async function PreparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!doc || doc.userId !== user.id) notFound();

  // Only drafts are editable; sent/completed envelopes go to their detail view.
  if (doc.status !== "draft") redirect(`/documents/${id}`);

  const [recipientRows, groupRows, fieldRows] = await Promise.all([
    db
      .select()
      .from(recipientsTable)
      .where(eq(recipientsTable.documentId, id))
      .orderBy(asc(recipientsTable.order), asc(recipientsTable.createdAt)),
    db
      .select()
      .from(fieldGroupsTable)
      .where(eq(fieldGroupsTable.documentId, id))
      .orderBy(asc(fieldGroupsTable.createdAt)),
    db.select().from(fieldsTable).where(eq(fieldsTable.documentId, id)),
  ]);

  const initialRecipients: EditorRecipient[] = recipientRows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? "",
    order: r.order,
  }));

  const initialGroups: EditorGroup[] = groupRows.map((g) => ({
    id: g.id,
    recipientId: g.recipientId,
    label: g.label ?? "",
    minSelected: g.minSelected,
    maxSelected: g.maxSelected,
  }));

  const initialFields: EditorField[] = fieldRows.map((f) => ({
    id: f.id,
    recipientId: f.recipientId,
    groupId: f.groupId,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    required: f.required,
  }));

  return (
    <PrepareEditor
      documentId={doc.id}
      title={doc.title}
      pageCount={doc.pageCount}
      pdfUrl={`/api/documents/${doc.id}/file`}
      requireIdentityCheck={doc.requireIdentityCheck}
      initialRecipients={initialRecipients}
      initialGroups={initialGroups}
      initialFields={initialFields}
    />
  );
}
