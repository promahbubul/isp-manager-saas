"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FiBell } from "react-icons/fi";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { data } = useApi("notifications", "/notifications", undefined, { refetchInterval: 60_000 });
  const read = useApiMutation((id) => api.patch(`/notifications/${id}/read`), { invalidate: ["notifications"], successToast: false });
  const readAll = useApiMutation(() => api.patch("/notifications/read-all"), { invalidate: ["notifications"], successToast: false });

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const items = data?.data?.items ?? [];
  const unread = data?.data?.unread ?? 0;

  const openItem = (n) => {
    if (!n.isRead) read.mutate(n._id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative cursor-pointer rounded-full p-2 text-slate-600 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <FiBell size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <span className="font-semibold">Notifications</span>
            {unread > 0 && (
              <button type="button" className="cursor-pointer text-xs text-purple-700 hover:underline" onClick={() => readAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="p-4 text-center text-sm text-slate-500">No notifications</p>}
            {items.map((n) => (
              <button
                key={n._id}
                type="button"
                onClick={() => openItem(n)}
                className={`block w-full cursor-pointer border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50 ${n.isRead ? "" : "bg-purple-50/60"}`}
              >
                <p className={`text-sm ${n.isRead ? "text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</p>
                {n.body && <p className="truncate text-xs text-slate-500">{n.body}</p>}
                <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
