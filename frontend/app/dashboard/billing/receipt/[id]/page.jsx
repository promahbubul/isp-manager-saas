"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import RefundModal from "@/components/payment/RefundModal";
import { Button, ErrorBox, Loading } from "@/components/ui";
import { formatDate, formatDateTime, methodLabel, taka } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

/** Printable money receipt — use the browser's Print → Save as PDF. */
export default function ReceiptPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useApi(["payment", id], `/payments/${id}`);
  const { can } = useAuth();
  const [refunding, setRefunding] = useState(false);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const p = data.data;
  const c = p.customer ?? {};
  const rows = [
    ["Customer", `${c.name} (${c.customerId})`],
    ["Mobile", c.phone],
    ["PPPoE username", c.pppoe?.username],
    ["Months", p.months],
    ["Bill", taka(p.billAmount)],
    ...(p.discount ? [["Discount", taka(p.discount)]] : []),
    ["Previous due", taka(p.previousDue)],
    ["Paid", taka(p.amount)],
    ["Due after payment", taka(p.dueAfter)],
    ["Method", `${methodLabel(p.method)}${p.trxId ? ` · ${p.trxId}` : ""}`],
    ["Valid until", formatDate(p.newExpiry)],
    ["Received by", p.receivedBy?.name],
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
        <Link href={`/dashboard/customers/${c._id}`}>
          <Button variant="secondary">Back to customer</Button>
        </Link>
        <Link href="/dashboard/billing/recharge">
          <Button variant="secondary">New recharge</Button>
        </Link>
        {can("payment.refund") && p.status === "success" && (
          <Button variant="danger" className="ml-auto" onClick={() => setRefunding(true)}>
            Refund
          </Button>
        )}
      </div>
      {p.status === "refunded" && (
        <div className="mx-auto mb-4 max-w-md rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 print:hidden">
          Refunded on {formatDateTime(p.refundedAt)}{p.refundReason ? ` — ${p.refundReason}` : ""}
        </div>
      )}
      {refunding && <RefundModal payment={p} onClose={() => setRefunding(false)} />}

      <div id="receipt" className="mx-auto max-w-md rounded-lg border border-zinc-300 bg-surface p-6 text-zinc-900 print:border-0">
        <div className="text-center">
          <h2 className="text-xl font-bold">{p.company?.name}</h2>
          {p.company?.address && <p className="text-sm">{p.company.address}</p>}
          <p className="text-sm">{p.company?.phone}</p>
          {p.receiptText?.header && <p className="mt-1 text-sm">{p.receiptText.header}</p>}
          <p className="mt-3 inline-block rounded border border-zinc-900 px-3 py-0.5 text-sm font-semibold">{p.status === "refunded" ? "REFUNDED" : "MONEY RECEIPT"}</p>
        </div>
        <div className="mt-4 flex justify-between text-sm">
          <span>No: {p.receiptNo}</span>
          <span>{formatDateTime(p.createdAt)}</span>
        </div>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b border-dashed border-zinc-200">
                <td className="py-1.5 text-zinc-600">{k}</td>
                <td className="py-1.5 text-right font-medium">{v ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-center text-lg font-bold">Paid: {taka(p.amount)}</p>
        {p.receiptText?.footer && <p className="mt-3 text-center text-xs text-zinc-600">{p.receiptText.footer}</p>}
      </div>
    </div>
  );
}
