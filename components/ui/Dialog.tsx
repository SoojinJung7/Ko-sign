"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/ui";
import { useI18n } from "@/lib/i18n/provider";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer actions row (rendered with a top divider). */
  footer?: ReactNode;
  /** Max-width preset for the panel. */
  size?: "sm" | "md" | "lg";
  /** Close when the backdrop is clicked. Defaults to true. */
  closeOnBackdrop?: boolean;
  /** Hide the built-in close (×) button. */
  hideCloseButton?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  hideCloseButton = false,
  className,
}: DialogProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  // Lock body scroll + manage focus while open.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const labelledBy = title ? headingId : undefined;
  const describedBy = description ? descriptionId : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-4 sm:items-center"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm motion-safe:animate-[koFade_.15s_ease-out]"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full rounded-2xl border border-border bg-card text-card-foreground shadow-lg outline-none",
          "motion-safe:animate-[koPanel_.18s_cubic-bezier(.16,1,.3,1)]",
          sizeClasses[size],
          className,
        )}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-4 p-5 pb-0 sm:p-6 sm:pb-0">
            <div className="min-w-0">
              {title && (
                <h2
                  id={headingId}
                  className="text-lg font-semibold tracking-tight text-foreground"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={descriptionId}
                  className="mt-1 text-sm text-muted-foreground"
                >
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t.chrome.closeDialog}
                className="-mr-1.5 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
        )}

        {children && (
          <div className="p-5 pt-4 sm:p-6 sm:pt-4">{children}</div>
        )}

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-border p-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes koFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes koPanel {
          from { opacity: 0; transform: translateY(8px) scale(.98) }
          to { opacity: 1; transform: none }
        }
      `}</style>
    </div>,
    document.body,
  );
}
