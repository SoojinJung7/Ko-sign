"use client";

import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/ui";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Persist the choice for a year. Kept at module scope: writing to `document`
 * from inside the component reads as mutating an outer value to the compiler's
 * immutability rule, even though a cookie write in an event handler is exactly
 * where this belongs.
 */
function persistLocale(locale: Locale): void {
  document.cookie = `locale=${locale};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
}

export interface LanguageToggleProps {
  /**
   * `fixed` (default) renders the floating pill at the bottom-right on every
   * page. `inline` renders the same control with no positioning, for placement
   * inside a header or nav.
   */
  variant?: "fixed" | "inline";
}

/**
 * Language switcher (KO / EN). Persists the choice in a `locale` cookie and
 * refreshes RSC to re-render the tree with the newly selected dictionary.
 *
 * The landing page (`/`) renders its own `inline` toggle in the header, so the
 * floating `fixed` pill hides itself there to avoid showing the control twice.
 */
export function LanguageToggle({ variant = "fixed" }: LanguageToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, t } = useI18n();

  if (variant === "fixed" && pathname === "/") return null;

  function setLocale(l: Locale) {
    if (l === locale) return;
    persistLocale(l);
    router.refresh();
  }

  return (
    <div
      role="group"
      aria-label={t.toggle.label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5 text-xs shadow-sm",
        variant === "fixed" && "fixed bottom-4 right-4 z-50",
      )}
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(l)}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
              active
                ? "bg-surface-2 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l === "en" ? t.toggle.en : t.toggle.ko}
          </button>
        );
      })}
    </div>
  );
}
