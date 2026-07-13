"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { documents, recipients } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { sendSigningInvite } from "@/lib/email";
import { recipientSignUrl } from "@/lib/envelope";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Void a sender's envelope. Ownership-checked and audit-logged. Only draft or
 * in-progress (`sent`) envelopes can be voided — completed / already-voided /
 * declined envelopes are terminal.
 */
export async function voidEnvelope(documentId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) return { ok: false, error: "Envelope not found." };
  if (doc.status !== "sent" && doc.status !== "draft") {
    return { ok: false, error: `A ${doc.status} envelope cannot be voided.` };
  }

  await db
    .update(documents)
    .set({ status: "voided", voidedAt: new Date() })
    .where(eq(documents.id, documentId));

  await logAudit({ documentId, type: "voided" });

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Re-send the signing invitation email to a single recipient. Ownership-checked
 * (via the parent document), audit-logged, and only valid while the envelope is
 * in progress and the recipient is a signer who has not yet signed or declined.
 */
export async function resendToRecipient(
  recipientId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const [row] = await db
    .select({ recipient: recipients, doc: documents })
    .from(recipients)
    .innerJoin(documents, eq(recipients.documentId, documents.id))
    .where(and(eq(recipients.id, recipientId), eq(documents.userId, user.id)))
    .limit(1);

  if (!row) return { ok: false, error: "Recipient not found." };

  const { recipient, doc } = row;

  if (doc.status !== "sent") {
    return { ok: false, error: "This envelope is not in progress." };
  }
  if (recipient.role !== "signer") {
    return { ok: false, error: "Only signers receive a signing invite." };
  }
  if (recipient.status === "signed") {
    return { ok: false, error: "This recipient has already signed." };
  }
  if (recipient.status === "declined") {
    return { ok: false, error: "This recipient declined to sign." };
  }

  await sendSigningInvite({
    to: recipient.email,
    recipientName: recipient.name,
    senderName: user.name || user.email,
    documentTitle: doc.title,
    message: doc.message,
    signUrl: recipientSignUrl(recipient.token),
  });

  // A never-notified recipient moves to `sent`; already-notified ones keep
  // their more-advanced status (e.g. `viewed`).
  if (recipient.status === "pending") {
    await db
      .update(recipients)
      .set({ status: "sent" })
      .where(eq(recipients.id, recipient.id));
  }

  await logAudit({
    documentId: doc.id,
    recipientId: recipient.id,
    type: "sent",
    metadata: { resend: true, to: recipient.email },
  });

  revalidatePath(`/documents/${doc.id}`);
  return { ok: true };
}
