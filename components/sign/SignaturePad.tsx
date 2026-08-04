"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Button, Dialog } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/ui";
import type { FieldValue } from "./types";

type Mode = "draw" | "type" | "stamp";

export interface SignaturePadProps {
  open: boolean;
  onClose: () => void;
  /** "Signature" or "Initials" — drives copy. */
  label: string;
  /** Prefill for the typed tab (full name for signatures, initials otherwise). */
  suggested?: string;
  onAdopt: (value: FieldValue) => void;
}

const INK = "#1c1e2b";
const CANVAS_HEIGHT = 200;

/** Longest edge of a processed stamp image, keeping data URLs small. */
const MAX_STAMP_DIM = 600;

/**
 * Downscale an uploaded stamp image and optionally knock out its paper
 * background: pixels fade to transparent as they approach white, so a red or
 * black seal photographed on white paper overlays the document cleanly.
 */
function processStampImage(img: HTMLImageElement, removeWhite: boolean): string {
  const scale = Math.min(1, MAX_STAMP_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0, w, h);
  if (removeWhite) {
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      // Whiteness = the dimmest channel: high for paper, low for red/black ink.
      const whiteness = Math.min(px[i], px[i + 1], px[i + 2]);
      const alpha =
        whiteness >= 235
          ? 0
          : whiteness <= 150
            ? 255
            : Math.round((255 * (235 - whiteness)) / 85);
      px[i + 3] = Math.min(px[i + 3], alpha);
    }
    ctx.putImageData(data, 0, 0);
  }
  return canvas.toDataURL("image/png");
}

/**
 * A signing pad: draw with a pointer (mouse / finger / stylus) producing a
 * transparent PNG, or type a name rendered in a script face. Reassuring, quick,
 * and forgiving — with a Clear affordance and a disabled Adopt until there's
 * something to adopt.
 */
export function SignaturePad({
  open,
  onClose,
  label,
  suggested = "",
  onAdopt,
}: SignaturePadProps) {
  const { t } = useI18n();
  // The parent remounts this component per field (via `key`), so plain initial
  // state is a clean slate every time the pad opens.
  const [mode, setMode] = useState<Mode>("draw");
  const [typed, setTyped] = useState(suggested);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [stampImg, setStampImg] = useState<HTMLImageElement | null>(null);
  const [stampRemoveBg, setStampRemoveBg] = useState(true);
  const [stampError, setStampError] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const stampPreview =
    stampImg !== null ? processStampImage(stampImg, stampRemoveBg) : null;

  const onStampFile = (file: File | undefined) => {
    if (!file) return;
    setStampError(false);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => setStampImg(img);
      img.onerror = () => setStampError(true);
      img.src = String(reader.result);
    };
    reader.onerror = () => setStampError(true);
    reader.readAsDataURL(file);
  };

  // Size the canvas backing store to its box (crisp on HiDPI) when shown.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = INK;
  }, []);

  useEffect(() => {
    if (!open || mode !== "draw") return;
    // Defer until the dialog panel has laid out.
    const raf = requestAnimationFrame(setupCanvas);
    return () => cancelAnimationFrame(raf);
  }, [open, mode, setupCanvas]);

  const pointFromEvent = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointFromEvent(e);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !last.current) return;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasDrawing) setHasDrawing(true);
  };

  const endStroke = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  };

  const canAdopt =
    mode === "draw"
      ? hasDrawing
      : mode === "stamp"
        ? stampPreview !== null
        : typed.trim().length > 0;

  const adopt = () => {
    if (mode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawing) return;
      onAdopt({ kind: "drawn", imageData: canvas.toDataURL("image/png") });
    } else if (mode === "stamp") {
      if (!stampPreview) return;
      onAdopt({ kind: "stamp", imageData: stampPreview });
    } else {
      const value = typed.trim();
      if (!value) return;
      onAdopt({ kind: "typed", value });
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`${t.signer.padTitlePrefix}${label.toLowerCase()}${t.signer.padTitleSuffix}`}
      description={t.signer.padDescription}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button onClick={adopt} disabled={!canAdopt}>
            {t.signer.adoptPlace}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Mode toggle */}
        <div
          className="inline-flex rounded-xl border border-border bg-surface-2/60 p-1"
          role="tablist"
          aria-label={t.signer.inputMethodLabel}
        >
          {(
            [
              ["draw", t.signer.tabDraw],
              ["type", t.signer.tabType],
              ["stamp", t.signer.tabStamp],
            ] as const
          ).map(([value, text]) => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {text}
              </button>
            );
          })}
        </div>

        {mode === "draw" ? (
          <div className="space-y-2">
            <div className="relative overflow-hidden rounded-xl border border-border-strong bg-white">
              <canvas
                ref={canvasRef}
                style={{ width: "100%", height: CANVAS_HEIGHT, touchAction: "none" }}
                className="block cursor-crosshair"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endStroke}
                onPointerLeave={endStroke}
                onPointerCancel={endStroke}
              />
              {/* Baseline hint */}
              <div
                className="pointer-events-none absolute inset-x-8 bottom-9 border-b border-dashed border-slate-300"
                aria-hidden="true"
              />
              {!hasDrawing && (
                <span
                  className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400"
                  aria-hidden="true"
                >
                  {t.signer.signHere}
                </span>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={clear} disabled={!hasDrawing}>
                {t.signer.clear}
              </Button>
            </div>
          </div>
        ) : mode === "stamp" ? (
          <div className="space-y-3">
            {stampPreview ? (
              <div
                className="flex min-h-40 items-center justify-center rounded-xl border border-border-strong p-4"
                style={{
                  // Checkerboard so the knocked-out background reads as transparent.
                  backgroundImage:
                    "linear-gradient(45deg,#eef0f4 25%,transparent 25%,transparent 75%,#eef0f4 75%),linear-gradient(45deg,#eef0f4 25%,#ffffff 25%,#ffffff 75%,#eef0f4 75%)",
                  backgroundSize: "16px 16px",
                  backgroundPosition: "0 0,8px 8px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stampPreview}
                  alt=""
                  className="max-h-36 max-w-full object-contain"
                />
              </div>
            ) : (
              <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-2/40 px-4 text-center hover:bg-surface-2/70">
                <span className="text-sm font-medium text-foreground">
                  {t.signer.stampChoose}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.signer.stampHint}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => onStampFile(e.target.files?.[0])}
                />
              </label>
            )}
            {stampError && (
              <p className="text-xs text-tone-danger" role="alert">
                {t.signer.stampLoadError}
              </p>
            )}
            {stampPreview && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={stampRemoveBg}
                    onChange={(e) => setStampRemoveBg(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  {t.signer.stampRemoveBg}
                </label>
                <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                  {t.signer.stampReplace}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => onStampFile(e.target.files?.[0])}
                  />
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t.signer.typeFullName}
              className="h-11 w-full rounded-lg border border-input-border bg-input px-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"
            />
            <div className="flex min-h-24 items-center justify-center rounded-xl border border-border-strong bg-white px-4">
              <span
                className="text-slate-900"
                style={{
                  fontFamily:
                    '"Segoe Script","Snell Roundhand","Brush Script MT",cursive',
                  fontSize: 40,
                  lineHeight: 1.1,
                }}
              >
                {typed.trim() || t.signer.yourNamePreview}
              </span>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t.signer.consentPrefix}
          {label.toLowerCase()}
          {t.signer.consentSuffix}
        </p>
      </div>
    </Dialog>
  );
}
