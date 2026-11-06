"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, ErrorBox, Loading } from "@/components/ui";
import { formatDate, formatDateTime, taka } from "@/lib/format";
import { useApi } from "@/lib/hooks";

/** Printable money receipt — use the browser's Print → Save as PDF. */
export default function ReceiptPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useApi(["receipt", id], `/payments/${id}`);
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
    ["Method", `${p.method}${p.trxId ? ` · ${p.trxId}` : ""}`],
    ["Valid until", formatDate(p.newExpiry)],
    ["Received by", p.receivedBy?.name],
  ];

  return (
    <div>
      <div className="mb-4 flex gap-2 print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
        <Link href={`/dashboard/customers/${c._id}`}>
          <Button variant="secondary">Back to customer</Button>
        </Link>
        <Link href="/dashboard/billing/recharge">
          <Button variant="secondary">New recharge</Button>
        </Link>
      </div>

      <div id="receipt" className="mx-auto max-w-md rounded-lg border border-slate-300 bg-white p-6 text-slate-900 print:border-0">
        <div className="text-center">
          <h2 className="text-xl font-bold">{p.company?.name}</h2>
          {p.company?.address && <p className="text-sm">{p.company.address}</p>}
          <p className="text-sm">{p.company?.phone}</p>
          {p.receiptText?.header && <p className="mt-1 text-sm">{p.receiptText.header}</p>}
          <p className="mt-3 inline-block rounded border border-slate-900 px-3 py-0.5 text-sm font-semibold">MONEY RECEIPT</p>
        </div>
        <div className="mt-4 flex justify-between text-sm">
          <span>No: {p.receiptNo}</span>
          <span>{formatDateTime(p.createdAt)}</span>
        </div>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b border-dashed border-slate-200">
                <td className="py-1.5 text-slate-600">{k}</td>
                <td className="py-1.5 text-right font-medium">{v ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-center text-lg font-bold">Paid: {taka(p.amount)}</p>
        {p.receiptText?.footer && <p className="mt-3 text-center text-xs text-slate-600">{p.receiptText.footer}</p>}
      </div>
    </div>
  );
}
