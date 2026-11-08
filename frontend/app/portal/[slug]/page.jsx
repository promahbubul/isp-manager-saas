"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PortalShell from "@/components/portal/PortalShell";
import { UserRound } from "lucide-react";
import { Button, ErrorBox, Input, Loading } from "@/components/ui";
import { getErrorMessage } from "@/lib/api";
import { getPortalToken, portalApi, setPortalToken } from "@/lib/portalApi";

/** Customer portal login: mobile number → 6-digit SMS code. */
export default function PortalLoginPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [isp, setIsp] = useState(null);
  const [ispError, setIspError] = useState(null);
  const [step, setStep] = useState("phone"); // phone | code | pppoe
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getPortalToken(slug)) {
      router.replace(`/portal/${slug}/account`);
      return;
    }
    portalApi(slug)
      .get(`/isp/${slug}`)
      .then((r) => setIsp(r.data.data))
      .catch(setIspError);
  }, [slug, router]);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e) => {
    e?.preventDefault();
    run(async () => {
      const r = await portalApi(slug).post(`/isp/${slug}/otp`, { phone });
      setSentTo(r.data.data.sentTo);
      setStep("code");
    });
  };

  const pppoeLogin = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await portalApi(slug).post(`/isp/${slug}/login`, { username, password });
      setPortalToken(slug, r.data.data.accessToken);
      router.replace(`/portal/${slug}/account`);
    });
  };

  const verify = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await portalApi(slug).post(`/isp/${slug}/verify`, { phone, code });
      setPortalToken(slug, r.data.data.accessToken);
      router.replace(`/portal/${slug}/account`);
    });
  };

  if (ispError) {
    return (
      <PortalShell>
        <ErrorBox error={ispError} />
      </PortalShell>
    );
  }
  if (!isp) return <Loading />;

  return (
    <PortalShell isp={isp}>
      <div className="mb-6 mt-4 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--brand)] text-white shadow-lg">
          <UserRound className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in to your account</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">Check your package and validity, pay your bill and report problems.</p>
      </div>
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        {step === "pppoe" ? (
          <form onSubmit={pppoeLogin} className="space-y-4">
            <Input label="PPPoE username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input label="PPPoE password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Log in
            </Button>
            <button type="button" className="cursor-pointer text-sm text-primary-700 hover:underline" onClick={() => (setStep("phone"), setError(""))}>
              Use an SMS code instead
            </button>
          </form>
        ) : step === "phone" ? (
          <form onSubmit={sendCode} className="space-y-4">
            <Input label="Mobile number registered with us" placeholder="01XXXXXXXXX" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Send code by SMS
            </Button>
            <button type="button" className="cursor-pointer text-sm text-primary-700 hover:underline" onClick={() => (setStep("pppoe"), setError(""))}>
              Log in with PPPoE username &amp; password
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-zinc-600">We sent a 6-digit code to {sentTo}. It is valid for 5 minutes.</p>
            <Input
              label="Code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" size="lg" className="w-full" disabled={code.length !== 6} loading={busy}>
              Log in
            </Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="cursor-pointer text-zinc-600 hover:underline" onClick={() => setStep("phone")}>
                Change number
              </button>
              <button type="button" className="cursor-pointer text-primary-700 hover:underline" disabled={busy} onClick={sendCode}>
                Send again
              </button>
            </div>
          </form>
        )}
      </section>
      {isp.onlinePayment && (
        <p className="mt-6 text-center text-sm text-muted">
          Only want to pay?{" "}
          <a className="font-semibold text-primary-700 hover:underline" href={`/pay/${slug}`}>
            Pay without logging in
          </a>
        </p>
      )}
    </PortalShell>
  );
}
