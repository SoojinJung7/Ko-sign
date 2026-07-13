import { db } from "@/db";
import { documents } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { putPdf } from "@/lib/blob";
import { newId, sha256Hex } from "@/lib/crypto";
import { getPdfPageCount } from "@/lib/pdf";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/** `%PDF` magic header. */
function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function deriveTitle(explicit: string | null, fileName: string): string {
  const fromExplicit = explicit?.trim();
  if (fromExplicit) return fromExplicit.slice(0, 200);
  const base = fileName.replace(/\.pdf$/i, "").trim();
  return (base || "Untitled document").slice(0, 200);
}

/**
 * Create a draft envelope from an uploaded PDF: store the file in blob, hash it
 * (`originalHash`), count pages, insert the document row, and audit `created`.
 */
export async function POST(request: Request) {
  const user = await requireUser();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { ok: false, error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, error: "No PDF file was provided." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return Response.json(
      { ok: false, error: "The uploaded file is empty." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { ok: false, error: "File is too large (25 MB maximum)." },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!looksLikePdf(buffer)) {
    return Response.json(
      { ok: false, error: "Only PDF files are supported." },
      { status: 415 },
    );
  }

  let pageCount: number;
  try {
    pageCount = await getPdfPageCount(buffer);
  } catch {
    return Response.json(
      { ok: false, error: "This PDF appears to be corrupted or unreadable." },
      { status: 422 },
    );
  }

  const id = newId("doc");
  const originalHash = sha256Hex(buffer);
  const originalFileName = file.name || "document.pdf";
  const title = deriveTitle(
    typeof form.get("title") === "string" ? (form.get("title") as string) : null,
    originalFileName,
  );

  const originalFileKey = await putPdf(
    `documents/${id}/original.pdf`,
    buffer,
  );

  await db.insert(documents).values({
    id,
    userId: user.id,
    title,
    status: "draft",
    originalFileKey,
    originalFileName,
    originalHash,
    pageCount,
  });

  await logAudit({
    documentId: id,
    type: "created",
    metadata: { originalFileName, pageCount, originalHash },
  });

  return Response.json({ ok: true, id }, { status: 201 });
}
