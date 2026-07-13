import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    redirect("/login?error=invalid");
  }

  const tokenHash = hashToken(token);

  const [row] = await db
    .select()
    .from(authTokens)
    .where(eq(authTokens.tokenHash, tokenHash))
    .limit(1);

  // Reject unknown, already-used, or expired tokens.
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    redirect("/login?error=invalid");
  }

  // Mark the token used, guarding against a race so it can only redeem once.
  const [claimed] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(eq(authTokens.id, row.id))
    .returning({ id: authTokens.id });

  if (!claimed) {
    redirect("/login?error=invalid");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);

  if (!user) {
    redirect("/login?error=invalid");
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  await session.save();

  redirect("/dashboard");
}
