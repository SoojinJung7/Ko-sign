import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  fields as fieldsTable,
  recipients,
  signatures,
  type Field,
} from "@/db/schema";
import { newId } from "@/lib/crypto";
import { isSmsConfigured } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { notifyNextOrFinalize } from "@/lib/envelope";

import {
  hasEarlierPendingSigner,
  jsonError,
  jsonOk,
  loadSignerByToken,
} from "../_lib";

export const runtime = "nodejs";

const fieldSchema = z.object({
  fieldId: z.string().min(1),
  kind: z.enum(["drawn", "typed"]).optional(),
  value: z.string().optional(),
  imageData: z.string().optional(),
});

const bodySchema = z.object({
  fields: z.array(fieldSchema),
});

/** True when the supplied entry actually contains a value for its field type. */
function isSatisfied(field: Field, entry?: z.infer<typeof fieldSchema>): boolean {
  if (!entry) return false;
  switch (field.type) {
    case "signature":
    case "initials":
      return Boolean(
        (entry.imageData && entry.imageData.length > 0) ||
          (entry.value && entry.value.trim().length > 0),
      );
    case "checkbox": {
      const v = (entry.value ?? "").trim().toLowerCase();
      return v === "true" || v === "1" || v === "yes" || v === "on";
    }
    case "date":
    case "text":
    default:
      return Boolean(entry.value && entry.value.trim().length > 0);
  }
}

/**
 * POST /api/sign/[token]/submit  { fields: [{ fieldId, value?, imageData?, kind? }] }
 * Persist this recipient's field values + signatures, mark them signed, and
 * advance the envelope (notify the next signer or finalize the document).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const signer = await loadSignerByToken(token);
  if (!signer) return jsonError("This signing link is invalid.", 404);

  const { recipient, document } = signer;

  /* ---- State guards ---------------------------------------------------- */
  if (recipient.role !== "signer") {
    return jsonError("This recipient is a viewer and cannot sign.", 403);
  }
  if (recipient.status === "signed") {
    return jsonError("You have already signed this document.", 409);
  }
  if (
    recipient.status === "declined" ||
    document.status === "declined" ||
    document.status === "voided"
  ) {
    return jsonError("This document is no longer available for signing.", 409);
  }
  if (await hasEarlierPendingSigner(document.id, recipient.order)) {
    return jsonError(
      "It isn't your turn yet — another signer needs to act first.",
      409,
    );
  }

  /* ---- Identity gate --------------------------------------------------- */
  // If the envelope requires an identity check and we can actually deliver a
  // code (recipient has a phone and SMS is configured), the OTP must be
  // verified before a signature is accepted.
  if (
    document.requireIdentityCheck &&
    recipient.phone &&
    isSmsConfigured &&
    !recipient.otpVerifiedAt
  ) {
    return jsonError("Please verify your identity before signing.", 403);
  }

  /* ---- Parse + validate against THIS recipient's fields ---------------- */
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return jsonError("The submitted signature data was malformed.", 400);
  }

  const recipientFields: Field[] = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.recipientId, recipient.id));

  const fieldById = new Map(recipientFields.map((f) => [f.id, f]));
  const entryById = new Map(parsed.fields.map((e) => [e.fieldId, e]));

  // Reject values aimed at fields that aren't this recipient's.
  for (const entry of parsed.fields) {
    if (!fieldById.has(entry.fieldId)) {
      return jsonError("That field does not belong to you.", 400);
    }
  }

  // Every required field must be satisfied.
  for (const field of recipientFields) {
    if (field.required && !isSatisfied(field, entryById.get(field.id))) {
      return jsonError("Please complete all required fields.", 400);
    }
  }

  /* ---- Persist --------------------------------------------------------- */
  const now = new Date();
  const sigFieldIds = recipientFields
    .filter((f) => f.type === "signature" || f.type === "initials")
    .map((f) => f.id);

  // Clear any prior signatures for these fields so a re-submission is clean.
  if (sigFieldIds.length > 0) {
    await db
      .delete(signatures)
      .where(inArray(signatures.fieldId, sigFieldIds));
  }

  for (const field of recipientFields) {
    const entry = entryById.get(field.id);
    if (!entry) continue;

    if (field.type === "signature" || field.type === "initials") {
      const hasImage = Boolean(entry.imageData && entry.imageData.length > 0);
      const hasTyped = Boolean(entry.value && entry.value.trim().length > 0);
      if (!hasImage && !hasTyped) continue;
      const kind = entry.kind ?? (hasImage ? "drawn" : "typed");
      await db.insert(signatures).values({
        id: newId("sig"),
        recipientId: recipient.id,
        fieldId: field.id,
        kind,
        imageData: hasImage ? entry.imageData ?? null : null,
        value: hasTyped ? entry.value?.trim() ?? null : null,
      });
    } else {
      // date / text / checkbox → store directly on the field.
      const value =
        field.type === "checkbox"
          ? isSatisfied(field, entry)
            ? "true"
            : "false"
          : entry.value?.trim() ?? "";
      await db
        .update(fieldsTable)
        .set({ value })
        .where(eq(fieldsTable.id, field.id));
    }
  }

  await db
    .update(recipients)
    .set({ status: "signed", signedAt: now })
    .where(eq(recipients.id, recipient.id));

  await logAudit({
    documentId: document.id,
    recipientId: recipient.id,
    type: "signed",
    metadata: { fieldCount: recipientFields.length },
  });

  // Advance the envelope: email the next signer, or finalize + notify all.
  await notifyNextOrFinalize(document.id);

  return jsonOk();
}
