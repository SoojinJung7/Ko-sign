import Link from "next/link";
import {
  ArrowRight,
  Upload,
  PenLine,
  FileSignature,
  ShieldCheck,
  Fingerprint,
  ScrollText,
  Lock,
  Check,
  CircleCheckBig,
} from "lucide-react";

import { Logo } from "@/components/brand/Logo";

export const metadata = {
  title: "Ko-sign — Sign documents with confidence",
  description:
    "Upload a PDF, place fields, and collect legally-sound e-signatures with SMS identity verification and a tamper-evident, SHA-256 audit trail.",
};

/* -------------------------------------------------------------------------- */
/*  Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function PrimaryCta({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground shadow-sm outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      {children}
    </Link>
  );
}

function SecondaryCta({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input-border bg-surface px-5 text-[0.9375rem] font-semibold text-foreground shadow-sm outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <Security />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                     */
/* -------------------------------------------------------------------------- */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center rounded-lg px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ko-sign home"
        >
          <Logo size={28} className="text-[1.15rem]" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground sm:flex">
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#security" className="transition-colors hover:text-foreground">
            Security
          </a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            Sign in
          </Link>
          <PrimaryCta href="/login" className="h-9 px-4 text-sm">
            Get started
          </PrimaryCta>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                       */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient gradient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_srgb,var(--primary)_22%,transparent),transparent_70%)]"
      />
      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:px-8 lg:pb-24 lg:pt-24">
        <div className="flex flex-col items-start">
          <span className="inline-flex items-center gap-2 rounded-full border border-tone-brand-line bg-tone-brand-soft px-3 py-1 text-xs font-medium text-tone-brand">
            <ShieldCheck size={14} aria-hidden />
            Tamper-evident e-signatures
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
            Sign documents with{" "}
            <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent dark:from-brand-300 dark:to-brand-500">
              confidence
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Ko-sign is the modern way to collect legally-sound signatures. Upload
            a PDF, place fields in seconds, and send it off — every step is
            verified by SMS and sealed with a tamper-evident audit trail.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <PrimaryCta href="/login">
              Start signing free
              <ArrowRight size={18} aria-hidden />
            </PrimaryCta>
            <SecondaryCta href="#how-it-works">See how it works</SecondaryCta>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["No credit card required", "SHA-256 sealed", "Audit trail on every signature"].map(
              (item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check size={16} className="text-tone-success" aria-hidden />
                  {item}
                </li>
              ),
            )}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

