import { asc, eq, inArray } from "drizzle-orm";
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";

import { db } from "@/db";
import {
  auditEvents,
  documents,
  fields,
  recipients,
  signatures,
  type AuditEvent,
  type Field,
  type Recipient,
  type Signature,
} from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { getPdfBytes } from "@/lib/blob";

export const runtime = "nodejs";

/**
 * Server-only PDF finalization. Loads a document's fields + signatures +
 * recipients + audit trail, stamps every value onto the original PDF at its
 * normalized (top-left origin) coordinates, and appends a Certificate of
 * Completion. Pure: returns bytes + hash; the caller persists them.
 */

/* -------------------------------------------------------------------------- */
/* Geometry helpers (normalized top-left → pdf-lib bottom-left points)        */
/* -------------------------------------------------------------------------- */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Resolve a field's normalized rect to absolute points on a given page. */
function toPageRect(field: Field, page: PDFPage): Rect {
  const pw = page.getWidth();
  const ph = page.getHeight();
  const width = field.width * pw;
  const height = field.height * ph;
  const x = field.x * pw;
  // Field y is the distance of the field's TOP edge from the page top.
  // Convert to pdf-lib's bottom-left origin: bottom edge = ph - top - height.
  const y = ph - field.y * ph - height;
  return { x, y, width, height };
}

/**
 * Fields store a 1-based page number (pdf.js convention). Clamp defensively so
 * a stray value never throws.
 */
function pageIndexFor(field: Field, pageCount: number): number {
  const idx = field.page - 1;
  if (idx < 0) return 0;
  if (idx > pageCount - 1) return pageCount - 1;
  return idx;
}

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma === -1) {
    throw new Error("Invalid image data URL for signature");
  }
  const header = dataUrl.slice(5, comma); // e.g. "image/png;base64"
  const semi = header.indexOf(";");
  const mime = (semi === -1 ? header : header.slice(0, semi)).toLowerCase();
  const data = dataUrl.slice(comma + 1);
  return {
    mime,
    bytes: new Uint8Array(Buffer.from(data, "base64")),
  };
}

/* -------------------------------------------------------------------------- */
/* Field stamping                                                             */
/* -------------------------------------------------------------------------- */

const INK = rgb(0.11, 0.12, 0.19);
const CHECK = rgb(0.31, 0.27, 0.9);

/** Draw a value centered vertically within the rect, clipped to its width. */
function drawFittedText(
  page: PDFPage,
  text: string,
  rect: Rect,
  font: PDFFont,
): void {
  if (!text) return;
  let size = Math.min(rect.height * 0.7, 16);
  size = Math.max(size, 6);
  // Shrink to fit width if needed.
  let width = font.widthOfTextAtSize(text, size);
  while (width > rect.width && size > 5) {
    size -= 0.5;
    width = font.widthOfTextAtSize(text, size);
  }
  const textY = rect.y + (rect.height - size) / 2 + size * 0.1;
  page.drawText(text, {
    x: rect.x + 2,
    y: textY,
    size,
    font,
    color: INK,
    maxWidth: rect.width,
    lineHeight: size * 1.1,
  });
}

/** Draw a checkmark inside the rect. */
function drawCheck(page: PDFPage, rect: Rect): void {
  const pad = Math.min(rect.width, rect.height) * 0.2;
  const x0 = rect.x + pad;
  const x1 = rect.x + rect.width * 0.42;
  const x2 = rect.x + rect.width - pad;
  const yMid = rect.y + rect.height * 0.45;
  const yBottom = rect.y + pad;
  const yTop = rect.y + rect.height - pad;
  const thickness = Math.max(Math.min(rect.width, rect.height) * 0.12, 1);
  page.drawLine({
    start: { x: x0, y: yMid },
    end: { x: x1, y: yBottom },
    thickness,
    color: CHECK,
  });
  page.drawLine({
    start: { x: x1, y: yBottom },
    end: { x: x2, y: yTop },
    thickness,
    color: CHECK,
  });
}

