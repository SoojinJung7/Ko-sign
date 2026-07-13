import twilio from "twilio";

import { env, isSmsConfigured } from "@/lib/env";

/**
 * OTP delivery via Twilio SMS, with a dev fallback that logs the code so
 * identity verification is testable without Twilio credentials.
 */

const client = isSmsConfigured
  ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
  : null;

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  if (!client) {
    console.log(`[dev sms] ${phone}: ${code}`);
    return;
  }

  await client.messages.create({
    to: phone,
    from: env.TWILIO_FROM,
    body: `Your Ko-sign verification code is ${code}. It expires in 10 minutes.`,
  });
}
