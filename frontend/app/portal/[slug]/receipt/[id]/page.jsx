"use client";

import { ArrowLeft, CheckCircle2, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, ErrorBox, Loading } from "@/components/ui";
import { formatDate, formatDateTime, taka, methodLabel } from "@/lib/format";
import { usePortal } from "@/lib/portalHooks";

/** Money receipt the customer can print or save as PDF (browser → Save as PDF). */
export default function PortalReceiptPage() {
  const { slug, id } = useParams();
  const { data, isLoading, error } = usePortal(slug, ["receipt", id], `/payments/${id}/receipt`);
  if (isLoading) return <Loading />;
  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorBox error={error} />
      </div>
    );
  }
  const r = data.data;
  const rows = [
    ["Customer", `${r.customer?.name ?? "—"} (${r.customer?.customerId ?? "—"})`],
    ["Username", r.customer?.pppoe?.username ?? "—"],
    ["For", r.type === "recharge" ? `${r.months} month(s) internet` : r.type === "connection_fee" ? "Connection fee" : (r.note ?? "Other")],
    ["Bill", taka(r.billAmount)],
    ...(r.vat ? [["of which VAT", taka(r.vat)]] : []),
    ["Method", `${methodLabel(r.method)}${r.trxId ? ` · ${r.trxId}` : ""}`],
    ...(r.newExpiry && r.type === "recharge" ? [["Valid until", formatDate(r.newExpiry)]] : []),
    ["Due after", taka(r.dueAfter)],
  ];

  return (
    <div className="min-h-dvh bg-canvas px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link href={`/portal/${slug}/account`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> My account
          </Link>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer /> Print / Save PDF
          </Button>
        </div>

        <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] print:rounded-none print:border-0 print:shadow-none">
          <header className="border-b border-dashed border-line px-6 pb-5 pt-6 text-center">
            <p className="text-lg font-semibold text-ink">{r.company?.name}</p>
            <p className="mt-0.5 text-xs text-muted">{[r.company?.address, r.company?.phone].filter(Boolean).join(" · ")}</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Money receipt</p>
          </header>

          <div className="px-6 py-6 text-center">
            <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-6" />
            </span>
            <p className="text-sm text-muted">Amount paid</p>
            <p className="tabular mt-1 text-4xl font-semibold tracking-tight text-ink">{taka(r.amount)}</p>
            <p className="mt-2 text-xs text-muted">
              {r.receiptNo} · {formatDateTime(r.createdAt)}
            </p>
          </div>

          <dl className="mx-6 divide-y divide-line border-t border-line text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-muted">{k}</dt>
                <dd className="text-right font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          <footer className="mt-4 border-t border-dashed border-line px-6 py-4 text-center text-xs text-muted">Computer-generated receipt — no signature needed.</footer>
        </article>
      </div>
    </div>
  );
}
