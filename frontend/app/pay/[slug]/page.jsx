"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import MethodPicker from "@/components/payment/MethodPicker";
import { Button, ErrorBox, Input, Loading } from "@/components/ui";
import { api, getErrorMessage } from "@/lib/api";
import { formatDate, taka } from "@/lib/format";

/** Public bill payment page: /pay/<isp-slug>?c=<customerId> */
function PayContent() {
  const { slug } = useParams();
  const params = useSearchParams();
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [account, setAccount] = useState(params.get("c") ?? "");
  const [phone, setPhone] = useState("");
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
        <form onSubmit={lookup} className="space-y-4">
          <h2 className="text-xl font-bold">Pay your internet bill</h2>
          <Input label="Customer ID or username" placeholder="C-00012" required value={account} onChange={(e) => setAccount(e.target.value)} />
          <Input label="Registered mobile number" placeholder="01XXXXXXXXX" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Show my bill
          </Button>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-lg font-semibold">{bill.name}</p>
            <p className="text-sm text-slate-600">
              {bill.customerId} · {bill.package}
            </p>
            <p className={`mt-1 text-sm ${new Date(bill.expiryDate) < new Date() ? "text-red-600" : "text-slate-600"}`}>
              {new Date(bill.expiryDate) < new Date() ? "Expired on" : "Valid until"} {formatDate(bill.expiryDate)}
            </p>
            {bill.dueAmount > 0 && <p className="text-sm text-red-600">Previous due: {taka(bill.dueAmount)}</p>}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold">Months</label>
            <select className="rounded-md border border-slate-300 px-3 py-2" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 2, 3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="ml-auto text-2xl font-extrabold">{taka(payable)}</span>
          </div>
          {info.methods.length === 0 ? (
            <ErrorBox>Online payment is not available. Please pay at the office.</ErrorBox>
          ) : (
            <MethodPicker methods={info.methods} value={gateway} onChange={setGateway} manual={manual} onManualChange={setManual} showMethodSelect />
          )}
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setBill(null)}>
              Back
            </Button>
            <Button
              size="lg"
              variant="success"
              className="flex-1"
              loading={busy}
              disabled={!gateway || payable <= 0 || (gateway === "manual" && !manual.trxId)}
              onClick={pay}
            >
              {gateway === "manual" ? "Submit payment" : `Pay ${taka(payable)}`}
            </Button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function ResultView({ result, company }) {
  const map = {
    success: ["✅", "Payment successful", "Your connection is active."],
    pending_review: ["⏳", "Payment submitted", `${company?.name ?? "Your ISP"} will verify it and activate your connection shortly.`],
    initiated: ["⏳", "Confirming payment...", "This can take a minute. Please keep this page open."],
    cancelled: ["↩️", "Payment cancelled", "No money was taken."],
    failed: ["❌", "Payment failed", result.failureReason ?? "Please try again."],
  };
  const [icon, title, text] = map[result.status] ?? map.failed;
  return (
    <div className="space-y-3 text-center">
      <p className="text-5xl">{icon}</p>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-slate-600">{text}</p>
      {result.receiptNo && (
        <p className="text-sm">
          Receipt <strong>{result.receiptNo}</strong> · valid until <strong>{formatDate(result.newExpiry)}</strong>
        </p>
      )}
      {result.gatewayTrxId && <p className="text-xs text-slate-500">Transaction: {result.gatewayTrxId}</p>}
      <Button variant="secondary" onClick={() => (window.location.href = window.location.pathname)}>
        Done
      </Button>
    </div>
  );
}

function Shell({ company, children }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg sm:p-8">
        {company && (
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-extrabold text-purple-700">{company.name}</h1>
            {company.phone && <p className="text-sm text-slate-500">Helpline {company.phone}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PayContent />
    </Suspense>
  );
}
