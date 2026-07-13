"use client";

import { useState, type FormEvent } from "react";

import { Alert, Button, Card, CardContent, Input, Label } from "@/components/ui";

const MailIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ initialError = false }: { initialError?: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    initialError ? "That sign-in link was invalid or expired. Try again." : null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();

    if (!EMAIL_RE.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError(null);
    setStatus("submitting");

    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }

      setStatus("sent");
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6 pt-6 text-center">
          <span
            className="flex size-12 items-center justify-center rounded-full bg-tone-success-soft text-tone-success"
            aria-hidden="true"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Check your email
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a sign-in link to{" "}
              <span className="font-medium text-foreground">{email.trim()}</span>
              . Click it to finish signing in — it expires in 15 minutes.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatus("idle");
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 pt-6">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {error && (
            <Alert variant="error" className="text-sm">
              {error}
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              leadingIcon={MailIcon}
              value={email}
              invalid={Boolean(error)}
              disabled={status === "submitting"}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            fullWidth
            loading={status === "submitting"}
            disabled={status === "submitting"}
          >
            Send magic link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
