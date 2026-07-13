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
}
