import { asc, eq, inArray } from "drizzle-orm";
import { PDFDocument, PDFFont, PDFPage, degrees, rgb } from "pdf-lib";

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
import { FontBook } from "@/lib/fonts";
import { DISPLAY_TIME_ZONE } from "@/lib/datetime";

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

interface Placement {
  /** Field width in the displayed-upright local frame (points). */
  width: number;
  /** Field height in the displayed-upright local frame (points). */
  height: number;
  /** Rotation (ccw degrees) to hand pdf-lib so drawn content appears upright. */
  rotation: number;
  /**
   * Map a point in the field's *displayed-upright* local frame (origin at the
   * field's bottom-left, x → right, y → up) to pdf-lib's unrotated bottom-left
   * user space.
   */
  toUser(lx: number, ly: number): { x: number; y: number };
}

/**
 * Resolve a field's normalized rect to a placement in pdf-lib user space.
 *
 * Field coords are normalized against the pdf.js *displayed* viewport, whose
 * dimensions are rotation-adjusted (a /Rotate 90 page renders in landscape).
 * pdf-lib's getWidth()/getHeight() report the un-rotated MediaBox instead, so
 * we resolve the rect in the displayed space pdf.js exposed, translate it into
 * pdf-lib's unrotated user space, and carry the rotation so stamped content is
 * drawn visually upright and lands exactly where the signer placed it. On a
 * non-rotated page (the common case) this reduces to the original mapping.
 */
function toPlacement(field: Field, page: PDFPage): Placement {
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const pw = page.getWidth(); // raw MediaBox
  const ph = page.getHeight();

  // Displayed (pdf.js viewport) dimensions.
  const VW = rot === 90 || rot === 270 ? ph : pw;
  const VH = rot === 90 || rot === 270 ? pw : ph;

  const L = field.x * VW; // left edge, displayed px (top-left origin)
  const T = field.y * VH; // top edge
  const RW = field.width * VW; // displayed width
  const RH = field.height * VH; // displayed height

  // User-space position of the field's displayed bottom-left corner, i.e. the
  // inverse of the pdf.js viewport map applied to displayed point (L, T + RH).
  let ax: number;
  let ay: number;
  switch (rot) {
    case 90:
      ax = T + RH;
      ay = L;
      break;
    case 180:
      ax = pw - L;
      ay = T + RH;
      break;
    case 270:
      ax = pw - T - RH;
      ay = ph - L;
      break;
    default: // 0
      ax = L;
      ay = ph - T - RH;
      break;
  }

  // Exact cos/sin for the four right angles (rounding kills 90°'s ~6e-17 error).
  const rad = (rot * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));

  return {
    width: RW,
    height: RH,
    rotation: rot,
    toUser(lx: number, ly: number) {
      return {
        x: ax + lx * cos - ly * sin,
        y: ay + lx * sin + ly * cos,
      };
    },
  };
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

/** Draw a value centered vertically within the field, clipped to its width. */
function drawFittedText(
  page: PDFPage,
  text: string,
  place: Placement,
  font: PDFFont,
): void {
  if (!text) return;
  let size = Math.min(place.height * 0.7, 16);
  size = Math.max(size, 6);
  // Shrink to fit width if needed.
  let width = font.widthOfTextAtSize(text, size);
  while (width > place.width && size > 5) {
    size -= 0.5;
    width = font.widthOfTextAtSize(text, size);
  }
  // Local frame: baseline start at x=2, vertically centered.
  const localX = 2;
  const localY = (place.height - size) / 2 + size * 0.1;
  const at = place.toUser(localX, localY);
  page.drawText(text, {
    x: at.x,
    y: at.y,
    size,
    font,
    color: INK,
    rotate: degrees(place.rotation),
    maxWidth: place.width,
    lineHeight: size * 1.1,
  });
}

