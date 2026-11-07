import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary-600 text-white shadow-sm hover:bg-primary-700 active:bg-primary-800",
        secondary: "border border-line bg-surface text-ink shadow-sm hover:bg-subtle",
        outline: "border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100",
        danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
        success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
        ghost: "text-muted hover:bg-subtle hover:text-ink",
        link: "h-auto px-0 text-primary-700 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

/** <Button variant="secondary" size="sm" loading={m.isPending}>Save</Button> */
export default function Button({ children, variant, size, type = "button", loading = false, disabled, className, ...props }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
