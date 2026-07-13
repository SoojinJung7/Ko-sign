import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { documents, recipients } from "@/db/schema";
import { logAudit } from "@/lib/audit";

import { jsonError, jsonOk, loadSignerByToken } from "../_lib";

export const runtime = "nodejs";

const bodySchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/sign/[token]/decline  { reason? }
 * Record that this recipient declined to sign, capture their reason, and void
 * the envelope for everyone (status → declined).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const signer = await loadSignerByToken(token);
  if (!signer) return jsonError("This signing link is invalid.", 404);

  const { recipient, document } = signer;

  if (recipient.status === "signed") {
    return jsonError("You have already signed this document.", 409);
  }
  if (recipient.status === "declined" || document.status === "declined") {
    return jsonError("This document has already been declined.", 409);
  }
  if (document.status === "voided" || document.status === "completed") {
    return jsonError("This document is no longer available.", 409);
  }

  let reason: string | undefined;
  try {
    reason = bodySchema.parse(await req.json().catch(() => ({}))).reason;
  } catch {
    return jsonError("Please provide a valid reason.", 400);
  }
  const trimmed = reason && reason.length > 0 ? reason : null;

  await db
    .update(recipients)
    .set({ status: "declined", declinedReason: trimmed })
    .where(eq(recipients.id, recipient.id));

  await db
    .update(documents)
    .set({ status: "declined" })
    .where(eq(documents.id, document.id));

  await logAudit({
    documentId: document.id,
    recipientId: recipient.id,
    type: "declined",
    metadata: trimmed ? { reason: trimmed } : undefined,
  });

  return jsonOk();
}
