import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names; later Tailwind classes win (cn("px-2", props.className)). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
