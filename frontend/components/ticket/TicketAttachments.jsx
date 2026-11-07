"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Card } from "@/components/ui";
import { api, getErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/** SLA status from dueBy (set by the server from Settings → SLA hours). */
export function SlaBadge({ ticket }) {
  const [now] = useState(() => Date.now()); // time of first render; good enough for an hours-level badge
  if (!ticket.dueBy) return null;
  const due = new Date(ticket.dueBy).getTime();
  const done = ticket.status === "solved" || ticket.status === "closed";
  const end = done && ticket.solvedAt ? new Date(ticket.solvedAt).getTime() : now;
  const late = end > due;
  if (done) return <Badge color={late ? "red" : "green"}>{late ? "solved late" : "within SLA"}</Badge>;
  const h = Math.round((due - now) / 3_600_000);
  return <Badge color={late ? "red" : h <= 2 ? "amber" : "slate"}>{late ? `SLA missed by ${-h} h` : `${h} h left`}</Badge>;
}

/** Photos/PDFs on a complaint; files are private so they are opened through the API. */
export default function TicketAttachments({ ticket, basePath = "/tickets", client = api, queryKey }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const files = ticket.attachments ?? [];

  const open = async (a) => {
    try {
      const r = await client.get(`${basePath}/${ticket._id}/attachments/${a.file}`, { responseType: "blob" });
      window.open(URL.createObjectURL(r.data), "_blank", "noopener");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await client.post(`${basePath}/${ticket._id}/attachments`, fd);
      toast.success("File attached");
      if (queryKey) qc.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Photos & files">
      {files.length === 0 ? (
        <p className="text-sm text-zinc-500">No files.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {files.map((a) => (
            <li key={a.file} className="flex items-center gap-2">
              <button type="button" className="cursor-pointer text-primary-700 hover:underline" onClick={() => open(a)}>
                {a.name}
              </button>
              <span className="text-xs text-zinc-500">
                {Math.round(a.size / 1024)} KB · {formatDateTime(a.at)}
                {a.fromCustomer ? " · from customer" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {ticket.status !== "closed" && (
        <label className={`mt-3 inline-block cursor-pointer rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 ${busy ? "opacity-60" : ""}`}>
          {busy ? "Uploading…" : "Attach photo or PDF (max 3 MB)"}
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      )}
    </Card>
  );
}
