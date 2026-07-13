import { forwardRef } from "react";
import { cn } from "@/lib/ui";
import { Spinner } from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Icon rendered before the label. */
  leadingIcon?: React.ReactNode;
  /** Icon rendered after the label. */
  trailingIcon?: React.ReactNode;
  /** Stretch to fill the container width. */
  fullWidth?: boolean;
}

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium leading-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 active:translate-y-px";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
  secondary:
    "border border-input-border bg-surface text-foreground shadow-sm hover:bg-surface-2",
  ghost:
    "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[0.9375rem]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      leadingIcon,
      trailingIcon,
      fullWidth = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled ?? loading}
        aria-busy={loading || undefined}
        className={cn(
          base,
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading && (
          <Spinner
            className="absolute"
            size={size === "sm" ? 14 : 16}
            aria-hidden
          />
        )}
        <span
          className={cn(
            "inline-flex items-center gap-2",
            loading && "invisible",
          )}
        >
          {leadingIcon && (
            <span className="-ml-0.5 inline-flex shrink-0" aria-hidden>
              {leadingIcon}
            </span>
          )}
          {children}
          {trailingIcon && (
            <span className="-mr-0.5 inline-flex shrink-0" aria-hidden>
              {trailingIcon}
            </span>
          )}
        </span>
      </button>
    );
  },
);
