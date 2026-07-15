import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  documents,
  fieldGroups as fieldGroupsTable,
  fields as fieldsTable,
  recipients as recipientsTable,
  type NewField,
  type NewFieldGroup,
  type NewRecipient,
} from "@/db/schema";
import { newId, randomToken } from "@/lib/crypto";
import { requireUser } from "@/lib/session";
import { en } from "@/lib/i18n/locales/en";
import {
  formatGroupIssue,
  groupRuleIssue,
  MAX_GROUP_MEMBERS,
} from "@/lib/types";

export const runtime = "nodejs";

const recipientSchema = z.object({
  // Client-generated id used to link fields; remapped to a server id on save.
  id: z.string().min(1),
  // Draft-tolerant: allow blank name/email so an in-progress recipient can be
  // saved. Completeness is enforced at send time (see sendEnvelope). Store empty
  // strings, never null — recipients.name/email are NOT NULL columns.
  name: z.string().trim().max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .refine(
      (v) => v === "" || z.string().email().safeParse(v).success,
      "A valid email is required",
    ),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  order: z.number().int().min(1).max(999),
});

const groupSchema = z.object({
  // Client-generated id used to link member checkboxes; remapped on save.
  id: z.string().min(1),
  recipientId: z.string().min(1),
  label: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  minSelected: z.number().int().min(0).max(MAX_GROUP_MEMBERS),
  maxSelected: z.number().int().min(1).max(MAX_GROUP_MEMBERS).nullable(),
});

const fieldSchema = z.object({
  recipientId: z.string().min(1),
  groupId: z.string().min(1).optional().nullable(),
  type: z.enum(["signature", "initials", "date", "text", "checkbox"]),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.001).max(1),
  height: z.number().min(0.001).max(1),
  required: z.boolean().default(true),
});

const bodySchema = z.object({
  requireIdentityCheck: z.boolean().default(false),
  recipients: z.array(recipientSchema).max(50),
  groups: z.array(groupSchema).max(100).default([]),
  fields: z.array(fieldSchema).max(500),
});

/**
 * Replace the draft envelope's recipients + fields wholesale. Field
 * `recipientId`s reference the client recipient ids, which we remap to freshly
 * minted server ids. Runs as a single neon-http batch (atomic).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!doc || doc.userId !== user.id) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (doc.status !== "draft") {
    return Response.json(
      { ok: false, error: "This envelope has already been sent and can no longer be edited." },
      { status: 409 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Validation failed.", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { requireIdentityCheck, recipients, groups, fields } = parsed.data;

  // Map client ids -> new server ids.
  const idMap = new Map<string, string>();
  for (const r of recipients) idMap.set(r.id, newId("rcp"));

  const groupIdMap = new Map<string, string>();
  for (const g of groups) groupIdMap.set(g.id, newId("grp"));

  for (const g of groups) {
    if (!idMap.has(g.recipientId)) {
      return Response.json(
        { ok: false, error: "A checkbox group references an unknown recipient." },
        { status: 422 },
      );
    }
  }

  // Every field must reference a known recipient, and a grouped field must be a
  // checkbox belonging to a group owned by that same recipient — a group that
  // spans recipients could never be satisfied, since each signer only ever sees
  // and submits their own fields.
  const memberCount = new Map<string, number>();
  for (const f of fields) {
    if (!idMap.has(f.recipientId)) {
      return Response.json(
        { ok: false, error: "A field references an unknown recipient." },
        { status: 422 },
      );
    }
    if (!f.groupId) continue;

    const group = groups.find((g) => g.id === f.groupId);
    if (!group) {
      return Response.json(
        { ok: false, error: "A checkbox references an unknown group." },
        { status: 422 },
      );
    }
    if (f.type !== "checkbox") {
      return Response.json(
        { ok: false, error: "Only checkboxes can belong to a choice group." },
        { status: 422 },
      );
    }
    if (group.recipientId !== f.recipientId) {
      return Response.json(
        {
          ok: false,
          error: "A checkbox group can't span more than one recipient.",
        },
        { status: 422 },
      );
    }
    memberCount.set(f.groupId, (memberCount.get(f.groupId) ?? 0) + 1);
  }

  // Reject rules no signer could ever satisfy (min above the member count, an
  // empty group, an inverted range).
  for (const g of groups) {
    const issue = groupRuleIssue(
      { minSelected: g.minSelected, maxSelected: g.maxSelected },
      memberCount.get(g.id) ?? 0,
    );
    if (issue) {
      return Response.json(
        {
          ok: false,
          error: `${g.label ? `“${g.label}”: ` : "A checkbox group is invalid: "}${formatGroupIssue(issue, en.groupIssue)}`,
        },
        { status: 422 },
      );
    }
  }

  const recipientRows: NewRecipient[] = recipients.map((r) => ({
    id: idMap.get(r.id)!,
    documentId: id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    order: r.order,
    role: "signer",
    status: "pending",
    token: randomToken(),
  }));

  const groupRows: NewFieldGroup[] = groups.map((g) => ({
    id: groupIdMap.get(g.id)!,
    documentId: id,
    recipientId: idMap.get(g.recipientId)!,
    label: g.label,
    minSelected: g.minSelected,
    maxSelected: g.maxSelected,
  }));

  const fieldRows: NewField[] = fields.map((f) => ({
    id: newId("fld"),
    documentId: id,
    recipientId: idMap.get(f.recipientId)!,
    groupId: f.groupId ? groupIdMap.get(f.groupId)! : null,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    // A grouped checkbox's requirement lives on its group, never on itself.
    required: f.groupId ? false : f.required,
  }));

  // Atomic replace via neon-http batch (interactive transactions unsupported).
  // Delete children before parents and insert parents before children, so the
  // FK chain (fields → groups → recipients) always holds mid-batch.
  const ops: unknown[] = [
    db.delete(fieldsTable).where(eq(fieldsTable.documentId, id)),
    db.delete(fieldGroupsTable).where(eq(fieldGroupsTable.documentId, id)),
    db.delete(recipientsTable).where(eq(recipientsTable.documentId, id)),
  ];
  if (recipientRows.length > 0) {
    ops.push(db.insert(recipientsTable).values(recipientRows));
  }
  if (groupRows.length > 0) {
    ops.push(db.insert(fieldGroupsTable).values(groupRows));
  }
  if (fieldRows.length > 0) {
    ops.push(db.insert(fieldsTable).values(fieldRows));
  }
  ops.push(
    db
      .update(documents)
      .set({ requireIdentityCheck })
      .where(eq(documents.id, id)),
  );

  // db.batch requires a non-empty tuple; the two deletes always guarantee that.
  await db.batch(
    ops as unknown as Parameters<typeof db.batch>[0],
  );

  return Response.json({
    ok: true,
    recipientCount: recipientRows.length,
    groupCount: groupRows.length,
    fieldCount: fieldRows.length,
  });
}
