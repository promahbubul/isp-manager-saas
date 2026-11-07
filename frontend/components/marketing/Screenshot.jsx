import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * A real screenshot of the app in a simple browser frame.
 * Shows the light or dark capture to match the site theme.
 */
export function Screenshot({ light, dark, alt, url = "app.ispmanager.com.bd", priority = false, className, sizes = "(min-width: 1024px) 1100px, 100vw" }) {
  return (
    <figure className={cn("overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_60px_-24px_rgb(24_24_27/0.35)]", className)}>
      <div className="flex items-center gap-3 border-b border-line bg-subtle px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-zinc-300" />
          <span className="size-2.5 rounded-full bg-zinc-300" />
          <span className="size-2.5 rounded-full bg-zinc-300" />
        </div>
        <div className="mx-auto w-full max-w-xs truncate rounded-md bg-surface px-3 py-1 text-center text-xs text-muted">{url}</div>
        <div className="w-12" />
      </div>
      <Image src={light} alt={alt} priority={priority} sizes={sizes} className="block h-auto w-full dark:hidden" placeholder="blur" />
      <Image src={dark} alt="" aria-hidden priority={priority} sizes={sizes} className="hidden h-auto w-full dark:block" placeholder="blur" />
    </figure>
  );
}

/** Phone frame for the customer portal capture. */
export function PhoneShot({ light, dark, alt, className }) {
  return (
    <figure className={cn("mx-auto w-[260px] rounded-[2.2rem] border border-line bg-zinc-900 p-2.5 shadow-[0_30px_60px_-25px_rgb(24_24_27/0.5)] dark:bg-zinc-200", className)}>
      <div className="overflow-hidden rounded-[1.7rem]">
        <Image src={light} alt={alt} sizes="260px" className="block h-auto w-full dark:hidden" placeholder="blur" />
        <Image src={dark} alt="" aria-hidden sizes="260px" className="hidden h-auto w-full dark:block" placeholder="blur" />
      </div>
    </figure>
  );
}
