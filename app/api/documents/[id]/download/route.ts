import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { documents } from "@/db/schema";
import { getPdfBytes } from "@/lib/blob";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Stream the finalized (signed) PDF for a document.
 *
 * Access is granted when EITHER the caller owns the document, OR the document
 * is completed and valid (has a stored final PDF). Completed envelopes are
 * intentionally downloadable by any party that holds the link, mirroring the
 * download links emailed on completion. Drafts / in-progress envelopes are
 * owner-only.
 *
 * Every successful download is recorded as a `downloaded` audit event (IP and
 * user-agent captured automatically by `logAudit`).
 */

/** Build a safe `attachment` filename, preferring the document title. */
function downloadFilename(title: string, fallback: string): string {
  const base = (title || fallback || "document").trim();
  const withoutExt = base.replace(/\.pdf$/i, "");
  // ASCII-safe fallback for the plain `filename=`; UTF-8 for `filename*`.
  const ascii =
    withoutExt.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") ||
    "document";
  return `${ascii}.pdf`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!doc) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const user = await getCurrentUser();
  const isOwner = user?.id === doc.userId;
  const isCompletedAndValid =
    doc.status === "completed" && Boolean(doc.finalFileKey);

  if (!isOwner && !isCompletedAndValid) {
    return Response.json(
      { error: "You don't have access to this document." },
      { status: 403 },
    );
  }

  if (!doc.finalFileKey) {
    return Response.json(
      { error: "The finalized PDF for this document is not available yet." },
      { status: 409 },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await getPdfBytes(doc.finalFileKey);
  } catch {
    return Response.json(
      { error: "Failed to retrieve the finalized PDF." },
      { status: 502 },
    );
  }

  await logAudit({
    documentId: doc.id,
    type: "downloaded",
    metadata: { by: isOwner ? "owner" : "link", finalHash: doc.finalHash },
  });

  const filename = downloadFilename(doc.title, doc.originalFileName);
  const encoded = encodeURIComponent(filename);

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
    },
  });
}
