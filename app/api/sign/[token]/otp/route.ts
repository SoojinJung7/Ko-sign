import { eq } from "drizzle-orm";

import { db } from "@/db";
import { recipients } from "@/db/schema";
import { generateOtp, hashToken } from "@/lib/crypto";
import { isSmsConfigured } from "@/lib/env";
import { sendOtpSms } from "@/lib/sms";
import { logAudit } from "@/lib/audit";

import { jsonError, jsonOk, loadSignerByToken } from "../_lib";

export const runtime = "nodejs";

/** OTP validity window. */
const OTP_TTL_MS = 10 * 60 * 1000;

/**
 * POST /api/sign/[token]/otp
 * Generate a one-time identity-verification code, store it hashed on the
 * recipient, and deliver it by SMS. In dev (no Twilio) the code is printed to
 * the server console and `000000` also works at the verify step.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const signer = await loadSignerByToken(token);
  if (!signer) return jsonError("This signing link is invalid.", 404);

  const { recipient, document } = signer;

  if (recipient.status === "signed") {
    return jsonError("You have already signed this document.", 409);
  }
  if (
    recipient.status === "declined" ||
    document.status === "declined" ||
    document.status === "voided"
  ) {
    return jsonError("This document is no longer available for signing.", 409);
  }
  if (!recipient.phone) {
    return jsonError(
      "No phone number is on file for identity verification.",
      400,
    );
  }

  const code = generateOtp();
  await db
    .update(recipients)
    .set({
      otpCodeHash: hashToken(code),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
    })
    .where(eq(recipients.id, recipient.id));

  await sendOtpSms(recipient.phone, code);

  await logAudit({
    documentId: document.id,
    recipientId: recipient.id,
    type: "otp_sent",
  });

  // `devMode` lets the client surface a hint that 000000 works locally.
  return jsonOk({ devMode: !isSmsConfigured });
}
