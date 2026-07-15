/**
 * Shared types, enum value arrays, and label maps used across feature slices.
 * Re-exports the Drizzle-inferred row types so features import from one place.
 */

export type {
  User,
  NewUser,
  AuthToken,
  NewAuthToken,
  Document,
  NewDocument,
  Recipient,
  NewRecipient,
  FieldGroup,
  NewFieldGroup,
  Field,
  NewField,
  Signature,
  NewSignature,
  AuditEvent,
  NewAuditEvent,
  DocStatus,
  RecipientRole,
  RecipientStatus,
  FieldType,
  SigKind,
  AuditType,
} from "@/db/schema";

import type {
  AuditType,
  DocStatus,
  FieldType,
  RecipientStatus,
} from "@/db/schema";

/* -------------------------------------------------------------------------- */
/* Enum value arrays (client-safe; no server imports)                         */
/* -------------------------------------------------------------------------- */

export const FIELD_TYPES = [
  "signature",
  "initials",
  "date",
  "text",
  "checkbox",
] as const satisfies readonly FieldType[];

export const DOC_STATUSES = [
  "draft",
  "sent",
  "completed",
  "voided",
  "declined",
] as const satisfies readonly DocStatus[];

export const RECIPIENT_STATUSES = [
  "pending",
  "sent",
  "viewed",
  "signed",
  "declined",
] as const satisfies readonly RecipientStatus[];

/* -------------------------------------------------------------------------- */
/* Semantic color tone shared by Badge / StatusBadge                          */
/* -------------------------------------------------------------------------- */

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "brand";

/* -------------------------------------------------------------------------- */
/* Label + tone maps                                                          */
/* -------------------------------------------------------------------------- */

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Draft",
  sent: "In progress",
  completed: "Completed",
  voided: "Voided",
  declined: "Declined",
};

export const DOC_STATUS_TONE: Record<DocStatus, BadgeTone> = {
  draft: "neutral",
  sent: "info",
  completed: "success",
  voided: "warning",
  declined: "danger",
};

export const RECIPIENT_STATUS_LABEL: Record<RecipientStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
};

export const RECIPIENT_STATUS_TONE: Record<RecipientStatus, BadgeTone> = {
  pending: "neutral",
  sent: "info",
  viewed: "brand",
  signed: "success",
  declined: "danger",
};

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  signature: "Signature",
  initials: "Initials",
  date: "Date",
  text: "Text",
  checkbox: "Checkbox",
};

export const AUDIT_TYPE_LABEL: Record<AuditType, string> = {
  created: "Created",
  sent: "Sent",
  viewed: "Viewed",
  otp_sent: "Verification code sent",
  otp_verified: "Identity verified",
  signed: "Signed",
  completed: "Completed",
  downloaded: "Downloaded",
  declined: "Declined",
  voided: "Voided",
};

/* -------------------------------------------------------------------------- */
/* Field placement DTO (normalized 0..1, top-left origin)                     */
/* -------------------------------------------------------------------------- */

export interface FieldPlacement {
  id?: string;
  recipientId: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  /** Checkbox fields only; see `GroupRule`. */
  groupId?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Checkbox choice groups                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How many of a checkbox group's members the signer must / may tick. A grouped
 * checkbox is never individually required — the group's rule is the whole
 * requirement, and it is enforced client-side for guidance and server-side for
 * real (see the submit route).
 */
export interface GroupRule {
  minSelected: number;
  /** `null` = no upper bound. */
  maxSelected: number | null;
}

/** Hard ceiling on members, mirroring the per-document field cap. */
export const MAX_GROUP_MEMBERS = 100;

export function groupIsRequired(rule: GroupRule): boolean {
  return rule.minSelected > 0;
}

export function groupSatisfied(checked: number, rule: GroupRule): boolean {
  if (checked < rule.minSelected) return false;
  if (rule.maxSelected !== null && checked > rule.maxSelected) return false;
  return true;
}

/**
 * Why a rule can't be met by a group of `memberCount` boxes, or `null` if it
 * can. Shared by the editor (to warn early) and the prepare route (to reject).
 */
export function groupRuleProblem(
  rule: GroupRule,
  memberCount: number,
): string | null {
  if (rule.minSelected < 0) return "The minimum can't be negative.";
  if (rule.maxSelected !== null && rule.maxSelected < 1) {
    return "The maximum must be at least 1.";
  }
  if (rule.maxSelected !== null && rule.maxSelected < rule.minSelected) {
    return "The maximum can't be lower than the minimum.";
  }
  if (memberCount === 0) return "This group has no checkboxes.";
  if (rule.minSelected > memberCount) {
    return `This group asks for ${rule.minSelected} but only has ${memberCount} ${
      memberCount === 1 ? "checkbox" : "checkboxes"
    }.`;
  }
  return null;
}

/** Signer-facing description of a rule, e.g. "Choose at least 1". */
export function groupRuleLabel(rule: GroupRule): string {
  const { minSelected: min, maxSelected: max } = rule;
  if (max === null) {
    return min === 0 ? "Choose any (optional)" : `Choose at least ${min}`;
  }
  if (min === max) return min === 1 ? "Choose one" : `Choose exactly ${min}`;
  if (min === 0) return `Choose up to ${max} (optional)`;
  return `Choose ${min}–${max}`;
}
