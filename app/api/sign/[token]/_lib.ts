import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  documents,
  recipients,
  type Document,
  type Recipient,
} from "@/db/schema";

/**
 * Shared helpers for the public signer API routes (otp / verify / submit /
 * decline). Not a route file — Next only treats `route.ts` as an endpoint, so a
 * leading-underscore module here is safe to colocate.
 */

export interface SignerContext {
  recipient: Recipient;
  document: Document;
}

/** Resolve a signing token to its recipient + parent document, or `null`. */
export async function loadSignerByToken(
  token: string,
): Promise<SignerContext | null> {
  if (!token) return null;

  const [recipient] = await db
    .select()
    .from(recipients)
    .where(eq(recipients.token, token))
    .limit(1);
  if (!recipient) return null;

  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, recipient.documentId))
    .limit(1);
  if (!document) return null;

  return { recipient, document };
}

/**
 * True when a signer earlier in the signing order still has to act. Used to
 * enforce that a recipient can only sign when it is genuinely their turn.
 */
export async function hasEarlierPendingSigner(
  documentId: string,
  currentOrder: number,
): Promise<boolean> {
  const others = await db
    .select({
      order: recipients.order,
      status: recipients.status,
      role: recipients.role,
    })
    .from(recipients)
    .where(
      and(
        eq(recipients.documentId, documentId),
        eq(recipients.role, "signer"),
      ),
    );

  return others.some(
    (r) =>
      r.order < currentOrder &&
      r.status !== "signed" &&
      r.status !== "declined",
  );
}

export function jsonOk<T extends Record<string, unknown>>(
  data?: T,
): Response {
  return Response.json({ ok: true, ...(data ?? {}) });
}

export function jsonError(error: string, status = 400): Response {
  return Response.json({ ok: false, error }, { status });
}