function isTruthy(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on" || v === "x" || v === "checked";
}

/* -------------------------------------------------------------------------- */
/* Certificate of Completion                                                  */
/* -------------------------------------------------------------------------- */

function fmtDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "UTC",
  }).format(value);
}

interface CertFonts {
  regular: PDFFont;
  bold: PDFFont;
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const MUTED = rgb(0.42, 0.42, 0.52);
const HAIRLINE = rgb(0.85, 0.85, 0.9);

class CertificateWriter {
  private page: PDFPage;
  private cursor: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: CertFonts,
  ) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.cursor = PAGE_H - MARGIN;
  }

  private ensureSpace(needed: number): void {
    if (this.cursor - needed < MARGIN) {
      this.page = this.doc.addPage([PAGE_W, PAGE_H]);
      this.cursor = PAGE_H - MARGIN;
    }
  }

  heading(text: string): void {
    this.ensureSpace(34);
    this.page.drawText(text, {
      x: MARGIN,
      y: this.cursor - 22,
      size: 22,
      font: this.fonts.bold,
      color: INK,
    });
    this.cursor -= 34;
  }

  subheading(text: string): void {
    this.ensureSpace(26);
    this.page.drawText(text, {
      x: MARGIN,
      y: this.cursor - 14,
      size: 13,
      font: this.fonts.bold,
      color: INK,
    });
    this.cursor -= 22;
  }

  rule(): void {
    this.ensureSpace(14);
    this.page.drawLine({
      start: { x: MARGIN, y: this.cursor - 6 },
      end: { x: PAGE_W - MARGIN, y: this.cursor - 6 },
      thickness: 1,
      color: HAIRLINE,
    });
    this.cursor -= 16;
  }

  keyValue(label: string, value: string): void {
    this.ensureSpace(16);
    const labelSize = 9.5;
    const valueSize = 10.5;
    this.page.drawText(label.toUpperCase(), {
      x: MARGIN,
      y: this.cursor - 11,
      size: labelSize,
      font: this.fonts.bold,
      color: MUTED,
    });
    const wrapped = this.wrap(value, valueSize, PAGE_W - MARGIN - 200);
    let vy = this.cursor - 11;
    for (const line of wrapped) {
      this.page.drawText(line, {
        x: MARGIN + 150,
        y: vy,
        size: valueSize,
        font: this.fonts.regular,
        color: INK,
      });
      vy -= valueSize + 3;
    }
    this.cursor -= Math.max(16, wrapped.length * (valueSize + 3) + 4);
  }

  spacer(amount = 10): void {
    this.cursor -= amount;
  }

  private wrap(text: string, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (
        this.fonts.regular.widthOfTextAtSize(candidate, size) > maxWidth &&
        current
      ) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getPageCount();
}

