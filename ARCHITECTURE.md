# SignFlow — Architecture Contract

SignFlow is a DocuSign-grade e-signature platform. This document is the **single source of
truth** every implementation agent MUST follow. Do not invent alternative signatures, table
names, or routes. If something is underspecified, follow the conventions here and keep it
minimal and consistent.

Stack: **Next.js 16 (App Router, RSC) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM ·
Neon Postgres · Vercel Blob · Resend · Twilio · pdf-lib · pdfjs-dist/react-pdf**.

Path alias: `@/*` → repo root. No `src/` dir. Node runtime for routes that use the DB / pdf-lib
(add `export const runtime = "nodejs"` where needed).

---

## 1. Product flows

**Sender (authenticated)**
1. Magic-link login (email). No passwords.
2. Dashboard: list envelopes with status.
3. New envelope: upload a PDF → it is stored in Blob, SHA-256 hashed (`originalHash`).
4. Prepare: add recipients (name, email, optional phone, signing order), then drag fields
   (signature / initials / date / text / checkbox) onto the rendered PDF and assign each to a
   recipient. Field coordinates are normalized (0..1) relative to the page.
5. Send: envelope status → `sent`. Signer tokens generated; the first signer (lowest `order`)
   is emailed a signing link. Audit event `sent` recorded.

**Signer (no account, token link)**
1. Opens `/sign/{token}`. Audit `viewed`.
2. If the envelope requires identity check and the recipient has a phone, an OTP is sent via
   SMS (`otp_sent`); recipient enters the 6-digit code (`otp_verified`). In dev, code `000000`
   always works and is logged.
3. Reviews the document, fills their assigned fields, draws a signature (canvas → PNG).
4. Submits (`signed`). If more signers remain, the next one (by `order`) is emailed. When the
   last required signer signs, the envelope is **finalized**.

**Finalize**
- pdf-lib stamps every field value/signature image onto the original PDF at its normalized
  coordinates, appends a **Certificate of Completion** page (full audit trail: who, when, IP,
  UA, email, OTP-verified), stores the result in Blob (`finalFileKey`), computes `finalHash`
  (SHA-256), sets status `completed`, records audit `completed`.

**Verify (public)** `/verify` — paste a document id or upload a PDF; recompute SHA-256 and
compare to the stored `finalHash`; show tamper status + certificate summary.

---

## 2. Data model — Drizzle (`db/schema.ts`)

Postgres. Use `pgTable`. IDs are `text` primary keys from `newId(prefix)` (see crypto lib),
e.g. `doc_a1b2...`. Timestamps `timestamp({ withTimezone: true })`. Use pgEnum for the enums.

```
users        : id, email(unique, lower), name, createdAt
authTokens   : id, userId→users, tokenHash(unique), expiresAt, usedAt(nullable), createdAt
documents    : id, userId→users, title, message(text, nullable), status(docStatus),
               requireIdentityCheck(bool, default false),
               originalFileKey(text), originalFileName(text), originalHash(text, nullable),
               finalFileKey(text, nullable), finalHash(text, nullable), pageCount(int, default 0),
               createdAt, sentAt(nullable), completedAt(nullable), voidedAt(nullable)
recipients   : id, documentId→documents(cascade), name, email(lower), phone(nullable),
               order(int, default 1), role(recipientRole, default 'signer'),
               status(recipientStatus, default 'pending'), token(unique),
               otpCodeHash(nullable), otpExpiresAt(nullable), otpVerifiedAt(nullable),
               viewedAt(nullable), signedAt(nullable), declinedReason(nullable), createdAt
fields       : id, documentId→documents(cascade), recipientId→recipients(cascade),
               type(fieldType), page(int), x(real), y(real), width(real), height(real),
               required(bool default true), value(text, nullable), createdAt
signatures   : id, recipientId→recipients(cascade), fieldId→fields(cascade),
               kind(sigKind: 'drawn'|'typed'), imageData(text, nullable, PNG data URL),
               value(text, nullable), createdAt
auditEvents  : id, documentId→documents(cascade), recipientId→recipients(nullable),
               type(auditType), ip(nullable), userAgent(nullable),
               metadata(jsonb, nullable), createdAt

Enums:
docStatus       = draft | sent | completed | voided | declined
recipientRole   = signer | viewer
recipientStatus = pending | sent | viewed | signed | declined
fieldType       = signature | initials | date | text | checkbox
sigKind         = drawn | typed
auditType       = created | sent | viewed | otp_sent | otp_verified | signed |
                  completed | downloaded | declined | voided
```

Export all tables + inferred types: `export type Document = typeof documents.$inferSelect;`
etc., and `NewDocument = typeof documents.$inferInsert;`. Also export a `schema` object with
every table for the drizzle client.

---

## 3. Library API — exact exported signatures

Implementation agents for features MUST import these and MUST NOT reimplement them.

### `db/index.ts`
```ts
export const db: NeonHttpDatabase<typeof schema> // drizzle client (neon-http)
export { schema }
```

