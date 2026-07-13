import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { hashToken, newId, randomToken } from "@/lib/crypto";
import { sendMagicLink } from "@/lib/email";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** Magic links live for 15 minutes. */
const TOKEN_TTL_MS = 15 * 60 * 1000;

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const { email } = parsed.data;

  try {
    // Find or create the user row for this email so the token can reference it.
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId = existing?.id;
    if (!userId) {
      userId = newId("user");
      const [created] = await db
        .insert(users)
        .values({ id: userId, email })
        // Concurrent requests for the same new email: fall back to the winner.
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });

      if (created) {
        userId = created.id;
      } else {
        const [winner] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        userId = winner?.id ?? userId;
      }
    }

    // Issue a single-use magic-link token; only its hash is stored at rest.
    const token = randomToken();
    await db.insert(authTokens).values({
      id: newId("auth"),
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    const url = `${env.APP_URL}/api/auth/callback?token=${encodeURIComponent(
      token,
    )}`;
    await sendMagicLink({ to: email, url });
  } catch (error) {
    // Log server-side, but never surface details to the caller.
    console.error("[auth/request] failed to issue magic link:", error);
  }

  // Always respond ok so we don't leak whether an account exists.
  return Response.json({ ok: true });
}
