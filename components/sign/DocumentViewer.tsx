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
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/ui";
import type { FieldValue, SignerField } from "./types";

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
  values: Record<string, FieldValue>;
  /** Whether fields are interactive (false once submitted / read-only). */
  interactive: boolean;
  onChange: (fieldId: string, value: FieldValue | null) => void;
  /** Open the signature pad for a signature / initials field. */
  onOpenSignature: (field: SignerField) => void;
}

export function DocumentViewer({
  pdfBase64,
  pageCount,
  fields,
  values,
  interactive,
  onChange,
  onOpenSignature,
}: DocumentViewerProps) {
  const { t } = useI18n();
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
        if (!cancelled) setError(t.signer.viewerError);
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

  if (error) {
    return (
      <Alert variant="error" title={t.signer.previewUnavailable}>
        {error}
      </Alert>
    );
  }

  if (!pdf) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-24 text-sm text-muted-foreground">
        <Spinner size={18} /> {t.signer.loadingDocument}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNumber) => (
        <PdfPage key={pageNumber} pdf={pdf} pageNumber={pageNumber}>
          {(fieldsByPage.get(pageNumber) ?? []).map((field) => (
            <FieldOverlay
              key={field.id}
              field={field}
              value={values[field.id]}
              interactive={interactive}
              onChange={(v) => onChange(field.id, v)}
              onOpenSignature={() => onOpenSignature(field)}
            />
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
  const { t } = useI18n();
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
        {t.signer.pageLabel} {pageNumber}
      </div>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-white shadow-md"
        style={aspect ? { aspectRatio: String(aspect) } : undefined}
      >
        <canvas
          ref={canvasRef}
          className="block h-auto w-full"
          aria-label={`${t.signer.documentPageLabel} ${pageNumber}`}
        />
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field overlay                                                              */
/* -------------------------------------------------------------------------- */

function isChecked(value: FieldValue | undefined): boolean {
  return (value?.value ?? "").toLowerCase() === "true";
}

function hasValue(field: SignerField, value: FieldValue | undefined): boolean {
  if (!value) return false;
  switch (field.type) {
    case "signature":
    case "initials":
      return Boolean(value.imageData || (value.value && value.value.trim()));
    case "checkbox":
      return isChecked(value);
    default:
      return Boolean(value.value && value.value.trim());
  }
}

function FieldOverlay({
  field,
  value,
  interactive,
  onChange,
  onOpenSignature,
}: {
  field: SignerField;
  value: FieldValue | undefined;
  interactive: boolean;
  onChange: (value: FieldValue | null) => void;
  onOpenSignature: () => void;
}) {
  const { t } = useI18n();
  const filled = hasValue(field, value);
  const requiredSuffix = field.required ? t.signer.requiredSuffix : "";

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
  };

  const stateClasses = filled
    ? "border border-tone-success-line bg-tone-success-soft"
    : field.required
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
        aria-label={`${field.type === "initials" ? t.fields.initials.label : t.fields.signature.label} ${t.signer.fieldWord}${requiredSuffix}`}
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
            {field.type === "initials" ? t.fields.initials.label : t.signer.signCta}
          </span>
        )}
      </button>
    );
  }

  // Checkbox → toggle button.
  if (field.type === "checkbox") {
    const checked = isChecked(value);
    return (
      <button
        type="button"
        id={`sign-field-${field.id}`}
        role="checkbox"
        aria-checked={checked}
        aria-label={`${t.fields.checkbox.label}${requiredSuffix}`}
        style={style}
        disabled={!interactive}
        onClick={() => onChange(checked ? null : { value: "true" })}
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
          aria-label={`${t.fields.date.label} ${t.signer.fieldWord}${requiredSuffix}`}
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
        placeholder={field.required ? t.signer.requiredPlaceholder : ""}
        aria-label={`${t.fields.text.label} ${t.signer.fieldWord}${requiredSuffix}`}
        className="h-full w-full bg-transparent px-1 text-[inherit] text-slate-900 outline-none placeholder:text-brand-700/50 dark:text-slate-900"
      />
    </div>
  );
}
