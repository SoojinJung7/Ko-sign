import { cn } from "@/lib/ui";

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Icon shown in the rounded badge. Falls back to a document glyph. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Call-to-action node (e.g. a <Button/>). */
  action?: React.ReactNode;
}

const DefaultIcon = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    <path
      d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"
      strokeLinejoin="round"
    />
    <path d="M14 3v5h5" strokeLinejoin="round" />
    <path d="M9 13h6M9 17h4" strokeLinecap="round" />
  </svg>
);

export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-14 text-center",
        className,
      )}
      {...props}
    >
      <span
        className="mb-4 inline-flex size-12 items-center justify-center rounded-xl border border-border bg-surface-2 text-brand-500 dark:text-brand-300"
        aria-hidden="true"
      >
        {icon ?? DefaultIcon}
      </span>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
