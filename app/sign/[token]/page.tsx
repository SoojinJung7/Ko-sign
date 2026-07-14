import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { fields as fieldsTable, recipients } from "@/db/schema";
import { getPdfBytes } from "@/lib/blob";
import { logAudit } from "@/lib/audit";
import { Logo } from "@/components/brand/Logo";
import { SignerApp } from "@/components/sign/SignerApp";
import type { SignerField } from "@/components/sign/types";
import { getDictionary } from "@/lib/i18n/server";
import {
  hasEarlierPendingSigner,
  loadSignerByToken,
} from "@/app/api/sign/[token]/_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: t.signer.metaTitle,
    robots: { index: false, follow: false },
  };
}

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
  const t = await getDictionary();
  const signer = await loadSignerByToken(token);

  if (!signer) {
    return (
      <StatusScreen
        tone="neutral"
        title={t.signer.invalidLinkTitle}
        icon={
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </>
        }
      >
        {t.signer.invalidLinkBody}
      </StatusScreen>
    );
  }

  const { recipient, document } = signer;

  /* ---- Guard states ---------------------------------------------------- */
  if (document.status === "voided") {
    return (
      <StatusScreen
        tone="warning"
        title={t.signer.voidedTitle}
        icon={<><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>}
      >
        {t.signer.voidedBodyPrefix}
        <Strong>{document.title}</Strong>
        {t.signer.voidedBodySuffix}
      </StatusScreen>
    );
  }

  if (recipient.status === "declined") {
    return (
      <StatusScreen
        tone="danger"
        title={t.signer.declinedYouTitle}
        icon={<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>}
      >
        {t.signer.declinedYouBodyPrefix}
        <Strong>{document.title}</Strong>
        {t.signer.declinedYouBodySuffix}
        {recipient.declinedReason ? (
          <>
            {" "}
            {t.signer.reasonGivenLabel}{" "}
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
        title={t.signer.docDeclinedTitle}
        icon={<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>}
      >
        <Strong>{document.title}</Strong>
        {t.signer.docDeclinedBodySuffix}
      </StatusScreen>
    );
  }

  if (recipient.status === "signed") {
    return (
      <StatusScreen
        tone="success"
        title={t.signer.alreadySignedTitle}
        icon={<path d="m5 13 4 4L19 7" />}
      >
        {t.signer.alreadySignedBodyPrefix}
        <Strong>{document.title}</Strong>
        {t.signer.alreadySignedBodySuffix}
      </StatusScreen>
    );
  }

  if (document.status === "completed") {
    return (
      <StatusScreen
        tone="success"
        title={t.signer.completeTitle}
        icon={<path d="m5 13 4 4L19 7" />}
      >
        <Strong>{document.title}</Strong>
        {t.signer.completeBodySuffix}
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
        title={t.signer.notYourTurnTitle}
        icon={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      >
        <Strong>{document.title}</Strong>
        {t.signer.notYourTurnBodySuffix}
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
        title={t.signer.loadErrorTitle}
        icon={<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>}
      >
        {t.signer.loadErrorBody}
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