### `lib/env.ts`
```ts
export const env: {
  DATABASE_URL: string; APP_URL: string; SESSION_SECRET: string;
  BLOB_READ_WRITE_TOKEN?: string; RESEND_API_KEY?: string; EMAIL_FROM: string;
  TWILIO_ACCOUNT_SID?: string; TWILIO_AUTH_TOKEN?: string; TWILIO_FROM?: string;
}
export const isEmailConfigured: boolean
export const isSmsConfigured: boolean
export const isBlobConfigured: boolean
```
Read from `process.env`, with sane dev defaults for APP_URL (`http://localhost:3000`) and a
dev SESSION_SECRET fallback. Never throw at import time in dev.

### `lib/crypto.ts`
```ts
export function newId(prefix: string): string          // `${prefix}_${nanoid(21)}`
export function sha256Hex(data: Buffer | Uint8Array | string): string
export function randomToken(): string                  // url-safe, ~32 chars, for links
export function hashToken(token: string): string       // sha256 hex, for storing link/otp tokens
export function generateOtp(): string                  // 6-digit numeric string
```

### `lib/session.ts` (iron-session, cookie `signflow_session`)
```ts
export interface SessionData { userId?: string; email?: string }
export function getSession(): Promise<IronSession<SessionData>>   // uses next/headers cookies
export function getCurrentUser(): Promise<User | null>            // loads user from db via session
export async function requireUser(): Promise<User>                // redirect('/login') if none
```

### `lib/blob.ts`
```ts
export async function putPdf(key: string, data: Buffer | Blob): Promise<string> // returns url/key stored as fileKey
export async function getPdfBytes(fileKey: string): Promise<Uint8Array>
```
If `!isBlobConfigured`, fall back to local disk under `.blob-store/` (dev only) so the app works
without Vercel Blob. `fileKey` is what we persist; resolve it in both modes.

### `lib/email.ts` (Resend)
```ts
export async function sendSigningInvite(opts: {
  to: string; recipientName: string; senderName: string;
  documentTitle: string; message?: string | null; signUrl: string;
}): Promise<void>
export async function sendMagicLink(opts: { to: string; url: string }): Promise<void>
export async function sendCompletedNotice(opts: {
  to: string; documentTitle: string; downloadUrl: string;
}): Promise<void>
```
If `!isEmailConfigured`, `console.log` the message + URL instead of throwing (dev fallback).

### `lib/sms.ts` (Twilio)
```ts
export async function sendOtpSms(phone: string, code: string): Promise<void>
```
If `!isSmsConfigured`, `console.log(`[dev sms] ${phone}: ${code}`)` and return.

### `lib/audit.ts`
```ts
export async function logAudit(input: {
  documentId: string; recipientId?: string | null; type: AuditType;
  metadata?: Record<string, unknown>;
}): Promise<void>                                   // reads ip/ua from next/headers internally
export async function getAuditTrail(documentId: string): Promise<AuditEvent[]>  // asc by createdAt
```

### `lib/pdf.ts` (pdf-lib) — server only
```ts
export async function getPdfPageCount(bytes: Uint8Array): Promise<number>
// Stamps all fields for a document onto the original and appends the certificate page.
export async function finalizeDocument(documentId: string): Promise<{ finalBytes: Uint8Array; finalHash: string }>
```
`finalizeDocument` loads the document, its fields, signatures, recipients and audit trail from
the DB, renders values (drawn signature PNG → embedded image; typed/date/text → text; checkbox
→ check mark) at normalized coords `(x,y,width,height)` where `(0,0)` is the **top-left** of the
page, and appends a Certificate of Completion page. It does NOT persist; the caller stores it.

### `lib/envelope.ts` (orchestration used by features)
```ts
export async function sendEnvelope(documentId: string): Promise<void>
// validates ≥1 recipient & ≥1 field, sets status 'sent'/sentAt, sets recipient tokens+status,
// emails the first signer (by order), logs audit 'sent'.
export async function notifyNextOrFinalize(documentId: string): Promise<void>
// after a signer signs: if more pending signers, email the next order; else finalize:
// call finalizeDocument, store finalBytes via blob, set finalFileKey/finalHash/status/completedAt,
// email all parties the completed notice, log 'completed'.
export async function recipientSignUrl(token: string): string   // `${APP_URL}/sign/${token}`
```

### `lib/ui.ts`
```ts
export function cn(...inputs: ClassValue[]): string   // clsx + tailwind-merge
```

---

## 4. UI primitives (`components/ui/`)

Build a small, cohesive design system (Tailwind v4, CSS variables already in globals.css).
Components (each its own file, default or named export, typed props, `cn` for classes):
`Button` (variants: primary/secondary/ghost/danger, sizes sm/md/lg, `asChild`? no—keep simple),
`Input`, `Textarea`, `Label`, `Card` (+CardHeader/CardTitle/CardContent), `Badge`
(status colors), `Dialog` (headless, controlled `open`/`onClose`), `Toast`ish inline alerts,
`StatusBadge` mapping doc/recipient status → color+label, `EmptyState`, `Spinner`.
Keep them dependency-light (no external UI kit). Accessible (labels, focus rings, aria).

