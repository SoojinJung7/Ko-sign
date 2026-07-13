import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { recipients } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { isSmsConfigured } from "@/lib/env";
import { logAudit } from "@/lib/audit";

import { jsonError, jsonOk, loadSignerByToken } from "../_lib";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "Enter the numeric code we sent you."),
});

/** Fixed dev bypass code, only honored when SMS delivery isn't configured. */
const DEV_BYPASS_CODE = "000000";

/**
 * POST /api/sign/[token]/verify  { code }
 * Compare the submitted code to the hashed OTP stored on the recipient (or the
 * dev bypass when SMS is not configured), then mark identity verified.
 */
export async function POST(
  req: Request,
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

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return jsonError("Enter the 6-digit code we sent you.", 400);
  }

  const devBypass = !isSmsConfigured && parsed.code === DEV_BYPASS_CODE;

  if (!devBypass) {
    if (!recipient.otpCodeHash || !recipient.otpExpiresAt) {
      return jsonError("Request a verification code first.", 400);
    }
    if (recipient.otpExpiresAt.getTime() < Date.now()) {
      return jsonError("That code has expired — request a new one.", 400);
    }
    if (hashToken(parsed.code) !== recipient.otpCodeHash) {
      return jsonError("That code is incorrect. Please try again.", 400);
    }
  }

  await db
    .update(recipients)
    .set({
      otpVerifiedAt: new Date(),
      otpCodeHash: null,
      otpExpiresAt: null,
    })
    .where(eq(recipients.id, recipient.id));

  await logAudit({
    documentId: document.id,
    recipientId: recipient.id,
    type: "otp_verified",
  });

  return jsonOk();
}
