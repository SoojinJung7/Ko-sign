import type { FieldType, GroupRule } from "@/lib/types";

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
  /** Checkbox fields only: the choice group this box belongs to, if any. */
  groupId: string | null;
}

/** A set of checkboxes the signer picks among; see `GroupRule`. */
export interface SignerGroup extends GroupRule {
  id: string;
  label: string | null;
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
