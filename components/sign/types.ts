import type { FieldType } from "@/lib/types";

/** A single fillable field belonging to the current signer (normalized coords). */
export interface SignerField {
  id: string;
  type: FieldType;
  /** 1-based page number (pdf.js convention). */
  page: number;
  /** Normalized 0..1, top-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
}

/** The value a signer has entered for one field. */
export interface FieldValue {
  kind?: "drawn" | "typed";
  /** Typed signature text, or date / text / checkbox value. */
  value?: string;
  /** Drawn-signature PNG data URL. */
  imageData?: string;
}

export interface SignerDocInfo {
  id: string;
  title: string;
  message: string | null;
  pageCount: number;
  fileName: string;
}

export interface SignerRecipientInfo {
  name: string;
  email: string;
}
