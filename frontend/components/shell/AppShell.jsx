"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Shared application shell for the ISP dashboard and the platform admin:
 *  - lg+: fixed sidebar on the left, sticky top bar, scrolling main area
 *  - phones/tablets: sidebar becomes a slide-in drawer opened from the top bar
 *
 * nav: [{ title?: "Billing", items: [{ title, href?, icon, children?: [{ title, href }] }] }]
 */
export default function AppShell({ brand, nav, topbar, banners, footer, children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // close the drawer after navigating
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route change closes the mobile drawer
    setOpen(false);
  }, [pathname]);

  const sidebar = <SidebarContent brand={brand} nav={nav} footer={footer} pathname={pathname} />;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-canvas print:block print:h-auto print:overflow-visible">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:flex print:hidden">{sidebar}</aside>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/50 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] animate-slide-in-left bg-surface shadow-[var(--shadow-pop)] outline-none lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">Main menu</Dialog.Description>
            {sidebar}
            <Dialog.Close className="absolute right-3 top-3.5 cursor-pointer rounded-md p-1.5 text-muted hover:bg-subtle" aria-label="Close menu">
              <X className="size-4" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="print:hidden">{banners}</div>
        <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6 print:hidden">
          <button type="button" onClick={() => setOpen(true)} className="-ml-1 cursor-pointer rounded-md p-2 text-muted hover:bg-subtle lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          {topbar}
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  );
}

const isActive = (pathname, href, exact) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

function SidebarContent({ brand, nav, footer, pathname }) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2.5 border-b border-line px-4">{brand}</div>
      <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {nav.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title && <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{section.title}</p>}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem key={item.title} item={item} pathname={pathname} />
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
    </div>
  );
}

const itemClass = (active) =>
  cn(
    "group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
    active ? "bg-primary-50 text-primary-700" : "text-zinc-600 hover:bg-subtle hover:text-ink",
  );

function NavItem({ item, pathname }) {
  const Icon = item.icon;
  const childActive = item.children?.some((c) => isActive(pathname, c.href, c.exact));
  const [open, setOpen] = useState(Boolean(childActive));
  const icon = Icon && <Icon className="size-4 shrink-0 opacity-80" />;

  if (!item.children?.length) {
    const active = isActive(pathname, item.href, item.exact);
    return (
      <li>
        <Link href={item.href} className={itemClass(active)} aria-current={active ? "page" : undefined}>
          {icon}
          <span className="truncate">{item.title}</span>
          {item.badge}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} className={itemClass(false)} aria-expanded={open}>
        {icon}
        <span className="truncate">{item.title}</span>
        <ChevronDown className={cn("ml-auto size-4 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-0.5 space-y-0.5 border-l border-line pl-3 ml-[1.15rem]">
          {item.children.map((c) => {
            const active = isActive(pathname, c.href, c.exact);
            return (
              <li key={c.href + c.title}>
                <Link href={c.href} aria-current={active ? "page" : undefined} className={cn("block truncate rounded-md px-2.5 py-1.5 text-sm transition-colors", active ? "font-medium text-primary-700" : "text-zinc-500 hover:bg-subtle hover:text-ink")}>
                  {c.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
