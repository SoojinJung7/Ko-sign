"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Dialog, Textarea } from "@/components/ui";
import { Logo } from "@/components/brand/Logo";
import { useI18n } from "@/lib/i18n/provider";
import { formatGroupRule } from "@/lib/types";
import { cn } from "@/lib/ui";
import { DocumentViewer } from "./DocumentViewer";
import { SignaturePad } from "./SignaturePad";
import { OtpGate } from "./OtpGate";
import {
  buildRequirements,
  fieldHasValue,
  isChecked,
  requirementDone,
  requirementIsRequired,
} from "./requirements";
import type {
  FieldValue,
  SignerDocInfo,
  SignerField,
  SignerGroup,
  SignerRecipientInfo,
} from "./types";

export interface SignerAppProps {
  token: string;
  doc: SignerDocInfo;
  recipient: SignerRecipientInfo;
  role: "signer" | "viewer";
  fields: SignerField[];
  groups: SignerGroup[];
  pdfBase64: string;
  /** Show the OTP gate before signing. */
  needsOtp: boolean;
}

type Phase = "otp" | "work" | "done" | "declined";

export function SignerApp({
  token,
  doc,
  recipient,
  role,
  fields,
  groups,
  pdfBase64,
  needsOtp,
}: SignerAppProps) {
  const { t } = useI18n();
  const canSign = role === "signer";
  const [phase, setPhase] = useState<Phase>(
    canSign && needsOtp ? "otp" : "work",
  );
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [activeField, setActiveField] = useState<SignerField | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  /** Transient nudge for a rule the signer just bumped into (e.g. a full group). */
  const [notice, setNotice] = useState<string | null>(null);

  const groupById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups],
  );
  const requirements = useMemo(
    () => buildRequirements(fields, groups),
    [fields, groups],
  );
  const required = useMemo(
    () => requirements.filter(requirementIsRequired),
    [requirements],
  );

  const completedRequired = required.filter((r) =>
    requirementDone(r, values),
  ).length;
  const allRequiredDone =
    required.length === 0 || completedRequired === required.length;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function setFieldValue(fieldId: string, value: FieldValue | null) {
    setSubmitError(null);
    setValues((prev) => {
      if (value === null) {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      }
      return { ...prev, [fieldId]: value };
    });
  }

  /**
   * Toggle a checkbox, honoring its group's ceiling. A group capped at one
   * behaves like a radio: picking a new box releases the old one, since that is
   * what "choose one" means to everyone who has ever filled in a form. A higher
   * cap can't guess which box to drop, so it refuses and says why.
   */
  function toggleCheckbox(field: SignerField) {
    setNotice(null);
    const checked = isChecked(values[field.id]);
    const group = field.groupId ? groupById.get(field.groupId) : undefined;

    if (!group || checked) {
      setFieldValue(field.id, checked ? null : { value: "true" });
      return;
    }

    const max = group.maxSelected;
    if (max === null) {
      setFieldValue(field.id, { value: "true" });
      return;
    }

    const members = fields.filter((f) => f.groupId === group.id);
    const chosen = members.filter((m) => isChecked(values[m.id]));
    if (chosen.length < max) {
      setFieldValue(field.id, { value: "true" });
      return;
    }

    if (max === 1) {
      setSubmitError(null);
      setValues((prev) => {
        const next = { ...prev };
        for (const m of chosen) delete next[m.id];
        next[field.id] = { value: "true" };
        return next;
      });
      return;
    }

    setNotice(
      `${group.label ? `“${group.label}”: ` : ""}${t.signer.groupFullPrefix}${max}${t.signer.groupFullSuffix}`,
    );
  }

  function jumpToNext() {
    const next = required.find((r) => !requirementDone(r, values));
    if (!next) return;
    const target =
      next.kind === "field" ? next.field : (next.members[0] ?? null);
    if (!target) return;
    const el = document.getElementById(`sign-field-${target.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (next.kind === "group") {
      setNotice(
        `${next.group.label ? `“${next.group.label}”: ` : ""}${formatGroupRule(next.group, t.groupRule)}`,
      );
      return;
    }
    if (target.type === "signature" || target.type === "initials") {
      setTimeout(() => setActiveField(target), 350);
    } else {
      (el?.querySelector("input") as HTMLElement | null)?.focus();
    }
  }

  async function submit() {
    if (!allRequiredDone) {
      jumpToNext();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = fields
        .filter((f) => fieldHasValue(f, values[f.id]))
        .map((f) => {
          const v = values[f.id];
          if (f.type === "signature" || f.type === "initials") {
            return {
              fieldId: f.id,
              kind: v.kind,
              imageData: v.imageData,
              value: v.value,
            };
          }
          return { fieldId: f.id, value: v.value };
        });

      const res = await fetch(`/api/sign/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: payload }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? t.signer.submitErrorFallback);
      }
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : t.signer.submitErrorFallback,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDecline() {
    setDeclining(true);
    setDeclineError(null);
    try {
      const res = await fetch(`/api/sign/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? t.signer.genericError);
      }
      setDeclineOpen(false);
      setPhase("declined");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setDeclineError(e instanceof Error ? e.message : t.signer.genericError);
    } finally {
      setDeclining(false);
    }
  }

  /* ---- Terminal states -------------------------------------------------- */
  if (phase === "done") {
    return (
      <Outcome
        tone="success"
        title={t.signer.doneTitle}
        icon={
          <path d="m5 13 4 4L19 7" />
        }
      >
        {t.signer.donePrefix}
        {recipient.name.split(" ")[0] || recipient.name}
        {t.signer.doneMid}
        <strong className="font-medium text-foreground">{doc.title}</strong>
        {t.signer.doneSuffix}
      </Outcome>
    );
  }

  if (phase === "declined") {
    return (
      <Outcome
        tone="danger"
        title={t.signer.declinedTitle}
        icon={<path d="M6 6 18 18M18 6 6 18" />}
      >
        {t.signer.declinedPrefix}
        <strong className="font-medium text-foreground">{doc.title}</strong>
        {t.signer.declinedSuffix}
      </Outcome>
    );
  }

  if (phase === "otp") {
    return (
      <Shell title={doc.title} subtitle={t.signer.secureSigning}>
        <div className="py-12">
          <OtpGate token={token} onVerified={() => setPhase("work")} />
        </div>
      </Shell>
    );
  }

  /* ---- Working state (view / sign) ------------------------------------- */
  return (
    <Shell
      title={doc.title}
      subtitle={t.signer.secureSigning}
      action={
        canSign ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeclineOpen(true)}
            className="text-tone-danger hover:bg-tone-danger-soft hover:text-tone-danger"
          >
            {t.signer.declineCta}
          </Button>
        ) : null
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 pb-40 pt-6 sm:px-6">
        {doc.message && (
          <Alert
            variant="info"
            title={t.signer.messageFromSender}
            className="mb-6"
          >
            {doc.message}
          </Alert>
        )}

        {!canSign && (
          <Alert variant="info" className="mb-6">
            {t.signer.viewerNoticePrefix}
            <strong>{t.signer.viewerBadge}</strong>
            {t.signer.viewerNoticeSuffix}
          </Alert>
        )}

        {submitError && (
          <Alert variant="error" title={t.signer.submitErrorTitle} className="mb-6">
            {submitError}
          </Alert>
        )}

        <DocumentViewer
          pdfBase64={pdfBase64}
          pageCount={doc.pageCount}
          fields={fields}
          groups={groups}
          values={values}
          interactive={canSign}
          onChange={setFieldValue}
          onToggleCheckbox={toggleCheckbox}
          onOpenSignature={(f) => setActiveField(f)}
        />
      </div>

      {/* Sticky action bar (signers only) */}
      {canSign && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <ProgressRing done={completedRequired} total={required.length} />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {allRequiredDone
                    ? t.signer.requiredAllComplete
                    : `${t.signer.requiredProgressPrefix}${completedRequired}${t.signer.requiredProgressMid}${required.length}${t.signer.requiredProgressSuffix}`}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    notice ? "text-tone-warning" : "text-muted-foreground",
                  )}
                  role={notice ? "status" : undefined}
                >
                  {notice ??
                    (allRequiredDone
                      ? t.signer.reviewThenFinish
                      : t.signer.fillHighlighted)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!allRequiredDone && (
                <Button variant="secondary" onClick={jumpToNext}>
                  {t.signer.nextField}
                </Button>
              )}
              <Button
                size="lg"
                loading={submitting}
                onClick={submit}
                disabled={!allRequiredDone && required.length > 0}
              >
                {t.signer.finishSigning}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Signature pad */}
      {activeField && (
        <SignaturePad
          key={activeField.id}
          open
          onClose={() => setActiveField(null)}
          label={
            activeField.type === "initials"
              ? t.fields.initials.label
              : t.fields.signature.label
          }
          suggested={
            activeField.type === "initials"
              ? recipient.name
                  .split(/\s+/)
                  .map((p) => p[0] ?? "")
                  .join("")
                  .toUpperCase()
              : recipient.name
          }
          onAdopt={(v) => setFieldValue(activeField.id, v)}
        />
      )}

      {/* Decline dialog */}
      <Dialog
        open={declineOpen}
        onClose={() => !declining && setDeclineOpen(false)}
        title={t.signer.declineDialogTitle}
        description={t.signer.declineDialogDesc}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeclineOpen(false)}
              disabled={declining}
            >
              {t.signer.goBack}
            </Button>
            <Button variant="danger" onClick={confirmDecline} loading={declining}>
              {t.signer.declineCta}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {declineError && <Alert variant="error">{declineError}</Alert>}
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder={t.signer.declineReasonPlaceholder}
            rows={3}
          />
        </div>
      </Dialog>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */
/* Presentational bits                                                        */
/* -------------------------------------------------------------------------- */

function Shell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo markOnly size={26} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {title}
              </p>
              <p className="text-xs text-muted-foreground">
                {subtitle} · Ko-sign
              </p>
            </div>
          </div>
          {action}
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  const complete = pct >= 100;
  return (
    <div
      className="relative grid size-9 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${
          complete ? "var(--t-success)" : "var(--primary)"
        } ${pct}%, var(--border) 0)`,
      }}
      aria-hidden="true"
    >
      <span className="grid size-7 place-items-center rounded-full bg-surface text-[11px] font-semibold text-foreground">
        {complete ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5 text-tone-success"
          >
            <path d="m5 13 4 4L19 7" />
          </svg>
        ) : (
          `${pct}%`
        )}
      </span>
    </div>
  );
}

function Outcome({
  tone,
  title,
  icon,
  children,
}: {
  tone: "success" | "danger";
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
            className={cn(
              "mx-auto mb-5 inline-flex size-14 items-center justify-center rounded-2xl",
              tone === "success"
                ? "bg-tone-success-soft text-tone-success"
                : "bg-tone-danger-soft text-tone-danger",
            )}
            aria-hidden="true"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
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
