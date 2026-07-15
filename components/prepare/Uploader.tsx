"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/ui";

const MAX_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Uploader() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = useCallback((next: File | null) => {
    setError(null);
    if (!next) return;
    if (next.type !== "application/pdf" && !next.name.toLowerCase().endsWith(".pdf")) {
      setError(t.prepare.errorPdfOnly);
      return;
    }
    if (next.size === 0) {
      setError(t.prepare.errorEmptyFile);
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(t.prepare.errorTooLarge);
      return;
    }
    setFile(next);
  }, [t]);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer.files?.[0];
      if (dropped) chooseFile(dropped);
    },
    [chooseFile],
  );

  const upload = useCallback(async () => {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; id?: string; error?: string }
        | null;
      if (!res.ok || !data?.ok || !data.id) {
        throw new Error(data?.error ?? t.prepare.uploadFailedRetry);
      }
      router.push(`/documents/${data.id}/prepare`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.prepare.uploadFailed);
      setUploading(false);
    }
  }, [file, uploading, router, t]);

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <Alert variant="error" title={t.prepare.uploadErrorTitle}>
          {error}
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          aria-label={t.prepare.dropzoneAria}
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !uploading) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-4 px-6 py-14 text-center outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring",
            dragging
              ? "bg-brand-50 dark:bg-brand-500/10"
              : "bg-surface hover:bg-surface-2",
            uploading && "pointer-events-none opacity-70",
          )}
        >
          <span
            className={cn(
              "inline-flex size-14 items-center justify-center rounded-2xl border transition-colors",
              dragging
                ? "border-brand-300 bg-brand-100 text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-200"
                : "border-border bg-surface-2 text-brand-500 dark:text-brand-300",
            )}
            aria-hidden="true"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4" />
              <path d="m7 9 5-5 5 5" />
              <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
            </svg>
          </span>

          <div>
            <p className="text-sm font-medium text-foreground">
              {dragging ? t.prepare.dropToUpload : t.prepare.dragDrop}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.prepare.orText}{" "}
              <span className="font-medium text-brand-600 dark:text-brand-300">
                {t.prepare.browseFiles}
              </span>{" "}
              {t.prepare.sizeLimit}
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {file && (
          <div className="flex items-center gap-3 border-t border-border bg-surface-2/60 px-5 py-4 sm:px-6">
            <span
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-tone-danger"
              aria-hidden="true"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              >
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
                <path d="M14 3v5h5" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </p>
            </div>
            {!uploading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                {t.prepare.remove}
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-end gap-3">
        {uploading && (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size={16} /> {t.prepare.uploading}
          </span>
        )}
        <Button
          onClick={upload}
          disabled={!file || uploading}
          loading={uploading}
          size="lg"
        >
          {t.prepare.continueToPrepare}
        </Button>
      </div>
    </div>
  );
}
