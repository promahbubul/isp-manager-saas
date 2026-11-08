"use client";

import { LayoutDashboard, Menu, UserRound, Wifi, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "@/components/shell/ThemeToggle";
import UserMenu from "@/components/shell/UserMenu";
import Avatar from "@/components/ui/Avatar";
import { useSiteSession } from "./useSiteSession";
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
  const session = useSiteSession();
  const signedIn = session.kind === "isp" || session.kind === "admin";
  const home = session.kind === "admin" ? { href: "/admin", label: "Admin panel" } : { href: "/dashboard", label: "Dashboard" };
  const menuLinks =
    session.kind === "admin"
      ? [
          { title: "Admin panel", href: "/admin", icon: LayoutDashboard },
          { title: "My account", href: "/admin/account", icon: UserRound },
        ]
      : [
          { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { title: "My profile", href: "/dashboard/profile", icon: UserRound },
        ];

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
          {signedIn ? (
            <>
              <Link href={home.href} className="hidden rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-500 sm:block">
                {home.label}
              </Link>
              <UserMenu compact name={session.name} subtitle={session.subtitle} image={session.avatar} links={menuLinks} onLogout={session.logout} />
            </>
          ) : (
            <div className={cn("hidden items-center gap-1.5 sm:flex", session.kind === "pending" && "invisible")}>
              <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-ink transition hover:bg-subtle">
                Log in
              </Link>
              <Link href="/signup" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-500">
                Start free trial
              </Link>
            </div>
          )}
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
          {signedIn ? (
            <div className="space-y-2 border-t border-line pt-3">
              <div className="flex items-center gap-3 px-1">
                <Avatar name={session.name} src={session.avatar} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{session.name}</p>
                  <p className="truncate text-xs text-muted">{session.subtitle}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link href={home.href} onClick={() => setOpen(false)} className="rounded-lg bg-primary-600 py-2.5 text-center text-sm font-semibold text-white">
                  {home.label}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    session.logout();
                  }}
                  className="cursor-pointer rounded-lg border border-line py-2.5 text-center text-sm font-medium text-ink"
                >
                  Log out
                </button>
              </div>
            </div>
          ) : (
            <div className={cn("grid grid-cols-2 gap-2", session.kind === "pending" && "invisible")}>
              <Link href="/login" className="rounded-lg border border-line py-2.5 text-center text-sm font-medium text-ink">
                Log in
              </Link>
              <Link href="/signup" className="rounded-lg bg-primary-600 py-2.5 text-center text-sm font-semibold text-white">
                Free trial
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
