import { forwardRef } from "react";
import { cn } from "@/lib/ui";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, rows = 4, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground shadow-sm",
          "border-input-border placeholder:text-muted-foreground",
          "transition-[color,box-shadow,border-color] outline-none resize-y min-h-20",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "aria-[invalid]:border-tone-danger aria-[invalid]:focus-visible:ring-tone-danger/30",
          className,
        )}
        {...props}
      />
    );
  },
);
