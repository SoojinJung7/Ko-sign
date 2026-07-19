"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { documents, recipients } from "@/db/schema";
import { getCurrentUser, isAdminEmail } from "@/lib/session";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { logAudit } from "@/lib/audit";
import { sendSigningInvite } from "@/lib/email";
import { notifyNextOrFinalize, recipientSignUrl } from "@/lib/envelope";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Void a sender's envelope. Ownership-checked and audit-logged. Only draft or
 * in-progress (`sent`) envelopes can be voided — completed / already-voided /
 * declined envelopes are terminal.
 */
export async function voidEnvelope(documentId: string): Promise<ActionResult> {
  const t = await getDictionary();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: t.sender.notSignedIn };
  if (!isAdminEmail(user.email)) return { ok: false, error: t.sender.forbidden };

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) return { ok: false, error: t.sender.envelopeNotFound };
  if (doc.status !== "sent" && doc.status !== "draft") {
    return {
      ok: false,
      error: `${t.sender.cannotVoidPrefix}${t.status.doc[doc.status]}${t.sender.cannotVoidSuffix}`,
    };
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
 * Retry advancing an in-progress envelope — notify the next signer, or finalize
 * it if everyone has signed.
 *
 * Signing commits the signature first and advances the envelope second, so a
 * failure in the second half (a PDF that won't stamp, blob storage down, an
 * email that bounces) leaves the envelope stranded at `sent` with nothing the
 * signer can do: they cannot sign twice. This lets the owner drive the retry
 * once the cause is gone. `notifyNextOrFinalize` re-derives everything it needs
 * from the recipients' current state, so calling it again is safe.
 */
export async function retryEnvelopeAdvance(
  documentId: string,
): Promise<ActionResult> {
  const t = await getDictionary();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: t.sender.notSignedIn };
  if (!isAdminEmail(user.email)) return { ok: false, error: t.sender.forbidden };

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) return { ok: false, error: t.sender.envelopeNotFound };
  if (doc.status !== "sent") {
    return { ok: false, error: t.sender.envelopeNotInProgress };
  }

  try {
    await notifyNextOrFinalize(documentId, await getLocale());
  } catch (err) {
    console.error(`[retryEnvelopeAdvance] ${documentId} failed:`, err);
    return {
      ok: false,
      // Surface the underlying reason: the owner is the only one who can act
      // on "blob storage rejected it" vs "that PDF won't stamp".
      error:
        err instanceof Error
          ? `${t.sender.stalledRetryFailedPrefix}${err.message}`
          : t.sender.stalledRetryFailed,
    };
  }

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
  const t = await getDictionary();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: t.sender.notSignedIn };
  if (!isAdminEmail(user.email)) return { ok: false, error: t.sender.forbidden };

  const [row] = await db
    .select({ recipient: recipients, doc: documents })
    .from(recipients)
    .innerJoin(documents, eq(recipients.documentId, documents.id))
    .where(and(eq(recipients.id, recipientId), eq(documents.userId, user.id)))
    .limit(1);

  if (!row) return { ok: false, error: t.sender.recipientNotFound };

  const { recipient, doc } = row;

  if (doc.status !== "sent") {
    return { ok: false, error: t.sender.envelopeNotInProgress };
  }
  if (recipient.role !== "signer") {
    return { ok: false, error: t.sender.onlySignersInvite };
  }
  if (recipient.status === "signed") {
    return { ok: false, error: t.sender.recipientAlreadySigned };
  }
  if (recipient.status === "declined") {
    return { ok: false, error: t.sender.recipientDeclined };
  }

  await sendSigningInvite({
    to: recipient.email,
    recipientName: recipient.name,
    senderName: user.name || user.email,
    documentTitle: doc.title,
    message: doc.message,
    signUrl: recipientSignUrl(recipient.token),
    locale: await getLocale(),
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
