"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Dialog } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import {
  resendToRecipient,
  retryEnvelopeAdvance,
  voidEnvelope,
} from "../actions";
import { saveAsTemplate } from "../../templates/actions";

/* -------------------------------------------------------------------------- */
/* Void control (with confirmation)                                           */
/* -------------------------------------------------------------------------- */

export function VoidEnvelopeButton({ documentId }: { documentId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmVoid() {
    setError(null);
    startTransition(async () => {
      const result = await voidEnvelope(documentId);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t.sender.voidEnvelope}
      </Button>
      <Dialog
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={t.sender.voidConfirmTitle}
        description={t.sender.voidConfirmDescription}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {t.common.cancel}
            </Button>
            <Button variant="danger" loading={pending} onClick={confirmVoid}>
              {t.sender.voidEnvelope}
            </Button>
          </>
        }
      >
        {error && (
          <Alert variant="error" className="mb-1">
            {error}
          </Alert>
        )}
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Stuck-envelope recovery                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Shown only when every signer has signed but the envelope never reached
 * `completed` — i.e. finalization failed after the last signature was recorded.
 */
export function FinishProcessingBanner({ documentId }: { documentId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function retry() {
    setError(null);
    startTransition(async () => {
      const result = await retryEnvelopeAdvance(documentId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <Alert variant="warn" title={t.sender.stalledTitle} className="mt-6">
      <p>{t.sender.stalledBody}</p>
      {error && (
        <p className="mt-2 text-tone-danger" role="alert">
          {error}
        </p>
      )}
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        loading={pending}
        onClick={retry}
      >
        {t.sender.stalledCta}
      </Button>
    </Alert>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-recipient resend control                                               */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Save this envelope as a reusable template                                  */
/* -------------------------------------------------------------------------- */

export function SaveAsTemplateButton({ documentId }: { documentId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    { kind: "saved" } | { kind: "error"; message: string } | null
  >(null);

  function save() {
    setStatus(null);
    startTransition(async () => {
      const result = await saveAsTemplate(documentId);
      setStatus(
        result.ok
          ? { kind: "saved" }
          : { kind: "error", message: result.error },
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" loading={pending} onClick={save}>
        {t.templates.saveAsTemplate}
      </Button>
      {status?.kind === "saved" && (
        <span className="text-xs text-tone-success" role="status">
          {t.templates.saved}{" "}
          <a href="/templates" className="font-medium underline">
            {t.templates.pageTitle}
          </a>
        </span>
      )}
      {status?.kind === "error" && (
        <span className="text-xs text-tone-danger" role="alert">
          {status.message}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Copy signing link                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Escape hatch for when invite email does not reach the signer — a misconfigured
 * sender domain, an aggressive spam filter, a typo'd address the signer can
 * still be reached at another way. The sender hands over the link directly.
 *
 * The link carries the recipient's signing token, so it grants the ability to
 * sign as them; the hint says so, and the button only renders for recipients
 * who have not signed or declined.
 */
export function CopySignLinkButton({ url }: { url: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      // Clipboard API needs a secure context; fall back for http:// dev hosts.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(field);
        if (!ok) throw new Error("execCommand copy rejected");
      }
      setState("copied");
      window.setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" onClick={copy}>
        {t.sender.copySignLink}
      </Button>
      {state === "copied" && (
        <span className="text-xs text-tone-success" role="status">
          {t.sender.signLinkCopied}
        </span>
      )}
      {state === "failed" && (
        <>
          <span className="text-xs text-tone-danger" role="alert">
            {t.sender.signLinkCopyFailed}
          </span>
          {/* Manual fallback: the link has to be reachable even when copying fails. */}
          <input
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="w-64 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground"
          />
        </>
      )}
    </div>
  );
}

export function ResendButton({ recipientId }: { recipientId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    { kind: "sent" } | { kind: "error"; message: string } | null
  >(null);

  function resend() {
    setStatus(null);
    startTransition(async () => {
      const result = await resendToRecipient(recipientId);
      setStatus(
        result.ok ? { kind: "sent" } : { kind: "error", message: result.error },
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" loading={pending} onClick={resend}>
        {t.sender.resendInvite}
      </Button>
      {status?.kind === "sent" && (
        <span className="text-xs text-tone-success" role="status">
          {t.sender.inviteSent}
        </span>
      )}
      {status?.kind === "error" && (
        <span className="text-xs text-tone-danger" role="alert">
          {status.message}
        </span>
      )}
    </div>
  );
}
