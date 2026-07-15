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
 *
 * Returns a code rather than a sentence: the sender reads it in their own
 * language through the dictionary, while the API answers in English like the
 * rest of its errors. Both render it through `formatGroupIssue`.
 */
export type GroupRuleIssue =
  | { code: "negativeMin" }
  | { code: "maxTooLow" }
  | { code: "maxBelowMin" }
  | { code: "empty" }
  | { code: "minAboveMembers"; min: number; memberCount: number };

export function groupRuleIssue(
  rule: GroupRule,
  memberCount: number,
): GroupRuleIssue | null {
  if (rule.minSelected < 0) return { code: "negativeMin" };
  if (rule.maxSelected !== null && rule.maxSelected < 1) {
    return { code: "maxTooLow" };
  }
  if (rule.maxSelected !== null && rule.maxSelected < rule.minSelected) {
    return { code: "maxBelowMin" };
  }
  if (memberCount === 0) return { code: "empty" };
  if (rule.minSelected > memberCount) {
    return { code: "minAboveMembers", min: rule.minSelected, memberCount };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Group wording                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The strings needed to describe a group rule, supplied by the caller's
 * dictionary. Declared structurally so this module stays free of any i18n
 * import — the locale files satisfy the shape, and `en.ts` is the source the
 * server passes when answering in English.
 *
 * Numbers are composed from prefix/suffix pairs rather than placeholders, since
 * "Choose at least 3" and "3개 이상 선택" put the number in different places.
 */
export interface GroupRuleStrings {
  anyOptional: string;
  one: string;
  atLeastPrefix: string;
  atLeastSuffix: string;
  exactlyPrefix: string;
  exactlySuffix: string;
  upToPrefix: string;
  upToSuffix: string;
  betweenPrefix: string;
  betweenMid: string;
  betweenSuffix: string;
}

export interface GroupIssueStrings {
  negativeMin: string;
  maxTooLow: string;
  maxBelowMin: string;
  empty: string;
  minAbovePrefix: string;
  minAboveMid: string;
  minAboveSuffix: string;
}

/** Signer-facing description of a rule, e.g. "Choose at least 1". */
export function formatGroupRule(rule: GroupRule, s: GroupRuleStrings): string {
  const { minSelected: min, maxSelected: max } = rule;
  if (max === null) {
    return min === 0 ? s.anyOptional : `${s.atLeastPrefix}${min}${s.atLeastSuffix}`;
  }
  if (min === max) {
    return min === 1 ? s.one : `${s.exactlyPrefix}${min}${s.exactlySuffix}`;
  }
  if (min === 0) return `${s.upToPrefix}${max}${s.upToSuffix}`;
  return `${s.betweenPrefix}${min}${s.betweenMid}${max}${s.betweenSuffix}`;
}

export function formatGroupIssue(
  issue: GroupRuleIssue,
  s: GroupIssueStrings,
): string {
  switch (issue.code) {
    case "negativeMin":
      return s.negativeMin;
    case "maxTooLow":
      return s.maxTooLow;
    case "maxBelowMin":
      return s.maxBelowMin;
    case "empty":
      return s.empty;
    case "minAboveMembers":
      return `${s.minAbovePrefix}${issue.min}${s.minAboveMid}${issue.memberCount}${s.minAboveSuffix}`;
  }
}
