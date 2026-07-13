import { forwardRef } from "react";
import { cn } from "@/lib/ui";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional element rendered inside the field on the left (e.g. an icon). */
  leadingIcon?: React.ReactNode;
  /** Marks the field invalid and applies danger styling. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { className, type = "text", leadingIcon, invalid, ...props },
    ref,
  ) {
    const field = (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-10 w-full rounded-lg border bg-input text-sm text-foreground shadow-sm",
          "border-input-border placeholder:text-muted-foreground",
          "transition-[color,box-shadow,border-color] outline-none",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "aria-[invalid]:border-tone-danger aria-[invalid]:focus-visible:ring-tone-danger/30",
          leadingIcon ? "pl-9 pr-3" : "px-3",
          className,
        )}
        {...props}
      />
    );

    if (!leadingIcon) return field;

    return (
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4"
          aria-hidden="true"
        >
          {leadingIcon}
        </span>
        {field}
      </div>
    );
  },
);