/** Draw a checkmark inside the field. */
function drawCheck(page: PDFPage, place: Placement): void {
  const pad = Math.min(place.width, place.height) * 0.2;
  const x0 = pad;
  const x1 = place.width * 0.42;
  const x2 = place.width - pad;
  const yMid = place.height * 0.45;
  const yBottom = pad;
  const yTop = place.height - pad;
  const thickness = Math.max(Math.min(place.width, place.height) * 0.12, 1);
  // Transform both endpoints of each stroke; drawLine has no rotate option, so
  // rotation is baked into the mapped user-space coordinates.
  const p0 = place.toUser(x0, yMid);
  const p1 = place.toUser(x1, yBottom);
  const p2 = place.toUser(x2, yTop);
  page.drawLine({ start: p0, end: p1, thickness, color: CHECK });
  page.drawLine({ start: p1, end: p2, thickness, color: CHECK });
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
    timeZone: DISPLAY_TIME_ZONE,
  }).format(value);
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
    private readonly fonts: FontBook,
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

  async heading(text: string): Promise<void> {
    this.ensureSpace(34);
    this.page.drawText(text, {
      x: MARGIN,
      y: this.cursor - 22,
      size: 22,
      font: await this.fonts.bold(text),
      color: INK,
    });
    this.cursor -= 34;
  }

  async subheading(text: string): Promise<void> {
    this.ensureSpace(26);
    this.page.drawText(text, {
      x: MARGIN,
      y: this.cursor - 14,
      size: 13,
      font: await this.fonts.bold(text),
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

  async keyValue(label: string, value: string): Promise<void> {
    this.ensureSpace(16);
    const labelSize = 9.5;
    const valueSize = 10.5;
    const labelText = label.toUpperCase();
    this.page.drawText(labelText, {
      x: MARGIN,
      y: this.cursor - 11,
      size: labelSize,
      font: await this.fonts.bold(labelText),
      color: MUTED,
    });
    // One font for the whole value: wrapping measures with the same face it
    // draws with, and a value is never split across faces mid-line.
    const valueFont = await this.fonts.regular(value);
    const wrapped = wrap(value, valueFont, valueSize, PAGE_W - MARGIN - 200);
    let vy = this.cursor - 11;
    for (const line of wrapped) {
      this.page.drawText(line, {
        x: MARGIN + 150,
        y: vy,
        size: valueSize,
        font: valueFont,
        color: INK,
      });
      vy -= valueSize + 3;
    }
    this.cursor -= Math.max(16, wrapped.length * (valueSize + 3) + 4);
  }

  spacer(amount = 10): void {
    this.cursor -= amount;
  }
}

/**
 * Greedy word wrap. Korean runs without spaces can't be split this way, so an
 * over-long unbroken run is left to overflow rather than being cut mid-word.
 */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
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
  completedAt: Date,
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
  const fonts = await FontBook.create(pdfDoc);

  const sigByFieldId = new Map<string, Signature>();
  for (const sig of docSignatures) sigByFieldId.set(sig.fieldId, sig);

  /* ---- Stamp fields ---------------------------------------------------- */
  for (const field of docFields) {
    if (pages.length === 0) break;
    const page = pages[pageIndexFor(field, pages.length)];
    const place = toPlacement(field, page);
    const sig = sigByFieldId.get(field.id);
    const textValue = sig?.value ?? field.value ?? "";

    switch (field.type) {
      case "signature":
      case "initials": {
        if ((sig?.kind === "drawn" || sig?.kind === "stamp") && sig.imageData) {
          try {
            const { mime, bytes } = decodeDataUrl(sig.imageData);
            const image = mime.includes("jpeg") || mime.includes("jpg")
              ? await pdfDoc.embedJpg(bytes)
              : await pdfDoc.embedPng(bytes);
            // Preserve aspect ratio within the field (in displayed units).
            const scale = Math.min(
              place.width / image.width,
              place.height / image.height,
            );
            const drawW = image.width * scale;
            const drawH = image.height * scale;
            // Center in the local frame, then map the image's bottom-left to
            // user space and rotate about it so it renders visually upright.
            const at = place.toUser(
              (place.width - drawW) / 2,
              (place.height - drawH) / 2,
            );
            page.drawImage(image, {
              x: at.x,
              y: at.y,
              width: drawW,
              height: drawH,
              rotate: degrees(place.rotation),
            });
          } catch {
            // Corrupt image data — fall back to any typed value.
            drawFittedText(page, textValue, place, await fonts.italic(textValue));
          }
        } else if (textValue) {
          // Typed signature: render in an italic hand-ish style.
          drawFittedText(page, textValue, place, await fonts.italic(textValue));
        }
        break;
      }
      case "date":
      case "text": {
        drawFittedText(page, textValue, place, await fonts.regular(textValue));
        break;
      }
      case "checkbox": {
        if (isTruthy(textValue)) drawCheck(page, place);
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

  const cert = new CertificateWriter(pdfDoc, fonts);

  await cert.heading("Certificate of Completion");
  cert.spacer(4);
  await cert.keyValue("Document", doc.title);
  await cert.keyValue("Document ID", doc.id);
  // finalizeDocument only ever runs at the completion moment, so the document's
  // effective status is "completed" even though the DB row is flipped by the
  // caller immediately after this returns.
  await cert.keyValue("Status", "completed");
  await cert.keyValue("Created", fmtDate(doc.createdAt));
  await cert.keyValue("Completed", fmtDate(completedAt));
  await cert.keyValue("Original SHA-256", originalHash);
  cert.rule();
  cert.spacer(6);
  await cert.subheading("Signers");
  cert.spacer(2);

  if (docRecipients.length === 0) {
    await cert.keyValue("Recipients", "None");
  }

  for (const recipient of docRecipients) {
    const signedEvent = signedByRecipient.get(recipient.id);
    await cert.subheading(`${recipient.name}  ·  ${recipient.role}`);
    await cert.keyValue("Email", recipient.email);
    await cert.keyValue("Status", recipient.status);
    await cert.keyValue(
      "Signed at",
      fmtDate(recipient.signedAt ?? signedEvent?.createdAt ?? null),
    );
    await cert.keyValue("IP address", signedEvent?.ip ?? "—");
    await cert.keyValue("User agent", signedEvent?.userAgent ?? "—");
    await cert.keyValue(
      "Identity (OTP) verified",
      recipient.otpVerifiedAt ? `Yes · ${fmtDate(recipient.otpVerifiedAt)}` : "No",
    );
    if (recipient.declinedReason) {
      await cert.keyValue("Declined reason", recipient.declinedReason);
    }
    cert.rule();
    cert.spacer(4);
  }

  /* ---- Serialize + hash ------------------------------------------------ */
  const finalBytes = await pdfDoc.save();
  const finalHash = sha256Hex(finalBytes);

  return { finalBytes, finalHash };
}
