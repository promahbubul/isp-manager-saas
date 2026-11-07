"use client";

import * as Popover from "@radix-ui/react-popover";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data } = useApi("notifications", "/notifications", undefined, { refetchInterval: 60_000 });
  const read = useApiMutation((id) => api.patch(`/notifications/${id}/read`), { invalidate: ["notifications"], successToast: false });
  const readAll = useApiMutation(() => api.patch("/notifications/read-all"), { invalidate: ["notifications"], successToast: false });

  const items = data?.data?.items ?? [];
  const unread = data?.data?.unread ?? 0;

  const openItem = (n) => {
    if (!n.isRead) read.mutate(n._id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="relative cursor-pointer rounded-lg p-2 text-muted outline-none transition hover:bg-subtle hover:text-ink data-[state=open]:bg-subtle" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} className="z-50 w-[min(22rem,calc(100vw-1.5rem))] animate-fade-in overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)] outline-none">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button type="button" className="flex cursor-pointer items-center gap-1 text-xs font-medium text-primary-700 hover:underline" onClick={() => readAll.mutate()}>
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="scroll-thin max-h-[min(24rem,70dvh)] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">You are all caught up.</p>}
            {items.map((n) => (
              <button
                key={n._id}
                type="button"
                onClick={() => openItem(n)}
                className={cn("flex w-full cursor-pointer gap-3 border-b border-line/70 px-4 py-3 text-left transition last:border-0 hover:bg-subtle", !n.isRead && "bg-primary-50/40")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-primary-500")} />
                <span className="min-w-0">
                  <span className={cn("block text-sm", n.isRead ? "text-zinc-600" : "font-medium text-ink")}>{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-xs text-zinc-400">{formatDateTime(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
