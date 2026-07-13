import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { fields as fieldsTable, recipients } from "@/db/schema";
import { getPdfBytes } from "@/lib/blob";
import { logAudit } from "@/lib/audit";
import { Logo } from "@/components/brand/Logo";
import { SignerApp } from "@/components/sign/SignerApp";
import type { SignerField } from "@/components/sign/types";
import {
  hasEarlierPendingSigner,
  loadSignerByToken,
} from "@/app/api/sign/[token]/_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review & sign",
  robots: { index: false, follow: false },
};

/**
 * Public, token-addressed signing page. Resolves the recipient behind a link,
 * gates on the document's state with friendly screens, records that the signer
 * viewed it, and hands off to the interactive client signer.
 */
export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const signer = await loadSignerByToken(token);

  if (!signer) {
    return (
      <StatusScreen
        tone="neutral"
        title="This signing link isn't valid"
        icon={
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </>
        }
      >
        The link may be incomplete or expired. Please use the most recent link
        from your email, or ask the sender to resend it.
      </StatusScreen>
    );
  }

  const { recipient, document } = signer;

  /* ---- Guard states ---------------------------------------------------- */
  if (document.status === "voided") {
    return (
      <StatusScreen
        tone="warning"
        title="This document was voided"
        icon={<><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>}
      >
        The sender voided <Strong>{document.title}</Strong>, so it can no longer
        be signed. Contact them if you think this is a mistake.
      </StatusScreen>
    );
  }

  if (recipient.status === "declined") {
    return (
      <StatusScreen
        tone="danger"
        title="You declined this document"
        icon={<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>}
      >
        You previously declined to sign <Strong>{document.title}</Strong>.
        {recipient.declinedReason ? (
          <>
            {" "}
            Reason given:{" "}
            <span className="italic">“{recipient.declinedReason}”</span>
          </>
        ) : null}
      </StatusScreen>
    );
  }

  if (document.status === "declined") {
    return (
      <StatusScreen
        tone="danger"
        title="This document was declined"
        icon={<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>}
      >
        <Strong>{document.title}</Strong> was declined and is no longer
        available for signing.
      </StatusScreen>
    );
  }

  if (recipient.status === "signed") {
    return (
      <StatusScreen
        tone="success"
        title="You've already signed"
        icon={<path d="m5 13 4 4L19 7" />}
      >
        Thanks — your signature on <Strong>{document.title}</Strong> is already
        on file. Once everyone has signed, a completed copy will be emailed to
        you.
      </StatusScreen>
    );
  }

  if (document.status === "completed") {
    return (
      <StatusScreen
        tone="success"
        title="This document is complete"
        icon={<path d="m5 13 4 4L19 7" />}
      >
        <Strong>{document.title}</Strong> has been completed. A copy with the
        certificate of completion has been emailed to all parties.
      </StatusScreen>
    );
  }

  // Sequential signing: it isn't this signer's turn yet.
  if (
    recipient.role === "signer" &&
    (await hasEarlierPendingSigner(document.id, recipient.order))
  ) {
    return (
      <StatusScreen
        tone="info"
        title="Almost there — it's not your turn yet"
        icon={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      >
        <Strong>{document.title}</Strong> is being signed in order, and another
        signer needs to act before you. We&apos;ll email you the moment it&apos;s
        your turn.
      </StatusScreen>
    );
  }

  /* ---- Active: record the view, then hand off to the client ------------ */
  if (!recipient.viewedAt) {
    await logAudit({
      documentId: document.id,
      recipientId: recipient.id,
      type: "viewed",
    });
  }
  if (recipient.status === "pending" || recipient.status === "sent") {
    await db
      .update(recipients)
      .set({ status: "viewed", viewedAt: recipient.viewedAt ?? new Date() })
      .where(eq(recipients.id, recipient.id));
  }

  const fieldRows = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.recipientId, recipient.id))
    .orderBy(asc(fieldsTable.page), asc(fieldsTable.y));

  const signerFields: SignerField[] = fieldRows.map((f) => ({
    id: f.id,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    required: f.required,
  }));

  let pdfBase64: string;
  try {
    const bytes = await getPdfBytes(document.originalFileKey);
    pdfBase64 = Buffer.from(bytes).toString("base64");
  } catch {
    return (
      <StatusScreen
        tone="danger"
        title="We couldn't load this document"
        icon={<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>}
      >
        The document file couldn&apos;t be read right now. Please try again in a
        few minutes, or contact the sender.
      </StatusScreen>
    );
  }

  const needsOtp =
    document.requireIdentityCheck &&
    Boolean(recipient.phone) &&
    !recipient.otpVerifiedAt;

  return (
    <SignerApp
      token={token}
      role={recipient.role}
      needsOtp={needsOtp}
      doc={{
        id: document.id,
        title: document.title,
        message: document.message,
        pageCount: document.pageCount,
        fileName: document.originalFileName,
      }}
      recipient={{ name: recipient.name, email: recipient.email }}
      fields={signerFields}
      pdfBase64={pdfBase64}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Friendly full-page status screens (server-rendered)                        */
/* -------------------------------------------------------------------------- */

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>;
}

const toneClasses = {
  neutral: "bg-tone-neutral-soft text-tone-neutral",
  info: "bg-tone-info-soft text-tone-info",
  success: "bg-tone-success-soft text-tone-success",
  warning: "bg-tone-warning-soft text-tone-warning",
  danger: "bg-tone-danger-soft text-tone-danger",
} as const;

function StatusScreen({
  tone,
  title,
  icon,
  children,
}: {
  tone: keyof typeof toneClasses;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
          <Logo size={26} />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <span
            className={`mx-auto mb-5 inline-flex size-14 items-center justify-center rounded-2xl ${toneClasses[tone]}`}
            aria-hidden="true"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {icon}
            </svg>
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {children}
          </p>
        </div>
      </main>
    </div>
  );
}
