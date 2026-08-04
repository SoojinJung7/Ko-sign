import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const docStatus = pgEnum("doc_status", [
  "draft",
  "sent",
  "completed",
  "voided",
  "declined",
]);

export const recipientRole = pgEnum("recipient_role", ["signer", "viewer"]);

export const recipientStatus = pgEnum("recipient_status", [
  "pending",
  "sent",
  "viewed",
  "signed",
  "declined",
]);

export const fieldType = pgEnum("field_type", [
  "signature",
  "initials",
  "date",
  "text",
  "checkbox",
]);

export const sigKind = pgEnum("sig_kind", ["drawn", "typed", "stamp"]);

export const auditType = pgEnum("audit_type", [
  "created",
  "sent",
  "viewed",
  "otp_sent",
  "otp_verified",
  "signed",
  "completed",
  "downloaded",
  "declined",
  "voided",
]);

/* -------------------------------------------------------------------------- */
/* Tables                                                                     */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authTokens = pgTable("auth_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message"),
  status: docStatus("status").notNull().default("draft"),
  /**
   * A reusable blueprint rather than a live envelope. Templates hold the PDF and
   * the field/recipient layout but carry no recipient PII; they are excluded
   * from the dashboard and are cloned into a fresh draft when used.
   */
  isTemplate: boolean("is_template").notNull().default(false),
  requireIdentityCheck: boolean("require_identity_check")
    .notNull()
    .default(false),
  originalFileKey: text("original_file_key").notNull(),
  originalFileName: text("original_file_name").notNull(),
  originalHash: text("original_hash"),
  finalFileKey: text("final_file_key"),
  finalHash: text("final_hash"),
  pageCount: integer("page_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
});

export const recipients = pgTable("recipients", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  order: integer("order").notNull().default(1),
  role: recipientRole("role").notNull().default("signer"),
  status: recipientStatus("status").notNull().default("pending"),
  token: text("token").notNull().unique(),
  otpCodeHash: text("otp_code_hash"),
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
  otpVerifiedAt: timestamp("otp_verified_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  declinedReason: text("declined_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A set of checkboxes the signer chooses *among* ("tick one of these", "tick
 * any that apply") rather than each being independently mandatory. The rule
 * lives on the group, so a member checkbox's own `required` is not consulted.
 */
export const fieldGroups = pgTable("field_groups", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => recipients.id, { onDelete: "cascade" }),
  /** Shown to the signer, e.g. "Promotion methods". */
  label: text("label"),
  /** Fewest members that must be ticked. 0 makes the whole group optional. */
  minSelected: integer("min_selected").notNull().default(1),
  /** Most members that may be ticked. NULL = no limit; 1 = radio behavior. */
  maxSelected: integer("max_selected"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const fields = pgTable("fields", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => recipients.id, { onDelete: "cascade" }),
  /** Checkbox fields only: the choice group this box belongs to, if any. */
  groupId: text("group_id").references(() => fieldGroups.id, {
    onDelete: "set null",
  }),
  type: fieldType("type").notNull(),
  page: integer("page").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  width: real("width").notNull(),
  height: real("height").notNull(),
  required: boolean("required").notNull().default(true),
  value: text("value"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const signatures = pgTable("signatures", {
  id: text("id").primaryKey(),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => recipients.id, { onDelete: "cascade" }),
  fieldId: text("field_id")
    .notNull()
    .references(() => fields.id, { onDelete: "cascade" }),
  kind: sigKind("kind").notNull(),
  imageData: text("image_data"),
  value: text("value"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id").references(() => recipients.id, {
    onDelete: "set null",
  }),
  type: auditType("type").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  authTokens: many(authTokens),
}));

export const authTokensRelations = relations(authTokens, ({ one }) => ({
  user: one(users, {
    fields: [authTokens.userId],
    references: [users.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  recipients: many(recipients),
  fieldGroups: many(fieldGroups),
  fields: many(fields),
  auditEvents: many(auditEvents),
}));

export const recipientsRelations = relations(recipients, ({ one, many }) => ({
  document: one(documents, {
    fields: [recipients.documentId],
    references: [documents.id],
  }),
  fieldGroups: many(fieldGroups),
  fields: many(fields),
  signatures: many(signatures),
  auditEvents: many(auditEvents),
}));

export const fieldGroupsRelations = relations(fieldGroups, ({ one, many }) => ({
  document: one(documents, {
    fields: [fieldGroups.documentId],
    references: [documents.id],
  }),
  recipient: one(recipients, {
    fields: [fieldGroups.recipientId],
    references: [recipients.id],
  }),
  fields: many(fields),
}));

export const fieldsRelations = relations(fields, ({ one, many }) => ({
  document: one(documents, {
    fields: [fields.documentId],
    references: [documents.id],
  }),
  recipient: one(recipients, {
    fields: [fields.recipientId],
    references: [recipients.id],
  }),
  group: one(fieldGroups, {
    fields: [fields.groupId],
    references: [fieldGroups.id],
  }),
  signatures: many(signatures),
}));

export const signaturesRelations = relations(signatures, ({ one }) => ({
  recipient: one(recipients, {
    fields: [signatures.recipientId],
    references: [recipients.id],
  }),
  field: one(fields, {
    fields: [signatures.fieldId],
    references: [fields.id],
  }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  document: one(documents, {
    fields: [auditEvents.documentId],
    references: [documents.id],
  }),
  recipient: one(recipients, {
    fields: [auditEvents.recipientId],
    references: [recipients.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type Recipient = typeof recipients.$inferSelect;
export type NewRecipient = typeof recipients.$inferInsert;

export type FieldGroup = typeof fieldGroups.$inferSelect;
export type NewFieldGroup = typeof fieldGroups.$inferInsert;

export type Field = typeof fields.$inferSelect;
export type NewField = typeof fields.$inferInsert;

export type Signature = typeof signatures.$inferSelect;
export type NewSignature = typeof signatures.$inferInsert;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;

export type DocStatus = (typeof docStatus.enumValues)[number];
export type RecipientRole = (typeof recipientRole.enumValues)[number];
export type RecipientStatus = (typeof recipientStatus.enumValues)[number];
export type FieldType = (typeof fieldType.enumValues)[number];
export type SigKind = (typeof sigKind.enumValues)[number];
export type AuditType = (typeof auditType.enumValues)[number];

/* -------------------------------------------------------------------------- */
/* Schema object (for the drizzle client)                                     */
/* -------------------------------------------------------------------------- */

export const schema = {
  users,
  authTokens,
  documents,
  recipients,
  fieldGroups,
  fields,
  signatures,
  auditEvents,
  usersRelations,
  authTokensRelations,
  documentsRelations,
  recipientsRelations,
  fieldGroupsRelations,
  fieldsRelations,
  signaturesRelations,
  auditEventsRelations,
};
