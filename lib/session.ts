import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";

import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { env } from "@/lib/env";

export interface SessionData {
  userId?: string;
  email?: string;
}

const sessionOptions: SessionOptions = {
  password: env.SESSION_SECRET,
  cookieName: "signflow_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https://"),
    path: "/",
  },
};

/** Load (or create) the iron-session backed by the request cookie store. */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/** Resolve the currently signed-in user, or null when absent. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session.userId) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user ?? null;
}

/** Require an authenticated user; redirect to /login otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
