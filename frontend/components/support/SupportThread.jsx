"use client";

import { formatDateTime } from "@/lib/format";

/** Chat-style thread. `mine` is the side of the current viewer ("isp" or "platform"). */
export default function SupportThread({ messages, mine }) {
  return (
    <ol className="space-y-3">
      {messages.map((m, i) => {
        const own = m.from === mine;
        return (
          <li key={i} className={`flex ${own ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-4 py-3 ${own ? "bg-primary-50 ring-1 ring-primary-200" : m.from === "platform" ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-zinc-50 ring-1 ring-zinc-200"}`}>
              <div className="mb-1 text-xs text-zinc-500">
                <strong className="text-zinc-700">{m.name}</strong> · {formatDateTime(m.at)}
              </div>
              <p className="whitespace-pre-wrap text-zinc-800">{m.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
