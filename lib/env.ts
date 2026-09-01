/**
 * Central environment access. Never throws at import time so that the app (and
 * tooling like `drizzle-kit` / `tsc`) can load modules even when secrets are
 * absent in development. Actual failures surface only when a feature that
 * genuinely needs a key is exercised.
 */

const DEV_SESSION_SECRET =
  "dev_insecure_session_secret_change_me_please_32+chars";

function optional(key: string): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  /** Empty string in dev is tolerated; db/index constructs a placeholder client. */
  DATABASE_URL: optional("DATABASE_URL") ?? "",
  APP_URL: optional("APP_URL") ?? "http://localhost:3000",
  SESSION_SECRET: optional("SESSION_SECRET") ?? DEV_SESSION_SECRET,

  BLOB_READ_WRITE_TOKEN: optional("BLOB_READ_WRITE_TOKEN"),

  RESEND_API_KEY: optional("RESEND_API_KEY"),
  /** Comma-separated allowlist gating the email diagnostics route. */
  ADMIN_EMAILS: optional("ADMIN_EMAILS") ?? "",
  EMAIL_FROM: optional("EMAIL_FROM") ?? "Ko-sign <onboarding@resend.dev>",

  /**
   * Comma-separated allowlist of admin emails. Only these accounts may enter the
   * sender area (create / prepare / send envelopes and manage templates). Stored
   * lowercased so comparisons are case-insensitive. Empty ⇒ nobody is admin.
   */
  ADMIN_EMAILS: (optional("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  TWILIO_ACCOUNT_SID: optional("TWILIO_ACCOUNT_SID"),
  TWILIO_AUTH_TOKEN: optional("TWILIO_AUTH_TOKEN"),
  TWILIO_FROM: optional("TWILIO_FROM"),
} as const;

export const isEmailConfigured: boolean = Boolean(env.RESEND_API_KEY);

/**
 * Deny by default: with no allowlist configured, nobody is an admin. Sending
 * infrastructure details to a signed-in stranger is worse than locking us out.
 */
export function isAdminEmail(email: string): boolean {
  const allow = env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.length > 0 && allow.includes(email.trim().toLowerCase());
}

export const isSmsConfigured: boolean = Boolean(
  env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM,
);

export const isBlobConfigured: boolean = Boolean(env.BLOB_READ_WRITE_TOKEN);
