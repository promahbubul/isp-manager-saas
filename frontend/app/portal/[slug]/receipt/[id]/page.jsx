"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, ErrorBox, Loading } from "@/components/ui";
import { formatDate, formatDateTime, taka } from "@/lib/format";
import { usePortal } from "@/lib/portalHooks";

/** Money receipt the customer can print or save as PDF (browser → Save as PDF). */
export default function PortalReceiptPage() {
  const { slug, id } = useParams();
  const { data, isLoading, error } = usePortal(slug, ["receipt", id], `/payments/${id}/receipt`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const r = data.data;
  const rows = [
    ["Receipt no.", r.receiptNo],
    ["Date", formatDateTime(r.createdAt)],
    ["Customer", `${r.customer?.name} (${r.customer?.customerId})`],
    ["Username", r.customer?.pppoe?.username],
    ["For", r.type === "recharge" ? `${r.months} month(s) internet` : r.type === "connection_fee" ? "Connection fee" : (r.note ?? "Other")],
    ["Bill", taka(r.billAmount)],
    ...(r.vat ? [["of which VAT", taka(r.vat)]] : []),
    ["Paid", taka(r.amount)],
    ["Method", `${r.method}${r.trxId ? ` · ${r.trxId}` : ""}`],
    ...(r.newExpiry && r.type === "recharge" ? [["Valid until", formatDate(r.newExpiry)]] : []),
    ["Due after", taka(r.dueAfter)],
  ];
  return (
    <div className="mx-auto max-w-md p-6">
      <div className="mb-4 flex justify-between print:hidden">
        <Link href={`/portal/${slug}/account`} className="text-sm text-primary-700 hover:underline">
          ← My account
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>
      <div className="rounded-lg border border-zinc-300 bg-white p-6">
        <div className="text-center">
          <h1 className="text-xl font-extrabold">{r.company?.name}</h1>
          <p className="text-xs text-zinc-500">
            {r.company?.address}
            {r.company?.phone ? ` · ${r.company.phone}` : ""}
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide">Money receipt</p>
        </div>
        <dl className="mt-4 divide-y divide-zinc-100 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between py-1.5">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-center text-xs text-zinc-400">Computer-generated receipt</p>
      </div>
    </div>
  );
}
