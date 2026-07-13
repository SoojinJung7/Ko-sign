import type { FieldType } from "@/lib/types";

/** Per-recipient color assigned by index. Used for field boxes + chips. */
export interface RecipientColor {
  name: string;
  /** Base solid color (hex). Fills/borders derive from it via color-mix. */
  base: string;
}

export const RECIPIENT_COLORS: RecipientColor[] = [
  { name: "indigo", base: "#6366f1" },
  { name: "emerald", base: "#10b981" },
  { name: "amber", base: "#f59e0b" },
  { name: "rose", base: "#f43f5e" },
  { name: "sky", base: "#0ea5e9" },
  { name: "violet", base: "#8b5cf6" },
  { name: "teal", base: "#14b8a6" },
  { name: "orange", base: "#f97316" },
];

export function colorForIndex(index: number): RecipientColor {
  return RECIPIENT_COLORS[index % RECIPIENT_COLORS.length];
}

/** Translucent fill / border helpers built from a base color. */
export function fill(base: string, pct = 16): string {
  return `color-mix(in srgb, ${base} ${pct}%, transparent)`;
}

/**
 * Default field size in NORMALIZED page units (0..1, top-left origin). Tuned
 * for a US-Letter portrait page; good enough across common aspect ratios.
 */
export const DEFAULT_FIELD_SIZE: Record<FieldType, { width: number; height: number }> = {
  signature: { width: 0.24, height: 0.06 },
  initials: { width: 0.1, height: 0.05 },
  date: { width: 0.16, height: 0.035 },
  text: { width: 0.22, height: 0.04 },
  checkbox: { width: 0.03, height: 0.022 },
};

/** Minimum normalized size so fields never collapse to an unclickable sliver. */
export const MIN_FIELD_SIZE = { width: 0.02, height: 0.014 };

export interface FieldTypeMeta {
  type: FieldType;
  label: string;
  hint: string;
  icon: string; // inline SVG path data drawn in a 24x24 viewBox
}

export const FIELD_TYPE_META: FieldTypeMeta[] = [
  {
    type: "signature",
    label: "Signature",
    hint: "Draw or type a signature",
    icon: "M3 17c3-1 4-9 6-9s2 6 4 6 2-4 4-4M3 20h18",
  },
  {
    type: "initials",
    label: "Initials",
    hint: "Signer’s initials",
    icon: "M7 6v12M7 6h4a3 3 0 0 1 0 6H7M15 6v12",
  },
  {
    type: "date",
    label: "Date signed",
    hint: "Auto-filled on signing",
    icon: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2ZM4 10h16M8 3v4M16 3v4",
  },
  {
    type: "text",
    label: "Text",
    hint: "Free-text input",
    icon: "M4 7V5h16v2M9 19h6M12 5v14",
  },
  {
    type: "checkbox",
    label: "Checkbox",
    hint: "A single check",
    icon: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1ZM8 12l3 3 5-6",
  },
];

export const FIELD_TYPE_ICON: Record<FieldType, string> = Object.fromEntries(
  FIELD_TYPE_META.map((m) => [m.type, m.icon]),
) as Record<FieldType, string>;
