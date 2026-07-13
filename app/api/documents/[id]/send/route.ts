import { eq } from "drizzle-orm";

import { db } from "@/db";
import { documents } from "@/db/schema";
import { sendEnvelope } from "@/lib/envelope";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Send a draft envelope: delegates to `sendEnvelope`, which validates the
 * envelope, issues signing tokens, transitions status → `sent`, emails the
 * first signer, and audits `sent`.
 */
export async function POST(
  _request: Request,
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
      { ok: false, error: "This envelope has already been sent." },
      { status: 409 },
    );
  }

  try {
    await sendEnvelope(id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send the envelope.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }

  return Response.json({ ok: true });
}
