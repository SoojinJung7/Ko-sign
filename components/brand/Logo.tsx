import { cn } from "@/lib/ui";

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Show only the mark (no wordmark). */
  markOnly?: boolean;
  /** Overall height in px of the mark; the wordmark scales to match. */
  size?: number;
}

/**
 * Ko-sign brand lockup: an inline SVG mark (a signing pen-nib inside a rounded
 * badge) plus the wordmark. Fully themeable — the mark uses a violet→indigo
 * gradient and the wordmark inherits `currentColor`, so it reads correctly on
 * any surface in both light and dark themes.
 */
export function Logo({
  markOnly = false,
  size = 28,
  className,
  ...props
}: LogoProps) {
  // Stable gradient ids. The gradient definitions are identical for every
  // Logo, so sharing ids is safe (and avoids SSR/client hydration mismatches
  // that a random id would introduce).
  const gid = "ks-mark-fill";
  const gid2 = "ks-mark-stroke";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        role="img"
        aria-label={markOnly ? "Ko-sign" : undefined}
        aria-hidden={markOnly ? undefined : true}
        className="shrink-0"
      >
        <defs>
          <linearGradient id={gid} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
            <stop stopColor="#818cf8" />
            <stop offset="0.5" stopColor="#6366f1" />
            <stop offset="1" stopColor="#4338ca" />
          </linearGradient>
          <linearGradient id={gid2} x1="9" y1="8" x2="23" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        {/* Rounded badge */}
        <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${gid})`} />
        <rect
          x="1"
          y="1"
          width="30"
          height="30"
          rx="9"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.14"
        />
        {/* Signing stroke — a flourish that ends in a pen nib */}
        <path
          d="M8.5 20.5c2.2-6.4 4.2-9.6 5.6-9.6 1.3 0 1 4.2 2.1 4.2 1 0 1.7-2.4 3-2.4 1.6 0 1.3 6 3.2 6 0.9 0 1.7-0.7 2.6-1.9"
          stroke={`url(#${gid2})`}
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Baseline */}
        <path
          d="M8.5 24.4h15"
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {!markOnly && (
        <span className="text-[1.05em] leading-none">
          Ko<span className="text-primary">-</span>sign
        </span>
      )}
    </span>
  );
}
