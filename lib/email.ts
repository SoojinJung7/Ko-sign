import { Resend } from "resend";

import { env, isEmailConfigured } from "@/lib/env";

/**
 * Transactional email via Resend, with a dev fallback that logs the subject and
 * the key action URL to the console so flows are exercisable without an API key.
 */

const BRAND = "Ko-sign";
const resend = isEmailConfigured ? new Resend(env.RESEND_API_KEY) : null;

/* -------------------------------------------------------------------------- */
/* HTML shell                                                                 */
/* -------------------------------------------------------------------------- */

interface ButtonEmailOptions {
  heading: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  outro?: string;
  footnote?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(bodyInner: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2130;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e6ef;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <span style="display:inline-block;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#4f46e5;">${BRAND}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;">
                ${bodyInner}
              </td>
            </tr>
          </table>
          <p style="max-width:520px;color:#8a8aa0;font-size:12px;line-height:1.6;margin:20px auto 0;padding:0 16px;">
            ${BRAND} is a secure e-signature service. If you weren't expecting this email you can safely ignore it.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buttonEmail(opts: ButtonEmailOptions): string {
  return shell(`
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:#1f2130;">${opts.heading}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4a5e;">${opts.intro}</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:10px;background:#4f46e5;">
          <a href="${opts.ctaUrl}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${opts.ctaLabel}</a>
        </td>
      </tr>
    </table>
    ${opts.outro ? `<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#4a4a5e;">${opts.outro}</p>` : ""}
    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8a8aa0;">
      If the button doesn't work, copy and paste this link into your browser:<br />
      <a href="${opts.ctaUrl}" style="color:#4f46e5;word-break:break-all;">${opts.ctaUrl}</a>
    </p>
    ${opts.footnote ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#a0a0b4;">${opts.footnote}</p>` : ""}
  `);
}

async function send(opts: {
  to: string;
  subject: string;
  html: string;
  keyUrl: string;
}): Promise<void> {
  if (!resend) {
    // Dev fallback: no API key configured.
    console.log(
      `[dev email] to=${opts.to} subject="${opts.subject}" url=${opts.keyUrl}`,
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) {
    throw new Error(`Resend failed to send "${opts.subject}": ${error.message}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function sendSigningInvite(opts: {
  to: string;
  recipientName: string;
  senderName: string;
  documentTitle: string;
  message?: string | null;
  signUrl: string;
}): Promise<void> {
  const subject = `${opts.senderName} requests your signature: ${opts.documentTitle}`;
  const intro = `${escapeHtml(opts.senderName)} has invited you to review and sign <strong>${escapeHtml(
    opts.documentTitle,
  )}</strong>.`;
  const html = buttonEmail({
    heading: `Hi ${escapeHtml(opts.recipientName)},`,
    intro,
    ctaLabel: "Review & sign",
    ctaUrl: opts.signUrl,
    outro: opts.message
      ? `<span style="display:block;padding:14px 16px;background:#f6f5ff;border:1px solid #e6e3ff;border-radius:10px;color:#3f3f5a;">“${escapeHtml(
          opts.message,
        )}”</span>`
      : undefined,
    footnote:
      "This signing link is unique to you — please don't forward it to anyone else.",
  });

  await send({ to: opts.to, subject, html, keyUrl: opts.signUrl });
}

export async function sendMagicLink(opts: {
  to: string;
  url: string;
}): Promise<void> {
  const subject = `Your ${BRAND} sign-in link`;
  const html = buttonEmail({
    heading: "Sign in to Ko-sign",
    intro:
      "Click the button below to securely sign in. This link expires shortly and can be used once.",
    ctaLabel: "Sign in",
    ctaUrl: opts.url,
    footnote: "If you didn't request this, you can safely ignore this email.",
  });

  await send({ to: opts.to, subject, html, keyUrl: opts.url });
}

export async function sendCompletedNotice(opts: {
  to: string;
  documentTitle: string;
  downloadUrl: string;
}): Promise<void> {
  const subject = `Completed: ${opts.documentTitle}`;
  const html = buttonEmail({
    heading: "Your document is complete",
    intro: `All parties have signed <strong>${escapeHtml(
      opts.documentTitle,
    )}</strong>. A finalized copy with a full audit certificate is ready to download.`,
    ctaLabel: "Download signed PDF",
    ctaUrl: opts.downloadUrl,
    footnote:
      "The finalized PDF includes a Certificate of Completion and is tamper-evident.",
  });

  await send({ to: opts.to, subject, html, keyUrl: opts.downloadUrl });
}
