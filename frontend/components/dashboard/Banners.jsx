"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const TONE = {
  info: "bg-blue-50 text-blue-900 border-blue-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  success: "bg-emerald-50 text-emerald-900 border-emerald-200",
};
const STORAGE_KEY = "dismissed-announcements";

/** Platform announcements; dismissed ones stay hidden in this browser. */
export function AnnouncementBanners() {
  const { data } = useApi("announcements", "/announcements", undefined, { staleTime: 5 * 60_000 });
  const [dismissed, setDismissed] = useState([]);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from localStorage after mount
      setDismissed(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
    } catch {
      setDismissed([]);
    }
  }, []);
  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(-50)));
  };

  const items = (data?.data ?? []).filter((a) => !dismissed.includes(a._id));
  if (!items.length) return null;
  return items.map((a) => (
    <div key={a._id} className={`flex items-start gap-3 border-b px-6 py-2 text-sm ${TONE[a.type] ?? TONE.info}`}>
      <div className="flex-1">
        <strong>{a.title}</strong>
        {a.body && <span className="ml-2">{a.body}</span>}
      </div>
      <button type="button" className="cursor-pointer text-lg leading-none opacity-60 hover:opacity-100" onClick={() => dismiss(a._id)} aria-label="Dismiss">
        ×
      </button>
    </div>
  ));
}

/** Loud reminder that a platform admin is acting as this ISP's owner. */
export function ImpersonationBanner() {
  const { impersonation, company, logout } = useAuth();
  if (!impersonation) return null;
  return (
    <div className="flex items-center justify-between bg-red-600 px-6 py-2 text-sm font-medium text-white">
      <span>
        🔐 {impersonation.by} is viewing <strong>{company?.name}</strong> as the owner. Every action is logged.
      </span>
      <button type="button" onClick={logout} className="cursor-pointer rounded border border-white/60 px-3 py-0.5 hover:bg-white/10">
        Exit
      </button>
    </div>
  );
}
