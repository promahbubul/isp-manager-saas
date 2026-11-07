"use client";

import { Input } from "@/components/ui";

const SHORT = { sslcommerz: "SSLCommerz", bkash: "bKash", stripe: "Card (Stripe)", manual: "Send Money (manual)" };
const SUB = {
  sslcommerz: "Card, bKash, Nagad, Rocket, net banking",
  bkash: "Pay from your bKash account",
  stripe: "International Visa / Mastercard",
  manual: "Send money, then enter the TrxID",
};

/** Radio list of enabled methods + TrxID fields for manual. */
export default function MethodPicker({ methods, value, onChange, manual, onManualChange, showMethodSelect = false }) {
  const selected = methods.find((m) => m.gateway === value);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {methods.map((m) => (
          <label
            key={m.gateway}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${value === m.gateway ? "border-primary-600 bg-primary-50" : "border-zinc-200 hover:border-primary-300"}`}
          >
            <input type="radio" name="gateway" className="mt-1 accent-primary-600" checked={value === m.gateway} onChange={() => onChange(m.gateway)} />
            <span>
              <span className="block font-semibold text-zinc-900">
                {SHORT[m.gateway]} {m.sandbox && m.gateway !== "manual" && <span className="text-xs font-normal text-amber-600">(test mode)</span>}
              </span>
              <span className="text-xs text-zinc-500">{SUB[m.gateway]}</span>
            </span>
          </label>
        ))}
      </div>
      {selected?.gateway === "manual" && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="whitespace-pre-wrap text-sm text-amber-900">{selected.instructions}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {showMethodSelect && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-zinc-700">Paid with</label>
                <select className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-100" value={manual.method ?? "bkash"} onChange={(e) => onManualChange({ ...manual, method: e.target.value })}>
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="rocket">Rocket</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
            )}
            <Input label="Transaction ID (TrxID)" required value={manual.trxId ?? ""} onChange={(e) => onManualChange({ ...manual, trxId: e.target.value })} />
            <Input label="Sender number" placeholder="01XXXXXXXXX" value={manual.senderNumber ?? ""} onChange={(e) => onManualChange({ ...manual, senderNumber: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}
