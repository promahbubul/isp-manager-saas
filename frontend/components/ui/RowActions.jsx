"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * "⋯" menu at the end of a table row.
 *   <RowActions items={[
 *     { label: "View", icon: Eye, href: `/dashboard/x/${id}` },
 *     { label: "Edit", icon: Pencil, onClick: () => setEditing(row) },
 *     { label: "Delete", icon: Trash2, danger: true, onClick: () => ... },
 *   ]} />
 * Items with `hidden: true` are skipped (e.g. no permission). Clicks never trigger the row's onRowClick.
 */
export function RowActions({ items, label = "Actions" }) {
  const list = items.filter((i) => i && !i.hidden);
  if (!list.length) return null;
  const itemCls = (danger, disabled) =>
    cn(
      "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-subtle",
      danger ? "text-rose-600" : "text-ink",
      disabled && "pointer-events-none opacity-40",
    );
  return (
    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <Menu.Root modal={false}>
        <Menu.Trigger className="grid size-8 cursor-pointer place-items-center rounded-md text-muted outline-none transition hover:bg-subtle hover:text-ink data-[state=open]:bg-subtle" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={4} className="z-50 min-w-40 animate-fade-in rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
            {list.map((i, n) => {
              const body = (
                <>
                  {i.icon && <i.icon className={cn("size-4", i.danger ? "text-rose-500" : "text-muted")} />}
                  {i.label}
                </>
              );
              return (
                <div key={i.label}>
                  {i.separator && n > 0 && <Menu.Separator className="my-1 h-px bg-line" />}
                  {i.href ? (
                    <Menu.Item asChild disabled={i.disabled}>
                      <Link href={i.href} className={itemCls(i.danger, i.disabled)}>
                        {body}
                      </Link>
                    </Menu.Item>
                  ) : (
                    <Menu.Item disabled={i.disabled} onSelect={() => i.onClick?.()} className={itemCls(i.danger, i.disabled)}>
                      {body}
                    </Menu.Item>
                  )}
                </div>
              );
            })}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
