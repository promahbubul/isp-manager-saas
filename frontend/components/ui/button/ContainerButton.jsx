import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** Full-width primary submit button used on the auth screens. */
const ContainerButton = ({ title, children, onClick, type = "submit", loading = false, disabled, className }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled || loading}
    className={cn(
      "inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary-600 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:bg-primary-800 dark:hover:bg-primary-500 dark:active:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
  >
    {loading && <Loader2 className="size-4 animate-spin" />}
    {children ?? title}
  </button>
);

export default ContainerButton;
