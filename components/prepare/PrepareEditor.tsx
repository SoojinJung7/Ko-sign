"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import { Alert, Button, Input, Label, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { newId } from "@/lib/crypto";
import {
  formatGroupIssue,
  formatGroupRule,
  groupRuleIssue,
  type FieldType,
  type GroupRule,
} from "@/lib/types";
import { cn } from "@/lib/ui";
import {
  colorForIndex,
  DEFAULT_FIELD_SIZE,
  FIELD_TYPE_ICON,
  FIELD_TYPE_META,
  fill,
  MIN_FIELD_SIZE,
} from "./fieldMeta";

// Local worker (bundled, same-origin). pdf.js v6 ships an ESM worker.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export interface EditorRecipient {
  /** Client id; remapped to a server id on save. */
  id: string;
  name: string;
  email: string;
  phone: string;
  order: number;
}

/** A set of checkboxes the signer chooses among. Client id; remapped on save. */
export interface EditorGroup extends GroupRule {
  id: string;
  recipientId: string;
  label: string;
}

export interface EditorField {
  id: string;
  recipientId: string;
  /** Checkbox fields only. */
  groupId: string | null;
  type: FieldType;
  page: number;
  /** Normalized 0..1, top-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
}

export interface PrepareEditorProps {
  documentId: string;
  title: string;
  pageCount: number;
  pdfUrl: string;
  requireIdentityCheck: boolean;
  initialRecipients: EditorRecipient[];
  initialGroups: EditorGroup[];
  initialFields: EditorField[];
}

/**
 * The rules worth naming. Anything else the sender needs is reachable through
 * "Custom", but these four cover essentially every paper form: pick one, pick
 * at least one, pick any or none, pick up to N.
 */
type RulePreset = "one" | "atLeastOne" | "any" | "custom";

const RULE_PRESETS: { value: Exclude<RulePreset, "custom">; rule: GroupRule }[] =
  [
    { value: "one", rule: { minSelected: 1, maxSelected: 1 } },
    { value: "atLeastOne", rule: { minSelected: 1, maxSelected: null } },
    { value: "any", rule: { minSelected: 0, maxSelected: null } },
  ];

function presetFor(rule: GroupRule): RulePreset {
  const match = RULE_PRESETS.find(
    (p) =>
      p.rule.minSelected === rule.minSelected &&
      p.rule.maxSelected === rule.maxSelected,
  );
  return match?.value ?? "custom";
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Short badge naming a checkbox's group, or `null` when it has none. A field box
 * is only a few millimetres wide, so this is the group's name if it has one and
 * its position in the recipient's group list otherwise.
 */
function groupBadgeFor(field: EditorField, groups: EditorGroup[]): string | null {
  if (!field.groupId) return null;
  const mine = groups.filter((g) => g.recipientId === field.recipientId);
  const index = mine.findIndex((g) => g.id === field.groupId);
  if (index === -1) return null;
  return mine[index].label.trim() || `Group ${index + 1}`;
}

interface SaveResponse {
  ok: boolean;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Root editor                                                                */
/* -------------------------------------------------------------------------- */

export function PrepareEditor({
  documentId,
  title,
  pageCount,
  pdfUrl,
  requireIdentityCheck: initialRequireIdentityCheck,
  initialRecipients,
  initialGroups,
  initialFields,
}: PrepareEditorProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [recipients, setRecipients] = useState<EditorRecipient[]>(() =>
    [...initialRecipients].sort((a, b) => a.order - b.order),
  );
  const [groups, setGroups] = useState<EditorGroup[]>(initialGroups);
  const [fields, setFields] = useState<EditorField[]>(initialFields);
  const [requireIdentityCheck, setRequireIdentityCheck] = useState(
    initialRequireIdentityCheck,
  );

  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(
    () => initialRecipients[0]?.id ?? null,
  );
  const [activeTool, setActiveTool] = useState<FieldType | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const busy = saving || sending;

  // Index recipients so field colors/labels can be resolved quickly.
  const recipientIndex = useMemo(() => {
    const map = new Map<string, number>();
    recipients.forEach((r, i) => map.set(r.id, i));
    return map;
  }, [recipients]);

  const activeRecipient =
    recipients.find((r) => r.id === activeRecipientId) ?? null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ----- recipient mutations ----- */

  const addRecipient = useCallback(() => {
    const id = newId("rcp");
    setRecipients((prev) => [
      ...prev,
      { id, name: "", email: "", phone: "", order: prev.length + 1 },
    ]);
    setActiveRecipientId(id);
  }, []);

  const updateRecipient = useCallback(
    (id: string, patch: Partial<Omit<EditorRecipient, "id">>) => {
      setRecipients((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const removeRecipient = useCallback((id: string) => {
    setRecipients((prev) => {
      const next = prev.filter((r) => r.id !== id).map((r, i) => ({ ...r, order: i + 1 }));
      setActiveRecipientId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      return next;
    });
    setFields((prev) => prev.filter((f) => f.recipientId !== id));
    setGroups((prev) => prev.filter((g) => g.recipientId !== id));
  }, []);

  const moveRecipient = useCallback((id: string, dir: -1 | 1) => {
    setRecipients((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      return copy.map((r, i) => ({ ...r, order: i + 1 }));
    });
  }, []);

  /* ----- field mutations ----- */

  const placeField = useCallback(
    (page: number, nx: number, ny: number) => {
      if (!activeTool || !activeRecipientId) return;
      const size = DEFAULT_FIELD_SIZE[activeTool];
      const x = clamp(nx - size.width / 2, 0, 1 - size.width);
      const y = clamp(ny - size.height / 2, 0, 1 - size.height);
      const id = newId("fld");
      setFields((prev) => [
        ...prev,
        {
          id,
          recipientId: activeRecipientId,
          groupId: null,
          type: activeTool,
          page,
          x,
          y,
          width: size.width,
          height: size.height,
          required: true,
        },
      ]);
      setSelectedFieldId(id);
      setActiveTool(null);
    },
    [activeTool, activeRecipientId],
  );

  const updateField = useCallback(
    (id: string, patch: Partial<Omit<EditorField, "id">>) => {
      setFields((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedFieldId((cur) => (cur === id ? null : cur));
  }, []);

  /* ----- checkbox group mutations ----- */

  /** Move a checkbox into a group (`groupId`), or out of every group (`null`). */
  const assignFieldToGroup = useCallback(
    (fieldId: string, groupId: string | null) => {
      setFields((prev) =>
        prev.map((f) => (f.id === fieldId ? { ...f, groupId } : f)),
      );
    },
    [],
  );

  /** Create a group around `fieldId` and return its id. */
  const createGroupFor = useCallback(
    (field: EditorField) => {
      const id = newId("grp");
      setGroups((prev) => [
        ...prev,
        {
          id,
          recipientId: field.recipientId,
          label: "",
          minSelected: 1,
          maxSelected: 1,
        },
      ]);
      assignFieldToGroup(field.id, id);
    },
    [assignFieldToGroup],
  );

  const updateGroup = useCallback(
    (id: string, patch: Partial<Omit<EditorGroup, "id" | "recipientId">>) => {
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      );
    },
    [],
  );

  /** Dissolve a group, releasing its checkboxes as independent fields. */
  const removeGroup = useCallback((id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setFields((prev) =>
      prev.map((f) => (f.groupId === id ? { ...f, groupId: null } : f)),
    );
  }, []);

  const membersOf = useCallback(
    (groupId: string) => fields.filter((f) => f.groupId === groupId),
    [fields],
  );

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedFieldId) ?? null,
    [fields, selectedFieldId],
  );

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, EditorField[]>();
    for (const f of fields) {
      const arr = map.get(f.page) ?? [];
      arr.push(f);
      map.set(f.page, arr);
    }
    return map;
  }, [fields]);

  /* ----- persistence ----- */

  /**
   * Groups that still have checkboxes. A group whose last member was deleted is
   * dropped rather than saved as an empty rule the signer could never satisfy.
   */
  const liveGroups = useMemo(
    () => groups.filter((g) => fields.some((f) => f.groupId === g.id)),
    [groups, fields],
  );

  const validate = useCallback((): string | null => {
    if (recipients.length === 0) return t.prepare.errAddRecipient;
    for (const r of recipients) {
      if (!r.name.trim()) return t.prepare.errRecipientName;
      if (!EMAIL_RE.test(r.email.trim())) {
        return `“${r.name || r.email || t.prepare.aRecipient}” ${t.prepare.needsValidEmail}`;
      }
    }
    if (fields.length === 0) {
      return t.prepare.errPlaceField;
    }
    for (const g of liveGroups) {
      const issue = groupRuleIssue(g, membersOf(g.id).length);
      if (issue) {
        return `${g.label ? `“${g.label}”` : t.prepare.aGroup}: ${formatGroupIssue(issue, t.groupIssue)}`;
      }
    }
    return null;
  }, [recipients, fields, liveGroups, membersOf, t]);

  const buildPayload = useCallback(
    () => ({
      requireIdentityCheck,
      recipients: recipients.map((r, i) => ({
        id: r.id,
        name: r.name.trim(),
        email: r.email.trim(),
        phone: r.phone.trim() ? r.phone.trim() : null,
        order: i + 1,
      })),
      groups: liveGroups.map((g) => ({
        id: g.id,
        recipientId: g.recipientId,
        label: g.label.trim() ? g.label.trim() : null,
        minSelected: g.minSelected,
        maxSelected: g.maxSelected,
      })),
      fields: fields.map((f) => {
        const grouped = f.groupId
          ? liveGroups.some((g) => g.id === f.groupId)
          : false;
        return {
          recipientId: f.recipientId,
          groupId: grouped ? f.groupId : null,
          type: f.type,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          required: f.required,
        };
      }),
    }),
    [requireIdentityCheck, recipients, liveGroups, fields],
  );

  const save = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/documents/${documentId}/prepare`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    const data = (await res.json().catch(() => null)) as SaveResponse | null;
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error ?? t.prepare.saveError);
    }
    return true;
  }, [documentId, buildPayload, t]);

  const onSaveDraft = useCallback(async () => {
    if (busy) return;
    setError(null);
    const invalid =
      recipients.length > 0 &&
      recipients.find((r) => r.email.trim() && !EMAIL_RE.test(r.email.trim()));
    if (invalid) {
      setError(`“${invalid.name || invalid.email}” ${t.prepare.hasInvalidEmail}`);
      return;
    }
    // A draft may hold blank recipients, but never a group rule the server will
    // reject — that would fail the save with a raw 422 instead of a fixable
    // message pointing at the group.
    for (const g of liveGroups) {
      const issue = groupRuleIssue(g, membersOf(g.id).length);
      if (issue) {
        setError(
          `${g.label ? `“${g.label}”` : t.prepare.aGroup}: ${formatGroupIssue(issue, t.groupIssue)}`,
        );
        return;
      }
    }
    setSaving(true);
    try {
      await save();
      setToast(t.prepare.draftSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.prepare.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [busy, recipients, liveGroups, membersOf, save, t]);

  const onSend = useCallback(async () => {
    if (busy) return;
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    try {
      await save();
      const res = await fetch(`/api/documents/${documentId}/send`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as SaveResponse | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? t.prepare.sendError);
      }
      router.push(`/documents/${documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.prepare.sendFailed);
      setSending(false);
    }
  }, [busy, validate, save, documentId, router, t]);

  /* ----- render ----- */

  return (
    <div className="flex min-h-0 flex-col gap-5 lg:flex-row lg:items-start">
      {/* Sidebar: recipients + field palette */}
      <aside className="flex w-full flex-col gap-5 lg:sticky lg:top-6 lg:w-80 lg:shrink-0">
        <RecipientPanel
          recipients={recipients}
          activeRecipientId={activeRecipientId}
          fieldCountFor={(id) =>
            fields.reduce((n, f) => (f.recipientId === id ? n + 1 : n), 0)
          }
          disabled={busy}
          onSelect={setActiveRecipientId}
          onAdd={addRecipient}
          onUpdate={updateRecipient}
          onRemove={removeRecipient}
          onMove={moveRecipient}
        />

        <FieldPalette
          activeTool={activeTool}
          canPlace={Boolean(activeRecipient)}
          onPick={(t) => setActiveTool((cur) => (cur === t ? null : t))}
        />

        {selectedField && (
          <FieldSettings
            field={selectedField}
            groups={groups.filter(
              (g) => g.recipientId === selectedField.recipientId,
            )}
            memberCountOf={(groupId) => membersOf(groupId).length}
            disabled={busy}
            onUpdateField={(patch) => updateField(selectedField.id, patch)}
            onAssignGroup={(groupId) =>
              assignFieldToGroup(selectedField.id, groupId)
            }
            onCreateGroup={() => createGroupFor(selectedField)}
            onUpdateGroup={updateGroup}
            onRemoveGroup={removeGroup}
          />
        )}

        <section className="rounded-xl border border-border bg-surface p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={requireIdentityCheck}
              disabled={busy}
              onChange={(e) => setRequireIdentityCheck(e.target.checked)}
              className="mt-0.5 size-4 rounded border-input-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                {t.prepare.requireIdentity}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t.prepare.requireIdentityHint}
              </span>
            </span>
          </label>
        </section>
      </aside>

      {/* Main canvas */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground">
              {title}
            </h1>
            <p className="text-xs text-muted-foreground">
              {activeTool
                ? t.prepare.clickToPlace
                : activeRecipient
                  ? `${t.prepare.placingPrefix}${activeRecipient.name || t.prepare.recipientFallback}${t.prepare.placingSuffix}`
                  : t.prepare.addRecipientToBegin}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              onClick={onSaveDraft}
              loading={saving}
              disabled={busy}
            >
              {t.prepare.saveDraft}
            </Button>
            <Button onClick={onSend} loading={sending} disabled={busy}>
              {t.prepare.sendEnvelope}
            </Button>
          </div>
        </header>

        {error && (
          <Alert variant="error" title={t.prepare.fixFollowing}>
            {error}
          </Alert>
        )}
        {toast && (
          <Alert variant="success" icon={null}>
            {toast}
          </Alert>
        )}

        <PdfCanvas
          pdfUrl={pdfUrl}
          pageCount={pageCount}
          placing={Boolean(activeTool && activeRecipient)}
          onPlace={placeField}
          renderPageFields={(page) =>
            (fieldsByPage.get(page) ?? []).map((f) => (
              <FieldBox
                key={f.id}
                field={f}
                colorBase={colorForIndex(recipientIndex.get(f.recipientId) ?? 0).base}
                recipientLabel={
                  recipients.find((r) => r.id === f.recipientId)?.name ||
                  t.prepare.recipientLabelFallback
                }
                groupLabel={groupBadgeFor(f, groups)}
                selected={selectedFieldId === f.id}
                // Selecting one member outlines the rest, so "which boxes are
                // in this group" is answerable with a click.
                inSelectedGroup={Boolean(
                  selectedField?.groupId && f.groupId === selectedField.groupId,
                )}
                onSelect={() => setSelectedFieldId(f.id)}
                onChange={(patch) => updateField(f.id, patch)}
                onRemove={() => removeField(f.id)}
              />
            ))
          }
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Recipient panel                                                            */
/* -------------------------------------------------------------------------- */

function RecipientPanel({
  recipients,
  activeRecipientId,
  fieldCountFor,
  disabled,
  onSelect,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: {
  recipients: EditorRecipient[];
  activeRecipientId: string | null;
  fieldCountFor: (id: string) => number;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Omit<EditorRecipient, "id">>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{t.prepare.recipients}</h2>
        <Button size="sm" variant="ghost" onClick={onAdd} disabled={disabled}>
          {t.prepare.add}
        </Button>
      </div>

      {recipients.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {t.prepare.noRecipients}
        </p>
      ) : (
        <ul className="flex flex-col gap-3 p-3">
          {recipients.map((r, i) => {
            const color = colorForIndex(i).base;
            const active = r.id === activeRecipientId;
            const count = fieldCountFor(r.id);
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  active
                    ? "border-transparent ring-2"
                    : "border-border hover:border-border-strong",
                )}
                style={active ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
              >
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(r.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-pressed={active}
                  >
                    <span
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {r.name || t.prepare.unnamedRecipient}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {count} {count === 1 ? t.prepare.fieldSingular : t.prepare.fieldPlural}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <IconButton
                      label={t.prepare.moveUp}
                      disabled={disabled || i === 0}
                      onClick={() => onMove(r.id, -1)}
                    >
                      <path d="m6 15 6-6 6 6" />
                    </IconButton>
                    <IconButton
                      label={t.prepare.moveDown}
                      disabled={disabled || i === recipients.length - 1}
                      onClick={() => onMove(r.id, 1)}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </IconButton>
                    <IconButton
                      label={t.prepare.removeRecipient}
                      disabled={disabled}
                      onClick={() => onRemove(r.id)}
                    >
                      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                    </IconButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div>
                    <Label htmlFor={`rcp-name-${r.id}`} className="sr-only">
                      {t.prepare.nameLabel}
                    </Label>
                    <Input
                      id={`rcp-name-${r.id}`}
                      value={r.name}
                      placeholder={t.prepare.fullNamePlaceholder}
                      disabled={disabled}
                      onChange={(e) => onUpdate(r.id, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`rcp-email-${r.id}`} className="sr-only">
                      {t.prepare.emailLabel}
                    </Label>
                    <Input
                      id={`rcp-email-${r.id}`}
                      type="email"
                      value={r.email}
                      placeholder={t.prepare.emailPlaceholder}
                      disabled={disabled}
                      onChange={(e) => onUpdate(r.id, { email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`rcp-phone-${r.id}`} className="sr-only">
                      {t.prepare.phoneLabel}
                    </Label>
                    <Input
                      id={`rcp-phone-${r.id}`}
                      type="tel"
                      value={r.phone}
                      placeholder={t.prepare.phonePlaceholder}
                      disabled={disabled}
                      onChange={(e) => onUpdate(r.id, { phone: e.target.value })}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Field palette                                                              */
/* -------------------------------------------------------------------------- */

function FieldPalette({
  activeTool,
  canPlace,
  onPick,
}: {
  activeTool: FieldType | null;
  canPlace: boolean;
  onPick: (type: FieldType) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-border bg-surface p-3">
      <h2 className="px-1 pb-2 text-sm font-semibold text-foreground">
        {t.prepare.fields}
      </h2>
      {!canPlace && (
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          {t.prepare.selectRecipientFirst}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {FIELD_TYPE_META.map((meta) => {
          const active = activeTool === meta.type;
          return (
            <button
              key={meta.type}
              type="button"
              disabled={!canPlace}
              onClick={() => onPick(meta.type)}
              aria-pressed={active}
              title={t.fields[meta.type].hint}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                "disabled:pointer-events-none disabled:opacity-50",
                active
                  ? "border-primary bg-brand-500/10 text-foreground ring-1 ring-primary"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={meta.icon} />
              </svg>
              <span className="truncate">{t.fields[meta.type].label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Field settings (shown for the selected field)                              */
/* -------------------------------------------------------------------------- */

const selectClasses =
  "h-9 w-full rounded-lg border border-input-border bg-input px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function FieldSettings({
  field,
  groups,
  memberCountOf,
  disabled,
  onUpdateField,
  onAssignGroup,
  onCreateGroup,
  onUpdateGroup,
  onRemoveGroup,
}: {
  field: EditorField;
  /** Groups belonging to this field's recipient — the only joinable ones. */
  groups: EditorGroup[];
  memberCountOf: (groupId: string) => number;
  disabled: boolean;
  onUpdateField: (patch: Partial<Omit<EditorField, "id">>) => void;
  onAssignGroup: (groupId: string | null) => void;
  onCreateGroup: () => void;
  onUpdateGroup: (
    id: string,
    patch: Partial<Omit<EditorGroup, "id" | "recipientId">>,
  ) => void;
  onRemoveGroup: (id: string) => void;
}) {
  const { t } = useI18n();
  const group = groups.find((g) => g.id === field.groupId) ?? null;
  const isCheckbox = field.type === "checkbox";

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {t.fields[field.type].label}
          {t.prepare.fieldSettingsSuffix}
        </h2>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* A grouped checkbox has no requirement of its own — its group's rule
            is the requirement, so offering both would let them contradict. */}
        {group ? (
          <p className="text-xs text-muted-foreground">
            {t.prepare.groupedNoRequired}
          </p>
        ) : (
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={field.required}
              disabled={disabled}
              onChange={(e) => onUpdateField({ required: e.target.checked })}
              className="mt-0.5 size-4 rounded border-input-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                {t.prepare.requiredLabel}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {isCheckbox
                  ? t.prepare.requiredHintCheckbox
                  : t.prepare.requiredHintField}
              </span>
            </span>
          </label>
        )}

        {isCheckbox && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <Label htmlFor={`fld-group-${field.id}`}>
              {t.prepare.choiceGroup}
            </Label>
            <p className="-mt-1 text-xs text-muted-foreground">
              {t.prepare.choiceGroupHint}
            </p>
            <select
              id={`fld-group-${field.id}`}
              className={selectClasses}
              disabled={disabled}
              value={group ? group.id : "none"}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "new") onCreateGroup();
                else onAssignGroup(value === "none" ? null : value);
              }}
            >
              <option value="none">{t.prepare.groupNone}</option>
              {groups.map((g, i) => (
                <option key={g.id} value={g.id}>
                  {g.label.trim() || `${t.prepare.groupFallbackPrefix}${i + 1}`} (
                  {memberCountOf(g.id)})
                </option>
              ))}
              <option value="new">{t.prepare.groupNew}</option>
            </select>

            {group && (
              <GroupSettings
                group={group}
                memberCount={memberCountOf(group.id)}
                disabled={disabled}
                onUpdate={(patch) => onUpdateGroup(group.id, patch)}
                onRemove={() => onRemoveGroup(group.id)}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function GroupSettings({
  group,
  memberCount,
  disabled,
  onUpdate,
  onRemove,
}: {
  group: EditorGroup;
  memberCount: number;
  disabled: boolean;
  onUpdate: (patch: Partial<Omit<EditorGroup, "id" | "recipientId">>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const preset = presetFor(group);
  const issue = groupRuleIssue(group, memberCount);

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
      <div>
        <Label htmlFor={`grp-label-${group.id}`}>
          {t.prepare.groupNameLabel}
        </Label>
        <Input
          id={`grp-label-${group.id}`}
          value={group.label}
          placeholder={t.prepare.groupNamePlaceholder}
          disabled={disabled}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t.prepare.groupNameHint}
        </p>
      </div>

      <div>
        <Label htmlFor={`grp-rule-${group.id}`}>
          {t.prepare.groupRuleLabel}
        </Label>
        <select
          id={`grp-rule-${group.id}`}
          className={selectClasses}
          disabled={disabled}
          value={preset}
          onChange={(e) => {
            const value = e.target.value as RulePreset;
            const match = RULE_PRESETS.find((p) => p.value === value);
            // "Custom" opens the fields on the rule already in effect rather
            // than resetting it, so switching to it never loses the sender's
            // current numbers.
            if (match) onUpdate(match.rule);
            else onUpdate({ maxSelected: group.maxSelected ?? memberCount });
          }}
        >
          <option value="one">{t.prepare.ruleOne}</option>
          <option value="atLeastOne">{t.prepare.ruleAtLeastOne}</option>
          <option value="any">{t.prepare.ruleAny}</option>
          <option value="custom">{t.prepare.ruleCustom}</option>
        </select>
      </div>

      {preset === "custom" && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor={`grp-min-${group.id}`}>{t.prepare.minLabel}</Label>
            <Input
              id={`grp-min-${group.id}`}
              type="number"
              min={0}
              max={memberCount}
              value={group.minSelected}
              disabled={disabled}
              onChange={(e) =>
                onUpdate({ minSelected: clampInt(e.target.value, 0) })
              }
            />
          </div>
          <div className="flex-1">
            <Label htmlFor={`grp-max-${group.id}`}>{t.prepare.maxLabel}</Label>
            <Input
              id={`grp-max-${group.id}`}
              type="number"
              min={1}
              max={memberCount}
              placeholder={t.prepare.maxNoLimit}
              value={group.maxSelected ?? ""}
              disabled={disabled}
              onChange={(e) =>
                onUpdate({
                  maxSelected:
                    e.target.value === "" ? null : clampInt(e.target.value, 1),
                })
              }
            />
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {memberCount}
        {memberCount === 1
          ? t.prepare.groupSummaryCheckbox
          : t.prepare.groupSummaryCheckboxes}
        {t.prepare.groupSummarySeesPrefix}
        {formatGroupRule(group, t.groupRule)}
        {t.prepare.groupSummarySeesSuffix}
      </p>

      {issue && (
        <p className="text-xs text-tone-danger" role="alert">
          {formatGroupIssue(issue, t.groupIssue)}
        </p>
      )}

      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={onRemove}
        className="self-start text-tone-danger hover:bg-tone-danger-soft hover:text-tone-danger"
      >
        {t.prepare.ungroup}
      </Button>
    </div>
  );
}

/** Parse a number input, floored at `min`. Blank / garbage falls back to `min`. */
function clampInt(raw: string, min: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, n);
}

/* -------------------------------------------------------------------------- */
/* PDF canvas + pages                                                         */
/* -------------------------------------------------------------------------- */

function PdfCanvas({
  pdfUrl,
  pageCount,
  placing,
  onPlace,
  renderPageFields,
}: {
  pdfUrl: string;
  pageCount: number;
  placing: boolean;
  onPlace: (page: number, nx: number, ny: number) => void;
  renderPageFields: (page: number) => ReactNode;
}) {
  const { t } = useI18n();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url: pdfUrl, withCredentials: true });
    task.promise
      .then((loaded) => {
        if (!cancelled) setPdf(loaded);
      })
      .catch(() => {
        if (!cancelled) setError(t.prepare.previewError);
      });
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [pdfUrl, t]);

  if (error) {
    return (
      <Alert variant="error" title={t.prepare.previewUnavailable}>
        {error}
      </Alert>
    );
  }

  if (!pdf) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-24 text-sm text-muted-foreground">
        <Spinner size={18} /> {t.prepare.loadingDocument}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNumber) => (
        <PdfPage
          key={pageNumber}
          pdf={pdf}
          pageNumber={pageNumber}
          placing={placing}
          onPlace={(nx, ny) => onPlace(pageNumber, nx, ny)}
        >
          {renderPageFields(pageNumber)}
        </PdfPage>
      ))}
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  placing,
  onPlace,
  children,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  placing: boolean;
  onPlace: (nx: number, ny: number) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderWidth, setRenderWidth] = useState(0);
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.clientWidth);
      setRenderWidth((prev) => (Math.abs(prev - w) > 8 ? w : prev));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!renderWidth) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setAspect(base.width / base.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = (renderWidth * dpr) / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      try {
        await task.promise;
      } catch {
        // Cancelled (resize / unmount) — ignore.
      }
    })();

    return () => {
      cancelled = true;
      try {
        task?.cancel?.();
      } catch {
        /* no-op */
      }
    };
  }, [pdf, pageNumber, renderWidth]);

  const handlePlaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placing) return;
    // Ignore clicks that originate on an existing field box.
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    onPlace(nx, ny);
  };

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-1.5 text-center text-xs font-medium text-muted-foreground">
        {t.prepare.page} {pageNumber}
      </div>
      <div
        ref={wrapRef}
        onClick={handlePlaceClick}
        className={cn(
          "relative w-full overflow-hidden rounded-xl border border-border bg-white shadow-md",
          placing && "cursor-crosshair",
        )}
        style={aspect ? { aspectRatio: String(aspect) } : undefined}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-none block h-auto w-full"
          aria-label={`${t.prepare.documentPage} ${pageNumber}`}
        />
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field box (drag + resize + delete)                                         */
/* -------------------------------------------------------------------------- */

type DragMode = "move" | "resize";

function FieldBox({
  field,
  colorBase,
  recipientLabel,
  groupLabel,
  selected,
  inSelectedGroup,
  onSelect,
  onChange,
  onRemove,
}: {
  field: EditorField;
  colorBase: string;
  recipientLabel: string;
  /** Set when this checkbox belongs to a choice group. */
  groupLabel: string | null;
  selected: boolean;
  /** This box shares a group with the currently selected one. */
  inSelectedGroup: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Omit<EditorField, "id">>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const elRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origin: { x: number; y: number; width: number; height: number };
    rect: DOMRect;
  } | null>(null);

  const beginDrag = useCallback(
    (mode: DragMode, e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();
      const pageEl = elRef.current?.parentElement;
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        origin: {
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
        },
        rect,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [field.x, field.y, field.width, field.height, onSelect],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / drag.rect.width;
      const dy = (e.clientY - drag.startY) / drag.rect.height;
      if (drag.mode === "move") {
        onChange({
          x: clamp(drag.origin.x + dx, 0, 1 - drag.origin.width),
          y: clamp(drag.origin.y + dy, 0, 1 - drag.origin.height),
        });
      } else {
        const width = clamp(
          drag.origin.width + dx,
          MIN_FIELD_SIZE.width,
          1 - drag.origin.x,
        );
        const height = clamp(
          drag.origin.height + dy,
          MIN_FIELD_SIZE.height,
          1 - drag.origin.y,
        );
        onChange({ width, height });
      }
    },
    [onChange],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  }, []);

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
    backgroundColor: fill(colorBase, selected ? 26 : 16),
    borderColor: colorBase,
    color: colorBase,
    touchAction: "none",
  };

  return (
    <div
      ref={elRef}
      role="button"
      tabIndex={0}
      aria-label={
        groupLabel
          ? `${t.fields[field.type].label} ${t.prepare.fieldFor} ${recipientLabel} · ${groupLabel}`
          : `${t.fields[field.type].label} ${t.prepare.fieldFor} ${recipientLabel}`
      }
      onPointerDown={(e) => beginDrag("move", e)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          onRemove();
        }
      }}
      className={cn(
        "group flex cursor-move items-center justify-center overflow-visible rounded-[3px] border-2 text-[10px] font-medium leading-none select-none",
        selected ? "z-20 shadow-sm" : "z-10",
        inSelectedGroup && !selected && "ring-2 ring-offset-1",
      )}
      style={
        inSelectedGroup && !selected
          ? { ...style, "--tw-ring-color": colorBase } as React.CSSProperties
          : style
      }
    >
      {groupLabel && selected && (
        <span
          className="pointer-events-none absolute -top-1.5 left-0 max-w-[160px] -translate-y-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap text-white"
          style={{ backgroundColor: colorBase }}
        >
          {groupLabel}
        </span>
      )}
      <span className="pointer-events-none flex items-center gap-1 px-1">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={FIELD_TYPE_ICON[field.type]} />
        </svg>
        <span className="truncate">{recipientLabel}</span>
      </span>

      {/* Delete affordance */}
      <button
        type="button"
        aria-label={t.prepare.deleteField}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={cn(
          "absolute -right-2 -top-2 inline-flex size-4 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
          selected && "opacity-100",
        )}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>

      {/* Resize handle */}
      <span
        role="slider"
        aria-label={t.prepare.resizeField}
        aria-valuenow={Math.round(field.width * 100)}
        tabIndex={-1}
        onPointerDown={(e) => beginDrag("resize", e)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-[2px] border-2 bg-white opacity-0 transition-opacity group-hover:opacity-100",
          selected && "opacity-100",
        )}
        style={{ borderColor: colorBase }}
      />
    </div>
  );
}
