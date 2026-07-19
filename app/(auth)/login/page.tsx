import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getDictionary } from "@/lib/i18n/server";
import { getCurrentUser, isAdminEmail } from "@/lib/session";
import { LoginForm } from "./LoginForm";
import { ForbiddenNotice } from "./ForbiddenNotice";

export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: t.auth.metaTitle,
    description: t.auth.metaDescription,
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Already signed in as an admin? Skip the form. A signed-in *non-admin* is not
  // redirected (that would loop against the admin-gated shell) — we show them an
  // access-denied notice below instead.
  const user = await getCurrentUser();
  if (user && isAdminEmail(user.email)) redirect("/dashboard");

  const { error, forbidden } = await searchParams;
  const hasError = error === "invalid";
  const showForbidden = forbidden === "1" || Boolean(user);
  const t = await getDictionary();

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="text-2xl font-bold tracking-tight text-primary">
            Ko-sign
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            {t.auth.heading}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t.auth.subheading}
          </p>
        </div>

        {showForbidden && <ForbiddenNotice />}

        <LoginForm initialError={hasError} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t.auth.terms}
        </p>
      </div>
    </main>
  );
}
