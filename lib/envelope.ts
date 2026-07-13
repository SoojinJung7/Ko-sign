import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  documents,
  fields,
  recipients,
  users,
  type Recipient,
} from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { putPdf } from "@/lib/blob";
import {
  sendCompletedNotice,
  sendSigningInvite,
} from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { finalizeDocument } from "@/lib/pdf";

export const runtime = "nodejs";

/**
 * Envelope orchestration: token issuance, status transitions, notifications,
 * audit logging, and finalization. Features call these; they never re-implement
 * the flow.
 */

/** Public signing URL for a recipient token. */
export function recipientSignUrl(token: string): string {
  return `${env.APP_URL}/sign/${token}`;
}

async function senderName(userId: string): Promise<string> {
  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.name || user?.email || "A Ko-sign user";
}

function isSigner(recipient: Recipient): boolean {
  return recipient.role === "signer";
}

/**
 * Transition a draft envelope to `sent`: validate it has recipients and fields,
 * (re)issue signing tokens, and email the first signer in the signing order.
 */
export async function sendEnvelope(documentId: string): Promise<void> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) throw new Error(`Document ${documentId} not found`);
  if (doc.status !== "draft") {
    throw new Error(`Envelope ${documentId} is not a draft (status=${doc.status})`);
  }

  const docRecipients = await db
    .select()
    .from(recipients)
    .where(eq(recipients.documentId, documentId))
    .orderBy(asc(recipients.order), asc(recipients.createdAt));

  if (docRecipients.length === 0) {
    throw new Error("Cannot send an envelope with no recipients");
  }

  const docFields = await db
    .select({ id: fields.id })
    .from(fields)
    .where(eq(fields.documentId, documentId));
  if (docFields.length === 0) {
    throw new Error("Cannot send an envelope with no fields");
  }

  const signers = docRecipients.filter(isSigner);
  if (signers.length === 0) {
    throw new Error("Cannot send an envelope with no signers");
  }

  // Completeness enforcement: a draft may hold partially-filled recipients, but
  // an envelope can never be *sent* with a missing name or an empty/invalid
  // email. (The prepare route deliberately allows saving blanks; this is the
  // gate that keeps them from being dispatched.)
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const recipient of docRecipients) {
    if (!recipient.name.trim()) {
      throw new Error("Every recipient must have a name before sending.");
    }
    if (!recipient.email.trim() || !emailRe.test(recipient.email.trim())) {
      throw new Error("Every recipient must have a valid email before sending.");
    }
  }

  const now = new Date();

  // Issue fresh tokens for every recipient and reset their status to 'pending'.
  const tokens = new Map<string, string>();
  for (const recipient of docRecipients) {
    const token = randomToken();
    tokens.set(recipient.id, token);
    await db
      .update(recipients)
      .set({ token, status: "pending", viewedAt: null, signedAt: null })
      .where(eq(recipients.id, recipient.id));
  }

  // Email the first signer(s) in the lowest order tier BEFORE flipping the
  // envelope to 'sent'. If an invite send throws, the envelope stays 'draft'
  // and remains resendable rather than being stranded as 'sent' with an
  // unnotified first signer.
  const firstOrder = signers[0].order;
  const firstTier = signers.filter((s) => s.order === firstOrder);
  const from = await senderName(doc.userId);

  for (const recipient of firstTier) {
    const token = tokens.get(recipient.id);
    if (!token) continue;
    await db
      .update(recipients)
      .set({ status: "sent" })
      .where(eq(recipients.id, recipient.id));
    await sendSigningInvite({
      to: recipient.email,
      recipientName: recipient.name,
      senderName: from,
      documentTitle: doc.title,
      message: doc.message,
      signUrl: recipientSignUrl(token),
    });
  }

  // Mark the envelope sent only after the first-tier invites have gone out.
  await db
    .update(documents)
    .set({ status: "sent", sentAt: now })
    .where(eq(documents.id, documentId));

  await logAudit({
    documentId,
    type: "sent",
    metadata: { recipientCount: docRecipients.length, fieldCount: docFields.length },
  });
}

/**
 * Called after a signer signs. If more signers remain, notify the next in the
 * signing order. Otherwise finalize the document: stamp + certificate, store to
 * blob, mark completed, and notify all parties.
 */
export async function notifyNextOrFinalize(documentId: string): Promise<void> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) throw new Error(`Document ${documentId} not found`);
  if (doc.status === "completed" || doc.status === "voided") return;

  const docRecipients = await db
    .select()
    .from(recipients)
    .where(eq(recipients.documentId, documentId))
    .orderBy(asc(recipients.order), asc(recipients.createdAt));

  const signers = docRecipients.filter(isSigner);

  // Next signer = lowest-order signer who has not yet signed or declined.
  const next = signers.find(
    (s) => s.status !== "signed" && s.status !== "declined",
  );

  if (next) {
    const from = await senderName(doc.userId);
    if (next.status !== "sent") {
      await db
        .update(recipients)
        .set({ status: "sent" })
        .where(eq(recipients.id, next.id));
    }
    await sendSigningInvite({
      to: next.email,
      recipientName: next.name,
      senderName: from,
      documentTitle: doc.title,
      message: doc.message,
      signUrl: recipientSignUrl(next.token),
    });
    return;
  }

  // All signers done → finalize. Use a single timestamp so the certificate PDF
  // and the DB completedAt (and thus the verify page) agree exactly.
  const now = new Date();
  const { finalBytes, finalHash } = await finalizeDocument(documentId, now);
  const finalFileKey = await putPdf(
    `documents/${documentId}/final.pdf`,
    Buffer.from(finalBytes),
  );

  await db
    .update(documents)
    .set({
      status: "completed",
      finalFileKey,
      finalHash,
      completedAt: now,
    })
    .where(eq(documents.id, documentId));

  await logAudit({
    documentId,
    type: "completed",
    metadata: { finalHash },
  });

  // Notify the sender and every recipient with a download link.
  const downloadUrl = `${env.APP_URL}/api/documents/${documentId}/download`;
  const [owner] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, doc.userId))
    .limit(1);

  const notified = new Set<string>();
  const notify = async (to: string | null | undefined) => {
    if (!to) return;
    const key = to.toLowerCase();
    if (notified.has(key)) return;
    notified.add(key);
    await sendCompletedNotice({
      to,
      documentTitle: doc.title,
      downloadUrl,
    });
  };

  await notify(owner?.email);
  for (const recipient of docRecipients) {
    await notify(recipient.email);
  }
}
