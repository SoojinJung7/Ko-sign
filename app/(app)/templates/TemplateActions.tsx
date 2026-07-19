"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Dialog } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { createDraftFromTemplate, deleteTemplate } from "./actions";

/* -------------------------------------------------------------------------- */
/* Use a template → new draft (redirects to prepare)                          */
/* -------------------------------------------------------------------------- */

export function UseTemplateButton({ templateId }: { templateId: string }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function use() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects and never returns; only a failure
      // resolves here with a result to surface.
      const result = await createDraftFromTemplate(templateId);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" loading={pending} onClick={use}>
        {t.templates.useTemplate}
      </Button>
      {error && (
        <span className="text-xs text-tone-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Delete a template (with confirmation)                                      */
/* -------------------------------------------------------------------------- */

export function DeleteTemplateButton({ templateId }: { templateId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTemplate(templateId);
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
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t.templates.delete}
      </Button>
      <Dialog
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={t.templates.deleteConfirmTitle}
        description={t.templates.deleteConfirmDescription}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {t.common.cancel}
            </Button>
            <Button variant="danger" loading={pending} onClick={confirmDelete}>
              {t.templates.delete}
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
