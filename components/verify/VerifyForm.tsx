"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/ui";
import { useI18n } from "@/lib/i18n/provider";
import { Button, Input, Label, Alert } from "@/components/ui";
import { VerifyResult } from "./VerifyResult";
import type { VerifyResponse } from "./types";

type Mode = "file" | "id";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export function VerifyForm() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("file");
  const [documentId, setDocumentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setResult(null);
    setError(null);
  }

  function pickFile(next: File | null) {
    reset();
    if (next && next.type && next.type !== "application/pdf") {
      setError(t.verify.errorNotPdf);
      setFile(null);
      return;
    }
    if (next && next.size > MAX_BYTES) {
      setError(t.verify.errorTooLarge);
      setFile(null);
      return;
    }
    setFile(next);
  }

  async function submit() {
    reset();
    setLoading(true);
    try {
      let res: Response;
      if (mode === "file") {
        if (!file) {
          setError(t.verify.errorNoFile);
          setLoading(false);
          return;
        }
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/verify", { method: "POST", body: form });
      } else {
        if (!documentId.trim()) {
          setError(t.verify.errorNoId);
          setLoading(false);
          return;
        }
        res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: documentId.trim() }),
        });
      }

      const data = (await res.json()) as VerifyResponse;
      setResult(data);
    } catch {
      setError(t.verify.errorGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div
        className="inline-flex rounded-xl border border-border bg-surface-2/60 p-1"
        role="tablist"
        aria-label={t.verify.methodLabel}
      >
        {(
          [
            ["file", t.verify.tabFile],
            ["id", t.verify.documentId],
          ] as const
        ).map(([value, label]) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setMode(value);
                reset();
              }}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {mode === "file" ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              dragging
                ? "border-primary bg-tone-brand-soft"
                : "border-border-strong hover:border-primary hover:bg-surface-2/50",
            )}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="text-muted-foreground"
              aria-hidden="true"
            >
              <path
                d="M12 16V4m0 0L8 8m4-4 4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
                strokeLinecap="round"
              />
            </svg>
            {file ? (
              <span className="text-sm font-medium text-foreground">
                {file.name}
              </span>
            ) : (
              <>
                <span className="text-sm font-medium text-foreground">
                  {t.verify.dropPrompt}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.verify.dropHint}
                </span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="documentId">{t.verify.documentId}</Label>
          <Input
            id="documentId"
            value={documentId}
            onChange={(e) => {
              setDocumentId(e.target.value);
              reset();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="doc_XXXXXXXXXXXXXXXXXXXXX"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>
      )}

      {error && (
        <Alert variant="error" title={t.verify.alertTitle}>
          {error}
        </Alert>
      )}

      <Button
        onClick={submit}
        loading={loading}
        fullWidth
        size="lg"
        disabled={mode === "file" ? !file : !documentId.trim()}
      >
        {t.verify.submit}
      </Button>

      {result && <VerifyResult result={result} />}
    </div>
  );
}
