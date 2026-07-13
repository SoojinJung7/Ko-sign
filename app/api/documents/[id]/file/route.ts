import { eq } from "drizzle-orm";

import { db } from "@/db";
import { documents } from "@/db/schema";
import { getPdfBytes } from "@/lib/blob";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Streams the ORIGINAL uploaded PDF for a document the current user owns.
 * Same-origin source for the prepare editor's client-side pdf.js renderer so
 * we never expose the raw blob URL to the browser.
 */
export async function GET(
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

  let bytes: Uint8Array;
  try {
    bytes = await getPdfBytes(doc.originalFileKey);
  } catch {
    return Response.json(
      { ok: false, error: "The document file could not be read." },
      { status: 502 },
    );
  }

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${encodeURIComponent(
        doc.originalFileName,
      )}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
