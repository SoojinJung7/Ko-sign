"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import { Alert, Spinner } from "@/components/ui";
import { groupIsRequired, groupRuleLabel, groupSatisfied } from "@/lib/types";
import { cn } from "@/lib/ui";
import { checkedCount, fieldHasValue, isChecked } from "./requirements";
import type { FieldValue, SignerField, SignerGroup } from "./types";

// Local worker (bundled asset, same-origin). pdf.js v6 ships an ESM worker.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface DocumentViewerProps {
  pdfBase64: string;
  pageCount: number;
  fields: SignerField[];
  groups: SignerGroup[];
  values: Record<string, FieldValue>;
  /** Whether fields are interactive (false once submitted / read-only). */
  interactive: boolean;
  onChange: (fieldId: string, value: FieldValue | null) => void;
  /** Toggle a checkbox. Group rules (radio swap, ceiling) live in the parent. */
  onToggleCheckbox: (field: SignerField) => void;
  /** Open the signature pad for a signature / initials field. */
  onOpenSignature: (field: SignerField) => void;
}

export function DocumentViewer({
  pdfBase64,
  pageCount,
  fields,
  groups,
  values,
  interactive,
  onChange,
  onToggleCheckbox,
  onOpenSignature,
}: DocumentViewerProps) {
  const bytes = useMemo(() => base64ToBytes(pdfBase64), [pdfBase64]);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // getDocument detaches the buffer — hand it a copy so <StrictMode>
    // double-invocation can't hit a neutered array.
    const task = pdfjs.getDocument({ data: bytes.slice() });
    task.promise
      .then((loaded) => {
        if (!cancelled) setPdf(loaded);
      })
      .catch(() => {
        if (!cancelled) setError("We couldn't display this document.");
      });
    // Destroying the loading task tears down the document proxy + worker link.
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [bytes]);

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, SignerField[]>();
    for (const f of fields) {
      const arr = map.get(f.page) ?? [];
      arr.push(f);
      map.set(f.page, arr);
    }
    return map;
  }, [fields]);

  /**
   * A checkbox group's state, resolved once and shared by every member so the
   * whole set highlights and clears together.
   */
  const groupState = useMemo(() => {
    const map = new Map<
      string,
      { group: SignerGroup; satisfied: boolean; members: SignerField[] }
    >();
    for (const group of groups) {
      const members = fields.filter((f) => f.groupId === group.id);
      map.set(group.id, {
        group,
        members,
        satisfied: groupSatisfied(checkedCount(members, values), group),
      });
    }
    return map;
  }, [groups, fields, values]);

  /** Rule hints, anchored to the bounding box of each group's boxes on a page. */
  const hintsByPage = useMemo(() => {
    const map = new Map<number, GroupHint[]>();
    if (!interactive) return map;

    for (const { group, members, satisfied } of groupState.values()) {
      if (satisfied || !groupIsRequired(group)) continue;
      const pages = new Set(members.map((m) => m.page));
      for (const page of pages) {
        const onPage = members.filter((m) => m.page === page);
        const left = Math.min(...onPage.map((m) => m.x));
        const top = Math.min(...onPage.map((m) => m.y));
        const bottom = Math.max(...onPage.map((m) => m.y + m.height));
        const arr = map.get(page) ?? [];
        arr.push({
          id: group.id,
          text: group.label
            ? `${group.label} · ${groupRuleLabel(group)}`
            : groupRuleLabel(group),
          left,
          top,
          bottom,
        });
        map.set(page, arr);
      }
    }
    return map;
  }, [groupState, interactive]);

  if (error) {
    return (
      <Alert variant="error" title="Preview unavailable">
        {error}
      </Alert>
    );
  }

  if (!pdf) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-24 text-sm text-muted-foreground">
        <Spinner size={18} /> Loading document…
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Every grouped box points at its group's rule via aria-describedby. The
          visible pill can't serve that: it comes and goes with the rule's state. */}
      {groups.map((group) => (
        <span key={group.id} id={`sign-group-${group.id}`} className="sr-only">
          {group.label ? `${group.label}. ` : ""}
          {groupRuleLabel(group)}
        </span>
      ))}
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNumber) => (
        <PdfPage key={pageNumber} pdf={pdf} pageNumber={pageNumber}>
          {(fieldsByPage.get(pageNumber) ?? []).map((field) => {
            const state = field.groupId
              ? groupState.get(field.groupId)
              : undefined;
            return (
              <FieldOverlay
                key={field.id}
                field={field}
                value={values[field.id]}
                // A grouped checkbox is never highlighted on its own: the whole
                // group stays lit until the group's rule is met, then clears.
                needsAttention={
                  state ? !state.satisfied && groupIsRequired(state.group) : field.required
                }
                radio={state?.group.maxSelected === 1}
                interactive={interactive}
                onChange={(v) => onChange(field.id, v)}
                onToggle={() => onToggleCheckbox(field)}
                onOpenSignature={() => onOpenSignature(field)}
              />
            );
          })}
          {(hintsByPage.get(pageNumber) ?? []).map((hint) => (
            <GroupHintPill key={hint.id} hint={hint} />
          ))}
        </PdfPage>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A single rendered page + its absolutely-positioned field overlays          */
/* -------------------------------------------------------------------------- */

function PdfPage({
  pdf,
  pageNumber,
  children,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderWidth, setRenderWidth] = useState(0);
  const [aspect, setAspect] = useState<number | null>(null);

  // Track the display width so we can rasterize at a crisp resolution.
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
        // Render was cancelled (width changed / unmounted) — ignore.
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

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-1.5 text-center text-xs font-medium text-muted-foreground">
        Page {pageNumber}
      </div>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-white shadow-md"
        style={aspect ? { aspectRatio: String(aspect) } : undefined}
      >
        <canvas
          ref={canvasRef}
          className="block h-auto w-full"
          aria-label={`Document page ${pageNumber}`}
        />
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Checkbox group hint                                                        */
/* -------------------------------------------------------------------------- */

interface GroupHint {
  id: string;
  text: string;
  /** Normalized bounds of the group's boxes on this page. */
  left: number;
  top: number;
  bottom: number;
}

/**
 * "Choose one" — the thing a bare column of checkboxes can't say for itself.
 * Sits above the group, or below it when the group is too near the page top for
 * the pill to fit. It only renders while the rule is unmet, so it stops
 * covering the page as soon as it has been read and acted on.
 */
function GroupHintPill({ hint }: { hint: GroupHint }) {
  const below = hint.top < 0.05;
  return (
    <span
      className={cn(
        "pointer-events-none absolute z-20 whitespace-nowrap rounded-full border border-brand-400 bg-brand-500 px-2 py-0.5",
        "text-[clamp(8px,1.1vw,11px)] font-medium leading-tight text-white shadow-sm",
      )}
      style={{
        left: `${hint.left * 100}%`,
        top: `${(below ? hint.bottom : hint.top) * 100}%`,
        transform: below
          ? "translate(-2px, 4px)"
          : "translate(-2px, calc(-100% - 4px))",
      }}
      // The rule is already announced on each member via aria-describedby.
      aria-hidden="true"
    >
      {hint.text}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Field overlay                                                              */
/* -------------------------------------------------------------------------- */

function FieldOverlay({
  field,
  value,
  needsAttention,
  radio,
  interactive,
  onChange,
  onToggle,
  onOpenSignature,
}: {
  field: SignerField;
  value: FieldValue | undefined;
  /** Highlight this field as outstanding work. */
  needsAttention: boolean;
  /** Member of a choose-one group — announce it as a radio, not a checkbox. */
  radio?: boolean;
  interactive: boolean;
  onChange: (value: FieldValue | null) => void;
  onToggle: () => void;
  onOpenSignature: () => void;
}) {
  const filled = fieldHasValue(field, value);

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
  };

  const stateClasses = filled
    ? "border border-tone-success-line bg-tone-success-soft"
    : needsAttention
      ? "border-2 border-brand-400 bg-brand-500/10 dark:bg-brand-400/15"
      : "border border-dashed border-border-strong bg-surface/70";

  const commonWrap = cn(
    "flex items-center justify-center overflow-hidden rounded-[3px] text-[clamp(9px,1.4vw,13px)] leading-none",
    stateClasses,
    !interactive && "pointer-events-none",
  );

  // Signature / initials → open the pad.
  if (field.type === "signature" || field.type === "initials") {
    return (
      <button
        type="button"
        id={`sign-field-${field.id}`}
        style={style}
        onClick={onOpenSignature}
        disabled={!interactive}
        aria-label={`${field.type === "initials" ? "Initials" : "Signature"} field${field.required ? ", required" : ""}`}
        className={cn(commonWrap, interactive && "cursor-pointer transition-colors")}
      >
        {value?.imageData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.imageData}
            alt=""
            className="max-h-full max-w-full object-contain px-0.5"
          />
        ) : value?.value ? (
          <span
            className="truncate px-1 text-slate-900"
            style={{
              fontFamily:
                '"Segoe Script","Snell Roundhand","Brush Script MT",cursive',
              fontSize: "clamp(11px,2vw,22px)",
            }}
          >
            {value.value}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1 font-medium text-brand-700 dark:text-brand-200">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 17c3-1 4-9 6-9s2 6 4 6 2-4 4-4" />
              <path d="M3 20h18" />
            </svg>
            {field.type === "initials" ? "Initials" : "Sign"}
          </span>
        )}
      </button>
    );
  }

  // Checkbox → toggle button. Grouped boxes delegate to the parent, which owns
  // the group's rules; the DOM role follows the rule so assistive tech
  // announces a choose-one group as the radio group it behaves like.
  if (field.type === "checkbox") {
    const checked = isChecked(value);
    return (
      <button
        type="button"
        id={`sign-field-${field.id}`}
        role={radio ? "radio" : "checkbox"}
        aria-checked={checked}
        aria-describedby={
          field.groupId ? `sign-group-${field.groupId}` : undefined
        }
        aria-label={
          radio
            ? "Choice"
            : `Checkbox${!field.groupId && field.required ? ", required" : ""}`
        }
        style={style}
        disabled={!interactive}
        onClick={onToggle}
        className={cn(commonWrap, interactive && "cursor-pointer")}
      >
        {checked && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3/4 w-3/4 text-tone-success"
            aria-hidden="true"
          >
            <path d="m5 12 4 4 10-11" />
          </svg>
        )}
      </button>
    );
  }

  // Date → native date input.
  if (field.type === "date") {
    return (
      <div style={style} id={`sign-field-${field.id}`} className={commonWrap}>
        <input
          type="date"
          value={value?.value ?? ""}
          disabled={!interactive}
          onChange={(e) =>
            onChange(e.target.value ? { value: e.target.value } : null)
          }
          aria-label={`Date field${field.required ? ", required" : ""}`}
          className="h-full w-full bg-transparent px-1 text-center text-[inherit] text-slate-900 outline-none dark:text-slate-900"
        />
      </div>
    );
  }

  // Text → free text input.
  return (
    <div style={style} id={`sign-field-${field.id}`} className={commonWrap}>
      <input
        type="text"
        value={value?.value ?? ""}
        disabled={!interactive}
        onChange={(e) =>
          onChange(e.target.value ? { value: e.target.value } : null)
        }
        placeholder={field.required ? "Required" : ""}
        aria-label={`Text field${field.required ? ", required" : ""}`}
        className="h-full w-full bg-transparent px-1 text-[inherit] text-slate-900 outline-none placeholder:text-brand-700/50 dark:text-slate-900"
      />
    </div>
  );
}
