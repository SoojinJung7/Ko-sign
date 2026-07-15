"use client";

import { useState, type FormEvent } from "react";

import { Alert, Button, Card, CardContent, Input, Label } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

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
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    initialError ? t.auth.errorInvalidLink : null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();

    if (!EMAIL_RE.test(trimmed)) {
      setError(t.auth.errorInvalidEmail);
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
        setError(data?.error ?? t.auth.errorGeneric);
        setStatus("idle");
        return;
      }

      setStatus("sent");
    } catch {
      setError(t.auth.errorNetwork);
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
              {t.auth.sentHeading}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.auth.sentPrefix}{" "}
              <span className="font-medium text-foreground">{email.trim()}</span>
              {t.auth.sentSuffix}
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
            {t.auth.useDifferentEmail}
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
            <Label htmlFor="email">{t.auth.emailLabel}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder={t.auth.emailPlaceholder}
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
            {t.auth.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