export async function finalizeDocument(
  documentId: string,
): Promise<{ finalBytes: Uint8Array; finalHash: string }> {
  /* ---- Load everything from the DB ------------------------------------- */
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const docFields: Field[] = await db
    .select()
    .from(fields)
    .where(eq(fields.documentId, documentId));

  const docRecipients: Recipient[] = await db
    .select()
    .from(recipients)
    .where(eq(recipients.documentId, documentId))
    .orderBy(asc(recipients.order), asc(recipients.createdAt));

  const fieldIds = docFields.map((f) => f.id);
  const docSignatures: Signature[] = fieldIds.length
    ? await db
        .select()
        .from(signatures)
        .where(inArray(signatures.fieldId, fieldIds))
    : [];

  const trail: AuditEvent[] = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.documentId, documentId))
    .orderBy(asc(auditEvents.createdAt));

  /* ---- Load the original PDF ------------------------------------------- */
  const originalBytes = await getPdfBytes(doc.originalFileKey);
  const originalHash = doc.originalHash ?? sha256Hex(originalBytes);

  const pdfDoc = await PDFDocument.load(originalBytes, {
    ignoreEncryption: true,
  });
  const pages = pdfDoc.getPages();
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const sigByFieldId = new Map<string, Signature>();
  for (const sig of docSignatures) sigByFieldId.set(sig.fieldId, sig);

  /* ---- Stamp fields ---------------------------------------------------- */
  for (const field of docFields) {
    if (pages.length === 0) break;
    const page = pages[pageIndexFor(field, pages.length)];
    const rect = toPageRect(field, page);
    const sig = sigByFieldId.get(field.id);
    const textValue = sig?.value ?? field.value ?? "";

    switch (field.type) {
      case "signature":
      case "initials": {
        if (sig?.kind === "drawn" && sig.imageData) {
          try {
            const { mime, bytes } = decodeDataUrl(sig.imageData);
            const image = mime.includes("jpeg") || mime.includes("jpg")
              ? await pdfDoc.embedJpg(bytes)
              : await pdfDoc.embedPng(bytes);
            // Preserve aspect ratio within the rect.
            const scale = Math.min(
              rect.width / image.width,
              rect.height / image.height,
            );
            const drawW = image.width * scale;
            const drawH = image.height * scale;
            page.drawImage(image, {
              x: rect.x + (rect.width - drawW) / 2,
              y: rect.y + (rect.height - drawH) / 2,
              width: drawW,
              height: drawH,
            });
          } catch {
            // Corrupt image data — fall back to any typed value.
            drawFittedText(page, textValue, rect, helvItalic);
          }
        } else if (textValue) {
          // Typed signature: render in an italic hand-ish style.
          drawFittedText(page, textValue, rect, helvItalic);
        }
        break;
      }
      case "date":
      case "text": {
        drawFittedText(page, textValue, rect, helv);
        break;
      }
      case "checkbox": {
        if (isTruthy(textValue)) drawCheck(page, rect);
        break;
      }
    }
  }

  /* ---- Certificate of Completion --------------------------------------- */
  const signedByRecipient = new Map<string, AuditEvent>();
  for (const event of trail) {
    if (event.type === "signed" && event.recipientId) {
      // Keep the last signed event (most authoritative meta).
      signedByRecipient.set(event.recipientId, event);
    }
  }

  const cert = new CertificateWriter(pdfDoc, {
    regular: helv,
    bold: helvBold,
  });

  cert.heading("Certificate of Completion");
  cert.spacer(4);
  cert.keyValue("Document", doc.title);
  cert.keyValue("Document ID", doc.id);
  cert.keyValue("Status", doc.status);
  cert.keyValue("Created", fmtDate(doc.createdAt));
  cert.keyValue("Completed", fmtDate(new Date()));
  cert.keyValue("Original SHA-256", originalHash);
  cert.rule();
  cert.spacer(6);
  cert.subheading("Signers");
  cert.spacer(2);

  if (docRecipients.length === 0) {
    cert.keyValue("Recipients", "None");
  }

  for (const recipient of docRecipients) {
    const signedEvent = signedByRecipient.get(recipient.id);
    cert.subheading(`${recipient.name}  ·  ${recipient.role}`);
    cert.keyValue("Email", recipient.email);
    cert.keyValue("Status", recipient.status);
    cert.keyValue(
      "Signed at",
      fmtDate(recipient.signedAt ?? signedEvent?.createdAt ?? null),
    );
    cert.keyValue("IP address", signedEvent?.ip ?? "—");
    cert.keyValue("User agent", signedEvent?.userAgent ?? "—");
    cert.keyValue(
      "Identity (OTP) verified",
      recipient.otpVerifiedAt ? `Yes · ${fmtDate(recipient.otpVerifiedAt)}` : "No",
    );
    if (recipient.declinedReason) {
      cert.keyValue("Declined reason", recipient.declinedReason);
    }
    cert.rule();
    cert.spacer(4);
  }

  /* ---- Serialize + hash ------------------------------------------------ */
  const finalBytes = await pdfDoc.save();
  const finalHash = sha256Hex(finalBytes);

  return { finalBytes, finalHash };
}