Design language: clean, trustworthy, modern SaaS. Primary brand color **indigo/violet**
(`--brand`), generous white space, rounded-xl cards, subtle borders, works in light & dark.

---

## 5. Routes & file ownership (feature slices)

Route groups: `app/(app)/*` = authenticated sender area (has sidebar shell); public routes at
top level. Each slice OWNS its files exclusively — do not edit another slice's files.

**FOUNDATION** (built first): `db/schema.ts`, `db/index.ts`, `drizzle.config.ts`,
`lib/env.ts`, `lib/crypto.ts`, `lib/session.ts`, `lib/blob.ts`, `lib/email.ts`, `lib/sms.ts`,
`lib/audit.ts`, `lib/pdf.ts`, `lib/envelope.ts`, `lib/ui.ts`, `lib/types.ts`,
`components/ui/*`, `app/globals.css` (theme tokens), `app/layout.tsx` (root: fonts, metadata,
`<html>` theme). Provides everything below.

**Slice A — Auth**: `app/(auth)/login/page.tsx`, `app/(auth)/login/LoginForm.tsx`,
`app/api/auth/request/route.ts` (POST email → create authToken, email magic link),
`app/api/auth/callback/route.ts` (GET ?token → verify, upsert user, set session, redirect
`/dashboard`), `app/api/auth/logout/route.ts`.

**Slice B — Dashboard & envelope lifecycle**: `app/(app)/dashboard/page.tsx` (list envelopes
with StatusBadge, counts), `app/(app)/documents/[id]/page.tsx` (envelope detail: recipients,
their statuses, audit trail via `getAuditTrail`, download final, void/resend actions),
`app/(app)/documents/actions.ts` (server actions: voidEnvelope, resendToRecipient). Reads DB
directly in RSC. Do NOT build the prepare route (Slice C owns it).

**Slice C — Upload & Prepare editor**: `app/(app)/documents/new/page.tsx` (+ upload client
comp) → POST `app/api/documents/route.ts` (create doc, store PDF in blob, hash, page count),
redirect to prepare. `app/(app)/documents/[id]/prepare/page.tsx` +
`components/prepare/*` (client: render PDF pages via pdfjs/react-pdf, recipient manager, drag
to place fields, assign recipient+type, save). `app/api/documents/[id]/prepare/route.ts`
(PUT recipients+fields), `app/api/documents/[id]/send/route.ts` (POST → `sendEnvelope`).
Configure pdfjs worker locally (no external CDN). Coordinates normalized top-left origin.

**Slice D — Signing experience**: `app/sign/[token]/page.tsx` (RSC loads recipient+doc, guards
status) + `components/sign/*` (client: optional OTP step, PDF viewer with the recipient's
fields as fillable overlays, signature pad → PNG, submit). APIs:
`app/api/sign/[token]/otp/route.ts` (POST → send OTP), `app/api/sign/[token]/verify/route.ts`
(POST code → mark otpVerified), `app/api/sign/[token]/submit/route.ts` (POST field values +
signatures → persist, mark recipient signed, `notifyNextOrFinalize`, audit `signed`),
`app/api/sign/[token]/decline/route.ts`.

**Slice E — Verify & audit assets**: `app/verify/page.tsx` + `components/verify/*` (paste id or
upload PDF → `app/api/verify/route.ts` recomputes hash, compares to finalHash, returns status +
cert summary). `app/api/documents/[id]/download/route.ts` (streams final PDF, audit
`downloaded`). `components/audit/AuditTrail.tsx` (reusable trail table used by Slice B detail).

**Slice F — Landing & shell**: `app/page.tsx` (marketing landing: hero, how-it-works, trust/
security section, CTA to /login), `app/(app)/layout.tsx` (authenticated shell: sidebar nav —
Dashboard, New envelope, logout; requires user), `components/brand/Logo.tsx`,
`components/brand/Nav.tsx`. Do NOT touch `app/layout.tsx` (foundation owns root).

---

## 6. Conventions

- Server-only modules (`lib/pdf.ts`, `lib/envelope.ts`, db access, routes) never imported by
  client components. Client comps get data via props from RSC or `fetch` to the routes above.
- API routes return JSON `{ ok: true, ... }` or `{ ok: false, error }` with proper status.
- Validate request bodies with `zod`.
- Always `logAudit` at each meaningful step.
- Every DB write that changes recipient/doc status also writes an audit event.
- Graceful dev fallbacks (email/sms/blob) so the whole flow is testable with zero external keys.
- Keep components accessible and responsive; light/dark via CSS vars.
- No secrets in client bundles. No external network calls from client except to our own routes.
- TypeScript strict; no `any` unless unavoidable (justify with a comment).
