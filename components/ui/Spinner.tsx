import { cn } from "@/lib/ui";

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Diameter in pixels. */
  size?: number;
  /** Accessible label; announced to screen readers. */
  label?: string;
}

/** Indeterminate loading spinner. Inherits `currentColor`. */
export function Spinner({
  size = 18,
  label = "Loading",
  className,
  style,
  ...props
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center justify-center", className)}
      style={style}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="animate-spin"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="3"
          className="opacity-20"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
