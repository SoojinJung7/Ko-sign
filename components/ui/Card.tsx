import { forwardRef } from "react";
import { cn } from "@/lib/ui";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover elevation + subtle border emphasis (for interactive cards). */
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-border bg-card text-card-foreground shadow-sm",
        interactive &&
          "transition-[box-shadow,border-color,transform] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1.5 p-5 sm:p-6", className)}
      {...props}
    />
  );
});

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn(
        "text-base font-semibold leading-tight tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
});

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});

export const CardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)}
      {...props}
    />
  );
});

export const CardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-3 border-t border-border p-5 sm:p-6",
        className,
      )}
      {...props}
    />
  );
});
