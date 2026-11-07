"use client";

import { Menu, Wifi, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "@/components/shell/ThemeToggle";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

export function Logo({ className }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold tracking-tight text-ink", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-primary-600 text-white shadow-sm">
        <Wifi className="size-4.5" />
      </span>
      {site.name}
    </Link>
  );
}

/** Sticky marketing header with a mobile menu and the theme switch. */
export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const active = (href) => !href.includes("#") && pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden flex-1 items-center gap-1 text-sm md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("rounded-md px-3 py-2 text-muted transition hover:bg-subtle hover:text-ink", active(n.href) && "text-ink")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <ThemeToggle />
          <Link href="/login" className="hidden rounded-md px-3 py-2 text-sm font-medium text-ink transition hover:bg-subtle sm:block">
            Log in
          </Link>
          <Link href="/signup" className="hidden rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-500 sm:block">
            Start free trial
          </Link>
          <button type="button" onClick={() => setOpen((o) => !o)} className="cursor-pointer rounded-lg p-2 text-muted hover:bg-subtle hover:text-ink md:hidden" aria-label="Menu" aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="animate-fade-in border-t border-line bg-surface px-4 pb-4 md:hidden">
          <nav className="flex flex-col py-2">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-ink hover:bg-subtle">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/login" className="rounded-lg border border-line py-2.5 text-center text-sm font-medium text-ink">
              Log in
            </Link>
            <Link href="/signup" className="rounded-lg bg-primary-600 py-2.5 text-center text-sm font-semibold text-white">
              Free trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
