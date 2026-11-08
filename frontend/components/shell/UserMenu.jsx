"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";

/** Avatar + name button with a dropdown (links + log out). */
export default function UserMenu({ name, subtitle, image, links = [], onLogout, warning, compact = false }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Account menu"
        className="flex cursor-pointer items-center gap-2 rounded-lg p-1 pr-2 outline-none transition hover:bg-subtle data-[state=open]:bg-subtle"
      >
        <Avatar name={name} src={image} />
        <span className={compact ? "hidden" : "hidden text-left leading-tight md:block"}>
          <span className="block max-w-40 truncate text-sm font-medium text-ink">{name}</span>
          <span className="block max-w-40 truncate text-xs capitalize text-muted">{subtitle}</span>
        </span>
        {warning}
        <ChevronDown className={compact ? "hidden" : "hidden size-4 text-muted md:block"} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 min-w-52 animate-fade-in rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
          <div className={compact ? "border-b border-line px-2.5 pb-2.5 pt-2 mb-1" : "px-2.5 py-2 md:hidden"}>
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            <p className="truncate text-xs capitalize text-muted">{subtitle}</p>
          </div>
          {links.map((l) => (
            <Menu.Item key={l.href} asChild>
              <Link href={l.href} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-subtle">
                {l.icon && <l.icon className="size-4 text-muted" />}
                {l.title}
              </Link>
            </Menu.Item>
          ))}
          {links.length > 0 && <Menu.Separator className="my-1 h-px bg-line" />}
          <Menu.Item onSelect={onLogout} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-rose-600 outline-none data-[highlighted]:bg-rose-50">
            <LogOut className="size-4" /> Log out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
