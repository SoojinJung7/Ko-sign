import { env, isAdminEmail, isEmailConfigured } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Read-only diagnostics for outbound email. Vercel stores EMAIL_FROM as a
 * sensitive variable, so its value cannot be read back from the dashboard or
 * the CLI — yet a wrong sender domain is the most common reason invites are
 * silently filtered by the recipient's mail host. This surfaces the effective
 * sender alongside Resend's own view of which domains are verified to send it.
 */

interface ResendDomain {
  name: string;
  status: string;
  region?: string;
  created_at?: string;
}

/** `Ko-sign <no-reply@example.com>` → `example.com` */
function senderDomain(from: string): string | null {
  const match = from.match(/<([^>]+)>/);
  const address = (match ? match[1] : from).trim();
  const at = address.lastIndexOf("@");
  return at === -1 ? null : address.slice(at + 1).toLowerCase();
}

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    // Same response for signed-out and non-admin: don't confirm the route exists.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const from = env.EMAIL_FROM;
  const domain = senderDomain(from);

  let domains: ResendDomain[] | null = null;
  let domainsError: string | null = null;

  if (isEmailConfigured) {
    try {
      const response = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
        cache: "no-store",
      });
      if (response.ok) {
        const body = (await response.json()) as { data?: ResendDomain[] };
        domains = body.data ?? [];
      } else {
        domainsError = `Resend responded ${response.status}: ${await response.text()}`;
      }
    } catch (error) {
      domainsError = error instanceof Error ? error.message : String(error);
    }
  }

  const verified = domains
    ?.filter((d) => d.status === "verified")
    .map((d) => d.name.toLowerCase());

  // `onboarding@resend.dev` only reaches the Resend account owner — every other
  // recipient is rejected, which looks exactly like "the email never arrived".
  const usingTestSender = domain === "resend.dev";
  const senderVerified = domain != null && verified?.includes(domain);

  return Response.json({
    emailFrom: from,
    senderDomain: domain,
    appUrl: env.APP_URL,
    resendKeyConfigured: isEmailConfigured,
    usingTestSender,
    senderDomainVerified: senderVerified ?? null,
    resendDomains: domains?.map((d) => ({ name: d.name, status: d.status })) ?? null,
    domainsError,
    diagnosis: usingTestSender
      ? "EMAIL_FROM is Resend's shared test sender: only the Resend account owner can receive mail. Set EMAIL_FROM to an address on a verified domain."
      : senderVerified === false
        ? `EMAIL_FROM sends as ${domain}, which is not verified in Resend. Recipients enforcing SPF/DMARC will reject or quarantine it.`
        : senderVerified
          ? "Sender domain is verified in Resend. If mail still goes missing, check the recipient's spam/quarantine and the delivery status in the Resend dashboard."
          : "Could not determine domain verification; see domainsError.",
  });
}
