import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditEvents, type AuditEvent, type AuditType } from "@/db/schema";
import { newId } from "@/lib/crypto";

/**
 * Immutable audit trail. Every meaningful state transition writes one row here;
 * IP and user-agent are captured automatically from the incoming request.
 */

/** Best-effort extraction of client IP + user-agent from request headers. */
async function readRequestMeta(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const forwardedFor = h.get("x-forwarded-for");
    const ip =
      (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null) ||
      h.get("x-real-ip") ||
      h.get("x-vercel-forwarded-for") ||
      null;
    const userAgent = h.get("user-agent");
    return { ip: ip || null, userAgent: userAgent || null };
  } catch {
    // Called outside a request scope (e.g. a background job) — no request meta.
    return { ip: null, userAgent: null };
  }
}

export async function logAudit(input: {
  documentId: string;
  recipientId?: string | null;
  type: AuditType;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { ip, userAgent } = await readRequestMeta();

  await db.insert(auditEvents).values({
    id: newId("aud"),
    documentId: input.documentId,
    recipientId: input.recipientId ?? null,
    type: input.type,
    ip,
    userAgent,
    metadata: input.metadata ?? null,
  });
}

/** Full audit trail for a document, oldest event first. */
export async function getAuditTrail(documentId: string): Promise<AuditEvent[]> {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.documentId, documentId))
    .orderBy(asc(auditEvents.createdAt));
}
