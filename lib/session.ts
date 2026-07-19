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

/** True when `email` is on the admin allowlist (`ADMIN_EMAILS`). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Resolve the current user only if they are an admin; null otherwise (whether
 * signed out or signed in as a non-admin). Use in API routes to answer with a
 * 403 rather than a redirect.
 */
export async function getAdminUser(): Promise<User | null> {
  const user = await getCurrentUser();
  return user && isAdminEmail(user.email) ? user : null;
}

/**
 * Require an authenticated *admin* for pages/server-components. Signed-out users
 * go to /login; signed-in non-admins go to /login?forbidden=1 (the login page
 * renders an access-denied notice there instead of bouncing them back — which
 * would loop). Only admins are allowed through.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/login?forbidden=1");
  return user;
}
