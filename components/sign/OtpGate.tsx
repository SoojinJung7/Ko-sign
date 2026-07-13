"use client";

import { useState } from "react";

import { Alert, Button } from "@/components/ui";
import { cn } from "@/lib/ui";

export interface OtpGateProps {
  token: string;
  onVerified: () => void;
}

/**
 * Identity gate: request a one-time code by SMS, then enter it. Deliberately
 * calm and legible — this is the first friction a signer meets.
 */
export function OtpGate({ token, onVerified }: OtpGateProps) {
  const [stage, setStage] = useState<"start" | "code">("start");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);

  async function post(path: string, body?: unknown) {
    const res = await fetch(`/api/sign/${token}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: boolean; error?: string; devMode?: boolean }
      | null;
    return { ok: res.ok && Boolean(data?.ok), data };
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post("otp");
      if (!ok) throw new Error(data?.error ?? "Couldn't send a code.");
      setDevMode(Boolean(data?.devMode));
      setStage("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send a code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.trim().length < 6) {
      setError("Enter the 6-digit code we sent you.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post("verify", { code: code.trim() });
      if (!ok) throw new Error(data?.error ?? "That code didn't work.");
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex flex-col items-center text-center">
          <span
            className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-tone-brand-soft text-tone-brand"
            aria-hidden="true"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Verify it&apos;s you
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stage === "start"
              ? "This document requires identity verification. We'll text a one-time code to the phone number on file."
              : "Enter the 6-digit code we just sent by SMS."}
          </p>
        </div>

        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        {stage === "start" ? (
          <Button fullWidth size="lg" loading={busy} onClick={sendCode}>
            Send verification code
          </Button>
        ) : (
          <div className="space-y-4">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              autoFocus
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") verify();
              }}
              placeholder="••••••"
              aria-label="6-digit verification code"
              className={cn(
                "h-14 w-full rounded-xl border border-input-border bg-input text-center text-2xl font-semibold tracking-[0.5em] text-foreground shadow-sm outline-none",
                "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35",
              )}
            />
            <Button
              fullWidth
              size="lg"
              loading={busy}
              disabled={code.length < 6}
              onClick={verify}
            >
              Verify &amp; continue
            </Button>
            <div className="flex items-center justify-center">
              <Button variant="ghost" size="sm" onClick={sendCode} disabled={busy}>
                Resend code
              </Button>
            </div>

            {devMode && (
              <Alert variant="info" title="Developer mode">
                SMS isn&apos;t configured, so the code was printed to your server
                console. The code <code className="font-mono">000000</code> also
                works here.
              </Alert>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
