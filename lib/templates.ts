import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  documents,
  fieldGroups as fieldGroupsTable,
  fields as fieldsTable,
  recipients as recipientsTable,
  type NewDocument,
  type NewField,
  type NewFieldGroup,
  type NewRecipient,
} from "@/db/schema";
import { getPdfBytes, putPdf } from "@/lib/blob";
import { newId, randomToken } from "@/lib/crypto";

export interface CloneOptions {
  /** Owner of the clone. */
  userId: string;
  /** Mark the clone as a reusable template (strips recipient PII); else a live draft. */
  asTemplate: boolean;
  /** Overrides the copied title. */
  title?: string;
}

/**
 * Deep-copy a document into a fresh draft (or template): duplicates the stored
 * PDF under a new key and clones recipients, field groups, and fields with
 * freshly-minted, internally-consistent ids. Signatures, audit events, OTP
 * state, and completion artifacts are intentionally NOT copied.
 *
 * When `asTemplate` is true the copied recipients keep their role and order but
 * lose name/email/phone, so a template never carries a real person's details.
 * Cloning a template back into a draft therefore yields empty recipient slots
 * for the sender to fill in.
 *
 * Returns the new document id.
 */
export async function cloneEnvelope(
  sourceId: string,
  { userId, asTemplate, title }: CloneOptions,
): Promise<string> {
  const [source] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, sourceId))
    .limit(1);
  if (!source) throw new Error("Source document not found.");

  const [sourceRecipients, sourceGroups, sourceFields] = await Promise.all([
    db
      .select()
      .from(recipientsTable)
      .where(eq(recipientsTable.documentId, sourceId))
      .orderBy(asc(recipientsTable.order), asc(recipientsTable.createdAt)),
    db
      .select()
      .from(fieldGroupsTable)
      .where(eq(fieldGroupsTable.documentId, sourceId)),
    db.select().from(fieldsTable).where(eq(fieldsTable.documentId, sourceId)),
  ]);

  const newDocId = newId("doc");

  // Duplicate the PDF bytes under a key owned by the new document, so deleting
  // either document later never orphans the other's file.
  const bytes = await getPdfBytes(source.originalFileKey);
  const originalFileKey = await putPdf(
    `documents/${newDocId}/original.pdf`,
    Buffer.from(bytes),
  );

  // Remap child ids up front so fields can reference the new recipient/group ids.
  const recipientIdMap = new Map<string, string>();
  for (const r of sourceRecipients) recipientIdMap.set(r.id, newId("rcp"));
  const groupIdMap = new Map<string, string>();
  for (const g of sourceGroups) groupIdMap.set(g.id, newId("grp"));

  const docRow: NewDocument = {
    id: newDocId,
    userId,
    title: title ?? source.title,
    message: source.message,
    status: "draft",
    isTemplate: asTemplate,
    requireIdentityCheck: source.requireIdentityCheck,
    originalFileKey,
    originalFileName: source.originalFileName,
    originalHash: source.originalHash,
    pageCount: source.pageCount,
  };

  const recipientRows: NewRecipient[] = sourceRecipients.map((r) => ({
    id: recipientIdMap.get(r.id)!,
    documentId: newDocId,
    // Templates never carry a real person: blank the PII, keep the slot.
    name: asTemplate ? "" : r.name,
    email: asTemplate ? "" : r.email,
    phone: asTemplate ? null : r.phone,
    order: r.order,
    role: r.role,
    status: "pending",
    token: randomToken(),
  }));

  const groupRows: NewFieldGroup[] = sourceGroups.map((g) => ({
    id: groupIdMap.get(g.id)!,
    documentId: newDocId,
    recipientId: recipientIdMap.get(g.recipientId)!,
    label: g.label,
    minSelected: g.minSelected,
    maxSelected: g.maxSelected,
  }));

  const fieldRows: NewField[] = sourceFields.map((f) => ({
    id: newId("fld"),
    documentId: newDocId,
    recipientId: recipientIdMap.get(f.recipientId)!,
    groupId: f.groupId ? (groupIdMap.get(f.groupId) ?? null) : null,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    required: f.required,
    value: f.value,
  }));

  // Insert parents before children so the FK chain (fields → groups →
  // recipients → document) always holds mid-batch. `documents` insert always
  // present, so the batch tuple is never empty.
  const ops: unknown[] = [db.insert(documents).values(docRow)];
  if (recipientRows.length > 0) {
    ops.push(db.insert(recipientsTable).values(recipientRows));
  }
  if (groupRows.length > 0) {
    ops.push(db.insert(fieldGroupsTable).values(groupRows));
  }
  if (fieldRows.length > 0) {
    ops.push(db.insert(fieldsTable).values(fieldRows));
  }

  await db.batch(ops as unknown as Parameters<typeof db.batch>[0]);

  return newDocId;
}
