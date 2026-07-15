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
    <Alert variant="warn" title="This envelope needs one more step" className="mt-6">
      <p>
        Everyone has signed, but we couldn&apos;t assemble the final PDF and
        certificate. The signatures are safely recorded — retry to finish.
      </p>
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
        Finish processing
      </Button>
    </Alert>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-recipient resend control                                               */
/* -------------------------------------------------------------------------- */

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
