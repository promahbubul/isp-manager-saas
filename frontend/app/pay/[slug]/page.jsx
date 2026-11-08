"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, Clock, CreditCard, Loader2, Undo2, XCircle } from "lucide-react";
import MethodPicker from "@/components/payment/MethodPicker";
import PortalShell from "@/components/portal/PortalShell";
import { Button, ErrorBox, Input, Loading } from "@/components/ui";
import { api, getErrorMessage } from "@/lib/api";
import { formatDate, taka } from "@/lib/format";

/** Public bill payment page: /pay/<isp-slug>?c=<customerId>&p=<mobile> (p is filled in from the customer portal) */
function PayContent() {
  const { slug } = useParams();
  const params = useSearchParams();
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [account, setAccount] = useState(params.get("c") ?? "");
  const [phone, setPhone] = useState(params.get("p") ?? "");
  const [bill, setBill] = useState(null);
  const [months, setMonths] = useState(1);
  const [gateway, setGateway] = useState("");
  const [manual, setManual] = useState({ method: "bkash" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { status, ... }

  useEffect(() => {
    api
      .get(`/public/pay/${slug}`)
      .then((r) => {
        setInfo(r.data.data);
        setGateway(r.data.data.methods[0]?.gateway ?? "");
      })
      .catch(setInfoError);
  }, [slug]);

  // Returning from a gateway: ?payment=success&tran=...
  const tran = params.get("tran");
  useEffect(() => {
    if (!tran) return;
    let stop = false;
    const poll = async (n = 0) => {
      try {
        const r = await api.get(`/public/pay/${slug}/status/${tran}`);
        if (stop) return;
        setResult(r.data.data);
        if (r.data.data.status === "initiated" && n < 10) setTimeout(() => poll(n + 1), 3000);
      } catch (err) {
        if (!stop) setResult({ status: "failed", failureReason: getErrorMessage(err) });
      }
    };
    poll();
    return () => {
      stop = true;
    };
  }, [slug, tran]);

  const lookup = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post(`/public/pay/${slug}/lookup`, { account, phone });
      setBill(r.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.post(`/public/pay/${slug}/checkout`, { account, phone, months, gateway, ...(gateway === "manual" ? manual : {}) });
      if (r.data.data.redirectUrl) window.location.href = r.data.data.redirectUrl;
      else setResult({ status: "pending_review", amount: r.data.data.amount });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (infoError) return <Shell><ErrorBox error={infoError} /></Shell>;
  if (!info) return <Shell><Loading /></Shell>;

  const perMonth = bill ? bill.monthlyBill : 0;
  const payable = bill ? Math.max(0, perMonth * months + bill.dueAmount - bill.balance) : 0;

  return (
    <Shell company={info.company}>
      {result ? (
        <ResultView result={result} company={info.company} />
      ) : !bill ? (
        <>
          <div className="mb-6 mt-4 text-center">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--brand)] text-white shadow-lg">
              <CreditCard className="size-7" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Pay your internet bill</h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted">No login needed — enter your customer ID and registered mobile number.</p>
          </div>
          <form onSubmit={lookup} className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <Input label="Customer ID or username" placeholder="C-00012" required value={account} onChange={(e) => setAccount(e.target.value)} />
            <Input label="Registered mobile number" placeholder="01XXXXXXXXX" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Show my bill
            </Button>
          </form>
        </>
      ) : (
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-ink">{bill.name}</p>
                <p className="truncate text-sm text-muted">
                  {bill.customerId} · {bill.package}
                </p>
              </div>
              <button type="button" onClick={() => setBill(null)} className="shrink-0 cursor-pointer text-sm font-medium text-muted hover:text-ink">
                Change
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-subtle p-3">
                <p className="text-xs text-muted">{new Date(bill.expiryDate) < new Date() ? "Expired on" : "Valid until"}</p>
                <p className={`mt-0.5 font-semibold ${new Date(bill.expiryDate) < new Date() ? "text-rose-600" : "text-ink"}`}>{formatDate(bill.expiryDate)}</p>
              </div>
              <div className="rounded-xl bg-subtle p-3">
                <p className="text-xs text-muted">Previous due</p>
                <p className={`tabular mt-0.5 font-semibold ${bill.dueAmount > 0 ? "text-rose-600" : "text-ink"}`}>{taka(bill.dueAmount)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
            <p className="mb-2 text-sm font-medium text-ink">How many months?</p>
            <div role="radiogroup" aria-label="Months" className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={months === m}
                  onClick={() => setMonths(m)}
                  className={`h-10 cursor-pointer rounded-lg border text-sm font-medium transition-colors ${months === m ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line text-ink hover:bg-subtle"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
              <span className="text-sm text-muted">Total to pay</span>
              <span className="tabular text-3xl font-semibold tracking-tight text-ink">{taka(payable)}</span>
            </div>
          </section>
          {info.methods.length === 0 ? (
            <ErrorBox>Online payment is not available. Please pay at the office.</ErrorBox>
          ) : (
            <MethodPicker methods={info.methods} value={gateway} onChange={setGateway} manual={manual} onManualChange={setManual} showMethodSelect />
          )}
          {error && <ErrorBox>{error}</ErrorBox>}
          {info.methods.length > 0 && (
            <Button
              size="lg"
              className="w-full"
              loading={busy}
              disabled={!gateway || payable <= 0 || (gateway === "manual" && !manual.trxId)}
              onClick={pay}
            >
              {gateway === "manual" ? "Submit payment" : `Pay ${taka(payable)}`}
            </Button>
          )}
        </div>
      )}
    </Shell>
  );
}

function ResultView({ result, company }) {
  const map = {
    success: [CheckCircle2, "bg-emerald-50 text-emerald-600", "Payment successful", "Your connection is active."],
    pending_review: [Clock, "bg-amber-50 text-amber-600", "Payment submitted", `${company?.name ?? "Your ISP"} will verify it and activate your connection shortly.`],
    initiated: [Loader2, "bg-sky-50 text-sky-600", "Confirming payment…", "This can take a minute. Please keep this page open."],
    cancelled: [Undo2, "bg-zinc-100 text-zinc-600", "Payment cancelled", "No money was taken."],
    failed: [XCircle, "bg-rose-50 text-rose-600", "Payment failed", result.failureReason ?? "Please try again."],
  };
  const [Icon, tone, title, text] = map[result.status] ?? map.failed;
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-6 text-center shadow-[var(--shadow-card)] sm:p-8">
      <span className={`mx-auto flex size-14 items-center justify-center rounded-full ${tone}`}>
        <Icon className={`size-7 ${result.status === "initiated" ? "animate-spin" : ""}`} />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-ink">{title}</h1>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{text}</p>
      {result.receiptNo && (
        <div className="mx-auto mt-5 grid max-w-xs grid-cols-2 gap-3 text-left text-sm">
          <div className="rounded-xl bg-subtle p-3">
            <p className="text-xs text-muted">Receipt</p>
            <p className="mt-0.5 font-semibold text-ink">{result.receiptNo}</p>
          </div>
          <div className="rounded-xl bg-subtle p-3">
            <p className="text-xs text-muted">Valid until</p>
            <p className="mt-0.5 font-semibold text-ink">{formatDate(result.newExpiry)}</p>
          </div>
        </div>
      )}
      {result.gatewayTrxId && <p className="mt-3 text-xs text-muted">Transaction: {result.gatewayTrxId}</p>}
      <Button variant="secondary" className="mt-6" onClick={() => (window.location.href = window.location.pathname)}>
        Done
      </Button>
    </section>
  );
}

/** Same frame as the customer portal: ISP name, logo and colour on top. */
function Shell({ company, children }) {
  return <PortalShell isp={company}>{children}</PortalShell>;
}

export default function PayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PayContent />
    </Suspense>
  );
}