/** Abstract product mockup: a document being signed with a live audit trail. */
function HeroVisual() {
  return (
    <div className="relative lg:pl-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-500/20 to-brand-800/10 blur-2xl"
      />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-lg sm:p-5">
        {/* Faux window chrome */}
        <div className="mb-4 flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-tone-danger/60" />
          <span className="size-2.5 rounded-full bg-tone-warning/60" />
          <span className="size-2.5 rounded-full bg-tone-success/60" />
          <span className="ml-2 truncate text-xs text-muted-foreground">
            Master Services Agreement.pdf
          </span>
        </div>

        {/* Document body */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="space-y-2.5">
            <div className="h-2.5 w-1/3 rounded-full bg-muted-foreground/25" />
            <div className="h-2 w-full rounded-full bg-muted-foreground/12" />
            <div className="h-2 w-11/12 rounded-full bg-muted-foreground/12" />
            <div className="h-2 w-4/5 rounded-full bg-muted-foreground/12" />
          </div>

          {/* Signature field */}
          <div className="mt-6 flex items-end justify-between gap-4">
            <div className="flex-1">
              <div className="mb-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                Signature
              </div>
              <div className="flex h-14 items-center rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 px-4">
                <svg
                  viewBox="0 0 120 32"
                  className="h-8 w-28 text-primary"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M2 24c8-16 13-18 16-16s2 14 6 14 6-18 11-18 4 20 9 20 7-10 12-12 10 6 18-4"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-tone-success-line bg-tone-success-soft px-2.5 py-1 text-xs font-medium text-tone-success">
              <CircleCheckBig size={13} aria-hidden />
              Signed
            </span>
          </div>
        </div>

        {/* Audit trail snippet */}
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
            <ScrollText size={14} className="text-primary" aria-hidden />
            Audit trail
          </div>
          <ol className="space-y-2.5">
            {[
              { label: "Envelope sent", meta: "10:02 · you@company.com" },
              { label: "Identity verified via SMS", meta: "10:14 · +1 ••• ••42" },
              { label: "Signed & SHA-256 sealed", meta: "10:15 · 3f9a…c7e1" },
            ].map((row) => (
              <li key={row.label} className="flex items-start gap-3">
                <span
                  className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"
                  aria-hidden
                >
                  <Check size={11} strokeWidth={3} />
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-xs font-medium text-foreground">
                    {row.label}
                  </span>
                  <span className="font-mono text-[0.65rem] text-muted-foreground">
                    {row.meta}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Trust strip                                                                */
/* -------------------------------------------------------------------------- */

function TrustStrip() {
  const stats = [
    { value: "SHA-256", label: "Cryptographic sealing" },
    { value: "SMS", label: "Identity verification" },
    { value: "100%", label: "Traceable audit trail" },
    { value: "PDF", label: "Sign what you already have" },
  ];
  return (
    <section className="border-y border-border bg-surface/50">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
        {stats.map((s) => (
          <div key={s.label} className="px-2 py-6 text-center sm:py-8">
            <div className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {s.value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  How it works                                                               */
/* -------------------------------------------------------------------------- */

function HowItWorks() {
  const steps = [
    {
      icon: Upload,
      title: "Upload",
      body: "Drop in any PDF. Ko-sign hashes it with SHA-256 the moment it lands, so you have a fingerprint of the original before anyone touches it.",
    },
    {
      icon: PenLine,
      title: "Prepare",
      body: "Place signature, date, and text fields with a click, then assign each to a recipient. Add signers, set an order, and require SMS identity checks.",
    },
    {
      icon: FileSignature,
      title: "Sign",
      body: "Recipients verify by SMS and sign from any device. When the last signer is done, the envelope is finalized and sealed — with a full audit trail attached.",
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            How it works
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            From PDF to signed in three steps
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            No new file formats, no plugins, no friction. Ko-sign works with the
            documents you already have.
          </p>
        </div>

        <ol className="mt-14 grid gap-6 lg:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <step.icon size={22} aria-hidden />
                </span>
                <span className="font-mono text-sm font-medium text-muted-foreground">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Security / trust                                                           */
/* -------------------------------------------------------------------------- */

function Security() {
  const features = [
    {
      icon: ScrollText,
      title: "Complete audit trail",
      body: "Every view, verification, and signature is timestamped and recorded. Export a court-ready certificate of completion with a single click.",
    },
    {
      icon: Fingerprint,
      title: "Tamper-proof SHA-256",
      body: "Documents are hashed on upload and again when finalized. Any change to a single byte breaks the seal — so you always know the file is authentic.",
    },
    {
      icon: ShieldCheck,
      title: "SMS identity verification",
      body: "Require signers to confirm a one-time code sent to their phone before they can sign, tying each signature to a verified identity.",
    },
  ];

  return (
    <section
      id="security"
      className="scroll-mt-20 border-t border-border bg-surface/40 py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
          <div className="lg:sticky lg:top-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-tone-brand-line bg-tone-brand-soft px-3 py-1 text-xs font-medium text-tone-brand">
              <Lock size={14} aria-hidden />
              Security & trust
            </span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Built to hold up under scrutiny
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Signatures are only as good as the evidence behind them. Ko-sign
              captures that evidence at every step, so an agreement can stand on
              its own long after it&apos;s signed.
            </p>
            <div className="mt-8">
              <PrimaryCta href="/login">
                Create your first envelope
                <ArrowRight size={18} aria-hidden />
              </PrimaryCta>
            </div>
          </div>

          <ul className="grid gap-4">
            {features.map((f) => (
              <li
                key={f.title}
                className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <f.icon size={22} aria-hidden />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Final CTA                                                                  */
/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-14 text-center shadow-lg sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(255,255,255,0.18),transparent_70%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ready to send your first envelope?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
              Sign in and have a document out for signature in under two minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-6 text-[0.9375rem] font-semibold text-brand-700 shadow-sm outline-none transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-700"
              >
                Get started free
                <ArrowRight size={18} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Footer                                                                     */
/* -------------------------------------------------------------------------- */

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-sm">
          <Logo size={26} className="text-[1.05rem]" />
          <p className="mt-3 text-sm text-muted-foreground">
            The modern, secure way to collect legally-sound signatures — with a
            tamper-evident audit trail on every document.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium text-muted-foreground"
        >
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#security" className="transition-colors hover:text-foreground">
            Security
          </a>
          <Link href="/login" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Ko-sign. All rights reserved.</p>
          <p className="inline-flex items-center gap-1.5">
            <ShieldCheck size={13} aria-hidden />
            Secured with SHA-256 &amp; SMS verification
          </p>
        </div>
      </div>
    </footer>
  );
}
