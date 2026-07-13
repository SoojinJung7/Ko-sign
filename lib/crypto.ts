import { createHash, randomBytes, randomInt } from "node:crypto";

import { nanoid } from "nanoid";

/** Prefixed, collision-resistant id, e.g. `doc_V1StGXR8_Z5jdHi6B-myT`. */
export function newId(prefix: string): string {
  return `${prefix}_${nanoid(21)}`;
}

/** Lowercase hex SHA-256 of the given data. */
export function sha256Hex(data: Buffer | Uint8Array | string): string {
  const input =
    typeof data === "string"
      ? Buffer.from(data, "utf8")
      : Buffer.from(data);
  return createHash("sha256").update(input).digest("hex");
}

/** URL-safe random token (~32 base64url chars) for magic/signing links. */
export function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Deterministic hash used to store link/OTP tokens at rest. */
export function hashToken(token: string): string {
  return sha256Hex(token);
}

/** 6-digit numeric OTP, zero-padded, using a CSPRNG. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
