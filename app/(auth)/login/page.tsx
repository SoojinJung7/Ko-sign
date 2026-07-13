import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Ko-sign with a secure magic link — no password required.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Already signed in? Skip the form.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { error } = await searchParams;
  const hasError = error === "invalid";

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="text-2xl font-bold tracking-tight text-primary">
            Ko-sign
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            Sign in to your account
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We&apos;ll email you a secure link to sign in. No password needed.
          </p>
        </div>

        <LoginForm initialError={hasError} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to Ko-sign&apos;s terms and privacy policy.
        </p>
      </div>
    </main>
  );
}
