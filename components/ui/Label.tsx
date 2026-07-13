import { forwardRef } from "react";
import { cn } from "@/lib/ui";

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Renders a subtle required marker after the text. */
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  function Label({ className, required, children, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 text-sm font-medium text-foreground",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="text-tone-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
    );
  },
);
