import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  documents,
  fields as fieldsTable,
  recipients as recipientsTable,
  type NewField,
  type NewRecipient,
} from "@/db/schema";
import { newId, randomToken } from "@/lib/crypto";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

const recipientSchema = z.object({
  // Client-generated id used to link fields; remapped to a server id on save.
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("A valid email is required").max(320),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  order: z.number().int().min(1).max(999),
});

const fieldSchema = z.object({
  recipientId: z.string().min(1),
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

  const { requireIdentityCheck, recipients, fields } = parsed.data;

  // Map client recipient id -> new server id.
  const idMap = new Map<string, string>();
  for (const r of recipients) idMap.set(r.id, newId("rcp"));

  // Every field must reference a known recipient.
  for (const f of fields) {
    if (!idMap.has(f.recipientId)) {
      return Response.json(
        { ok: false, error: "A field references an unknown recipient." },
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

  const fieldRows: NewField[] = fields.map((f) => ({
    id: newId("fld"),
    documentId: id,
    recipientId: idMap.get(f.recipientId)!,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    required: f.required,
  }));

  // Atomic replace via neon-http batch (interactive transactions unsupported).
  // Delete order: fields → recipients (FK), then re-insert, then update the doc.
  const ops: unknown[] = [
    db.delete(fieldsTable).where(eq(fieldsTable.documentId, id)),
    db.delete(recipientsTable).where(eq(recipientsTable.documentId, id)),
  ];
  if (recipientRows.length > 0) {
    ops.push(db.insert(recipientsTable).values(recipientRows));
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
    fieldCount: fieldRows.length,
  });
}
