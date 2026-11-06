"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import toast from "react-hot-toast";
import MethodPicker from "@/components/payment/MethodPicker";
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, StatusBadge, Table } from "@/components/ui";
import { api, getErrorMessage } from "@/lib/api";
import { formatDate, taka } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const limit = (n) => (n === -1 ? "Unlimited" : n);
const money = (amount, currency) => (currency === "USD" ? `$${amount}` : taka(amount));

/** Checkout dialog shared by plan purchase and SMS credits. */
function PayDialog({ open, onClose, title, methods, amountFor, submit, children, checkCoupon }) {
  const [gateway, setGateway] = useState(methods[0]?.gateway ?? "");
  const [manual, setManual] = useState({});
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState(null); // { code, discount, finalPrice, gateway }
  const base = gateway ? amountFor(gateway) : null;
  // A coupon preview is tied to the gateway (currency); re-check after switching.
  const applied = coupon && coupon.gateway === gateway ? coupon : null;
  const amount = base && applied ? { ...base, value: applied.finalPrice } : base;

  const apply = async () => {
    try {
      const r = await checkCoupon(code, gateway);
      setCoupon({ ...r.data.data, gateway });
      toast.success(`Coupon applied: −${money(r.data.data.discount, r.data.data.currency)}`);
    } catch (err) {
      setCoupon(null);
      toast.error(getErrorMessage(err));
    }
  };

  const pay = async () => {
    setBusy(true);
    try {
      const res = await submit(gateway, { ...manual, ...(applied ? { coupon: applied.code } : {}) });
      const d = res.data.data;
      if (d.redirectUrl) window.location.href = d.redirectUrl;
      else {
        toast.success(res.data.message);
        onClose(true);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => onClose(false)} title={title} size="lg">
      {methods.length === 0 ? (
        <ErrorBox>Online payment is not available yet. Please contact support.</ErrorBox>
      ) : (
        <div className="space-y-4">
          {children}
          <MethodPicker methods={methods} value={gateway} onChange={setGateway} manual={manual} onManualChange={setManual} />
          {checkCoupon && (
            <div className="flex items-end gap-2">
              <Input label="Coupon code" className="flex-1" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <Button variant="secondary" disabled={!code || !gateway} onClick={apply}>
                Apply
              </Button>
            </div>
          )}
          {amount && (
            <p className="text-lg font-semibold">
              Total: {money(amount.value, amount.currency)}
              {applied && <span className="ml-2 text-sm font-normal text-slate-500 line-through">{money(base.value, base.currency)}</span>}
            </p>
          )}
          <div className="flex justify-end">
            <Button size="lg" loading={busy} disabled={!gateway || (gateway === "manual" && !manual.trxId)} onClick={pay}>
              {gateway === "manual" ? "Submit for verification" : "Pay now"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SubscriptionContent() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const { reload } = useAuth();
  const { data, isLoading, error } = useApi("billing", "/billing");
  const [billingInterval, setBillingInterval] = useState("monthly");
  const [buying, setBuying] = useState(null); // plan
  const [smsOpen, setSmsOpen] = useState(false);
  const [credits, setCredits] = useState(1000);

  // Back from a gateway: show the result once, refresh data, clean the URL.
  useEffect(() => {
    const status = params.get("payment");
    if (!status) return;
    if (status === "success") toast.success("Payment successful — thank you!");
    else if (status === "processing") toast("Payment is being confirmed. Refresh in a minute.");
    else toast.error(`Payment ${status}`);
    qc.invalidateQueries({ queryKey: ["billing"] });
    reload().catch(() => undefined);
    router.replace("/dashboard/billing/subscription");
  }, [params, qc, reload, router]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { company, subscription, plans, invoices, methods, pendingManual, smsCreditPrice } = data.data;
  const current = subscription?.plan;
  const done = (ok) => {
    setBuying(null);
    setSmsOpen(false);
    if (ok) qc.invalidateQueries({ queryKey: ["billing"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Subscription & billing" />

      <Card title="Current plan">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-2xl font-bold">{current?.name ?? "—"}</p>
            <p className="text-sm text-slate-500">
              <StatusBadge status={subscription?.status === "trialing" ? "pending" : subscription?.status === "active" ? "active" : "expired"} />{" "}
              {subscription?.status === "trialing" ? `Trial until ${formatDate(company.trialEndsAt)}` : `Paid until ${formatDate(subscription?.currentPeriodEnd)}`}
            </p>
          </div>
          <div className="text-sm text-slate-600">
            Customers {company.usage.customers}/{limit(current?.limits?.customers)} · Routers {company.usage.routers}/{limit(current?.limits?.routers)} · Staff{" "}
            {company.usage.staff}/{limit(current?.limits?.staff)}
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-slate-500">SMS balance</p>
            <p className="text-xl font-bold">{company.smsBalance}</p>
            <Button size="sm" variant="secondary" onClick={() => setSmsOpen(true)}>
              Buy SMS credits
            </Button>
          </div>
        </div>
        {(company.status === "suspended" || company.status === "past_due") && (
          <div className="mt-4">
            <ErrorBox>Your account is {company.status.replace("_", " ")}. Pay for a plan below to restore full access.</ErrorBox>
          </div>
        )}
        {pendingManual?.length > 0 && (
          <p className="mt-4 text-sm text-amber-700">
            Waiting for verification: {pendingManual.map((p) => `${p.description} (TrxID ${p.gatewayTrxId})`).join(", ")}
          </p>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Plans</h3>
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {["monthly", "yearly"].map((i) => (
            <button key={i} type="button" onClick={() => setBillingInterval(i)} className={`cursor-pointer rounded px-3 py-1 text-sm capitalize ${billingInterval === i ? "bg-purple-600 text-white" : "text-slate-600"}`}>
              {i} {i === "yearly" && <span className="text-xs">(2 months free)</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const price = p.priceBDT[billingInterval];
          const isCurrent = current?._id === p._id && subscription?.status === "active";
          return (
            <div key={p._id} className={`flex flex-col rounded-lg border bg-white p-5 ${isCurrent ? "border-purple-600 ring-2 ring-purple-200" : "border-slate-200"}`}>
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-bold">{p.name}</h4>
                {isCurrent && <Badge color="purple">current</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-500">{p.description}</p>
              <p className="mt-4 text-3xl font-extrabold">
                {price > 0 ? taka(price) : "Custom"}
                {price > 0 && <span className="text-sm font-normal text-slate-500">/{billingInterval === "monthly" ? "mo" : "yr"}</span>}
              </p>
              {price > 0 && p.priceUSD[billingInterval] > 0 && <p className="text-xs text-slate-500">or ${p.priceUSD[billingInterval]} by card</p>}
              <ul className="mt-4 flex-1 space-y-1 text-sm text-slate-700">
                <li>✓ {limit(p.limits.customers)} customers</li>
                <li>✓ {limit(p.limits.routers)} router(s)</li>
                <li>✓ {limit(p.limits.staff)} staff</li>
                {p.features.map((f) => (
                  <li key={f}>✓ {f.replace(/_/g, " ")}</li>
                ))}
              </ul>
              <Button className="mt-4" disabled={!(price > 0)} variant={isCurrent ? "secondary" : "primary"} onClick={() => setBuying(p)}>
                {price > 0 ? (isCurrent ? "Renew" : "Choose") : "Contact us"}
              </Button>
            </div>
          );
        })}
      </div>

      <Card title="Invoices">
        <Table
          rows={invoices}
          empty="No invoices yet."
          columns={[
            { key: "invoiceNo", header: "Invoice" },
            { key: "createdAt", header: "Date", render: (i) => formatDate(i.createdAt) },
            { key: "planName", header: "Plan", render: (i) => `${i.planName} (${i.interval})` },
            { key: "amount", header: "Amount", render: (i) => money(i.amount, i.currency) },
            { key: "gateway", header: "Method" },
            { key: "period", header: "Period", render: (i) => (i.periodEnd ? `${formatDate(i.periodStart)} – ${formatDate(i.periodEnd)}` : "—") },
            { key: "status", header: "Status", render: (i) => <StatusBadge status={i.status === "paid" ? "success" : i.status === "void" ? "failed" : "pending"} /> },
          ]}
        />
      </Card>

      {buying && (
        <PayDialog
          open
          title={`${buying.name} — ${billingInterval}`}
          methods={methods}
          amountFor={(g) => (g === "stripe" ? { value: buying.priceUSD[billingInterval], currency: "USD" } : { value: buying.priceBDT[billingInterval], currency: "BDT" })}
          submit={(gateway, extra) => api.post("/billing/checkout", { plan: buying._id, interval: billingInterval, gateway, ...extra })}
          checkCoupon={(code, gateway) => api.post("/billing/coupon", { code, plan: buying._id, interval: billingInterval, gateway })}
          onClose={done}
        />
      )}
      {smsOpen && (
        <PayDialog
          open
          title="Buy SMS credits"
          methods={methods}
          amountFor={(g) =>
            g === "stripe"
              ? { value: Math.round(credits * smsCreditPrice.USD * 100) / 100, currency: "USD" }
              : { value: Math.round(credits * smsCreditPrice.BDT * 100) / 100, currency: "BDT" }
          }
          submit={(gateway, manual) => api.post("/billing/sms-credits", { credits: Number(credits), gateway, ...manual })}
          onClose={done}
        >
          <Input
            label={`Credits (৳${smsCreditPrice.BDT} each, minimum 100)`}
            type="number"
            min={100}
            step={100}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
          />
        </PayDialog>
      )}
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SubscriptionContent />
    </Suspense>
  );
}
