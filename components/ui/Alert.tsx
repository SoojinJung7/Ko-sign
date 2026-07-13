import { cn } from "@/lib/ui";

export type AlertVariant = "info" | "success" | "warn" | "error";

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: AlertVariant;
  title?: React.ReactNode;
  /** Replace the default variant icon. Pass `null` to hide it. */
  icon?: React.ReactNode | null;
}

const variantClasses: Record<AlertVariant, string> = {
  info: "bg-tone-info-soft text-tone-info border-tone-info-line",
  success:
    "bg-tone-success-soft text-tone-success border-tone-success-line",
  warn: "bg-tone-warning-soft text-tone-warning border-tone-warning-line",
  error: "bg-tone-danger-soft text-tone-danger border-tone-danger-line",
};

const iconPaths: Record<AlertVariant, React.ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" strokeLinecap="round" />
      <path d="M12 8h.01" strokeLinecap="round" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  warn: (
    <>
      <path
        d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
        strokeLinejoin="round"
      />
      <path d="M12 9v4" strokeLinecap="round" />
      <path d="M12 17h.01" strokeLinecap="round" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" strokeLinecap="round" />
      <path d="M12 16h.01" strokeLinecap="round" />
    </>
  ),
};

const roleFor: Record<AlertVariant, "status" | "alert"> = {
  info: "status",
  success: "status",
  warn: "alert",
  error: "alert",
};

export function Alert({
  className,
  variant = "info",
  title,
  icon,
  children,
  ...props
}: AlertProps) {
  const showIcon = icon !== null;

  return (
    <div
      role={roleFor[variant]}
      className={cn(
        "flex gap-3 rounded-xl border p-3.5 text-sm",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {showIcon && (
        <span className="mt-px shrink-0" aria-hidden="true">
          {icon ?? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              {iconPaths[variant]}
            </svg>
          )}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && (
          <p className="font-semibold text-current">{title}</p>
        )}
        {children && (
          <div
            className={cn(
              "text-current/90",
              title && "mt-0.5",
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
