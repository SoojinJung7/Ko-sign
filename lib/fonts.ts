import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";

export const runtime = "nodejs";

/**
 * Font resolution for stamped PDFs.
 *
 * pdf-lib's standard fonts are WinAnsi-encoded, so drawing any character
 * outside cp1252 (Hangul, CJK, …) throws at draw time. We keep Helvetica for
 * text it can represent — it embeds for free — and fall back to a bundled
 * NanumGothic (SIL OFL) for everything else. NanumGothic carries Latin glyphs
 * too, so a mixed string renders in one face rather than being split.
 *
 * The Korean face is embedded UNSUBSETTED (~1.6 MB per weight): pdf-lib's
 * subsetter silently drops most Hangul glyphs, which is worse than the size —
 * it yields a PDF with characters missing instead of an error. Embedding is
 * lazy and per weight, so Latin-only envelopes never pay for it.
 */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

type Weight = "regular" | "bold";

const FONT_FILE: Record<Weight, string> = {
  regular: "NanumGothic-Regular.ttf",
  bold: "NanumGothic-Bold.ttf",
};

/** Read each TTF at most once per process; embedding is still per-document. */
const fileCache = new Map<Weight, Promise<Buffer>>();

function koreanBytes(weight: Weight): Promise<Buffer> {
  let bytes = fileCache.get(weight);
  if (!bytes) {
    bytes = readFile(path.join(FONT_DIR, FONT_FILE[weight]));
    fileCache.set(weight, bytes);
  }
  return bytes;
}

/** True when `font` can represent every character of `text`. */
function canEncode(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Per-document font picker. Always resolve the font from the exact string you
 * are about to draw (and measure) — a font chosen for one string may not be
 * able to encode another.
 */
export class FontBook {
  private readonly korean = new Map<Weight, Promise<PDFFont>>();

  private constructor(
    private readonly doc: PDFDocument,
    private readonly helv: PDFFont,
    private readonly helvBold: PDFFont,
    private readonly helvItalic: PDFFont,
  ) {}

  static async create(doc: PDFDocument): Promise<FontBook> {
    doc.registerFontkit(fontkit);
    const [helv, helvBold, helvItalic] = await Promise.all([
      doc.embedFont(StandardFonts.Helvetica),
      doc.embedFont(StandardFonts.HelveticaBold),
      doc.embedFont(StandardFonts.HelveticaOblique),
    ]);
    return new FontBook(doc, helv, helvBold, helvItalic);
  }

  regular(text: string): Promise<PDFFont> {
    return this.pick(text, this.helv, "regular");
  }

  bold(text: string): Promise<PDFFont> {
    return this.pick(text, this.helvBold, "bold");
  }

  /**
   * Typed signatures render in an italic hand. NanumGothic ships no italic cut,
   * so Korean typed signatures fall back to its upright face.
   */
  italic(text: string): Promise<PDFFont> {
    return this.pick(text, this.helvItalic, "regular");
  }

  private async pick(
    text: string,
    latin: PDFFont,
    weight: Weight,
  ): Promise<PDFFont> {
    if (canEncode(latin, text)) return latin;
    return this.embedKorean(weight);
  }

  private embedKorean(weight: Weight): Promise<PDFFont> {
    let font = this.korean.get(weight);
    if (!font) {
      font = koreanBytes(weight).then((bytes) =>
        this.doc.embedFont(bytes, { subset: false }),
      );
      this.korean.set(weight, font);
    }
    return font;
  }
}
