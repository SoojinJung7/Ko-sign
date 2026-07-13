import type { Metadata } from "next";
import Link from "next/link";

import { VerifyForm } from "@/components/verify/VerifyForm";

export const metadata: Metadata = {
  title: "Verify a document",
  description:
    "Confirm that a signed PDF is authentic and unaltered. Upload the file or paste its document ID to check it against Ko-sign's tamper-evident record.",
};

function TrustPoint({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-tone-brand-soft text-tone-brand [&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 sm:px-8 sm:py-16">
      <header className="mb-10">
        <Link
          href="/"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Ko-sign
        </Link>
      </header>

      <div className="grid flex-1 items-start gap-10 lg:grid-cols-[1fr_minmax(26rem,32rem)] lg:gap-16">
        {/* Left: trust messaging */}
        <section className="max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-tone-success-line bg-tone-success-soft px-3 py-1 text-xs font-medium text-tone-success">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d="M12 3 5 6v5.5c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6l-7-3Z"
                strokeLinejoin="round"
              />
              <path
                d="m9 12 2 2 4-4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Independent verification
          </span>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Verify a signed document
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Every document completed on Ko-sign is sealed with a SHA-256
            fingerprint. Upload the PDF or paste its document ID to confirm it is
            authentic and has not been altered since signing.
          </p>

          <div className="mt-8 space-y-5">
            <TrustPoint
              title="Cryptographic proof"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
                </svg>
              }
            >
              We compare the file&apos;s exact SHA-256 hash to the one recorded
              at completion. A single changed byte breaks the match.
            </TrustPoint>
            <TrustPoint
              title="Nothing is uploaded"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            >
              Your PDF is hashed to check it — the file itself is never stored on
              our servers.
            </TrustPoint>
            <TrustPoint
              title="Full signer record"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 20a6 6 0 0 1 12 0" strokeLinecap="round" />
                  <circle cx="10" cy="8" r="3.5" />
                  <path d="M17 11h4M19 9v4" strokeLinecap="round" />
                </svg>
              }
            >
              An authentic result shows the document title, completion date, and
              everyone who signed.
            </TrustPoint>
          </div>
        </section>

        {/* Right: verification widget */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-lg sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Check a document
          </h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Choose how you&apos;d like to verify.
          </p>
          <VerifyForm />
        </section>
      </div>
    </main>
  );
}
