import { asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { documents, recipients, type Document } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import type {
  VerifyResponse,
  VerifySigner,
  VerifySummary,
} from "@/components/verify/types";

export const runtime = "nodejs";

/**
 * Public document verification.
 *
 * Two modes, distinguished by request body:
 *  - JSON `{ documentId }` — look the envelope up directly and return its
 *    completion summary + SHA-256 on record.
 *  - multipart file upload — hash the uploaded bytes and search for a document
 *    whose finalized PDF hash matches. A match is `authentic`; anything else is
 *    reported as `tampered` (the bytes don't correspond to any completed record).
 *
 * The endpoint is intentionally unauthenticated: it only ever discloses the
 * document title, completion date, and signer names/emails for a document the
 * caller already possesses (by id or by holding its exact bytes).
 */

async function buildSummary(doc: Document): Promise<VerifySummary> {
  const signerRows = await db
    .select({
      name: recipients.name,
      email: recipients.email,
      role: recipients.role,
      signedAt: recipients.signedAt,
    })
    .from(recipients)
    .where(eq(recipients.documentId, doc.id))
    .orderBy(asc(recipients.order), asc(recipients.createdAt));

  const signers: VerifySigner[] = signerRows
    .filter((r) => r.role === "signer")
    .map((r) => ({
      name: r.name,
      email: r.email,
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
    }));

  return {
    documentId: doc.id,
    title: doc.title,
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    finalHash: doc.finalHash ?? "",
    signers,
  };
}

function json(body: VerifyResponse, status = 200): Response {
  return Response.json(body, { status });
}

async function verifyByDocumentId(documentId: string): Promise<Response> {
  const id = documentId.trim();
  if (!id) {
    return json(
      { status: "unknown", message: "Enter a document ID to verify." },
      400,
    );
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!doc) {
    return json({
      status: "unknown",
      message:
        "No document matches that ID. Check for typos, or upload the PDF instead.",
    });
  }

  const summary = await buildSummary(doc);

  if (doc.status === "completed" && doc.finalHash) {
    return json({
      status: "authentic",
      summary,
      message:
        "This document is on record as completed. Its signed PDF carries the SHA-256 fingerprint shown below.",
    });
  }

  return json({
    status: "unknown",
    summary,
    message:
      "This document exists but has not been completed yet, so there is no final signed PDF to verify against.",
  });
}

async function verifyByFile(bytes: Uint8Array): Promise<Response> {
  const computedHash = sha256Hex(Buffer.from(bytes));

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.finalHash, computedHash))
    .limit(1);

  if (doc) {
    const summary = await buildSummary(doc);
    return json({
      status: "authentic",
      summary,
      computedHash,
      message:
        "Verified. The uploaded file's SHA-256 fingerprint exactly matches a completed document on record — it has not been altered.",
    });
  }

  return json({
    status: "tampered",
    computedHash,
    message:
      "This file does not match any completed document on record. It may have been modified after signing, or it was never processed here.",
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const documentId = form.get("documentId");

      if (file instanceof File && file.size > 0) {
        const buffer = new Uint8Array(await file.arrayBuffer());
        return await verifyByFile(buffer);
      }

      if (typeof documentId === "string" && documentId.trim()) {
        return await verifyByDocumentId(documentId);
      }

      return json(
        {
          status: "unknown",
          message: "Upload a PDF file or provide a document ID to verify.",
        },
        400,
      );
    }

    // Default: JSON body.
    const body = (await request.json().catch(() => null)) as {
      documentId?: unknown;
    } | null;

    if (body && typeof body.documentId === "string") {
      return await verifyByDocumentId(body.documentId);
    }

    return json(
      {
        status: "unknown",
        message: "Provide a documentId, or upload a PDF file to verify.",
      },
      400,
    );
  } catch {
    return json(
      {
        status: "unknown",
        message:
          "We couldn't process that request. Please try again with a valid PDF or document ID.",
      },
      400,
    );
  }
}
