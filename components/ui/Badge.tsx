import { forwardRef } from "react";
import { cn } from "@/lib/ui";
import type { BadgeTone } from "@/lib/types";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: "sm" | "md";
  /** Renders a small leading status dot in the tone color. */
  dot?: boolean;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    "bg-tone-neutral-soft text-tone-neutral border-tone-neutral-line",
  info: "bg-tone-info-soft text-tone-info border-tone-info-line",
  success:
    "bg-tone-success-soft text-tone-success border-tone-success-line",
  warning:
    "bg-tone-warning-soft text-tone-warning border-tone-warning-line",
  danger:
    "bg-tone-danger-soft text-tone-danger border-tone-danger-line",
  brand: "bg-tone-brand-soft text-tone-brand border-tone-brand-line",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone = "neutral", size = "md", dot = false, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium leading-none",
        size === "sm"
          ? "px-2 py-0.5 text-[0.6875rem]"
          : "px-2.5 py-1 text-xs",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current opacity-80"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
});
