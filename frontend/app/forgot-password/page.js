"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import AuthCard from "@/components/auth/AuthCard";
import { ContainerButton, ErrorBox, LabelWithInput } from "@/components/ui";
import { api, getErrorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState("request"); // request | reset
  const [identifier, setIdentifier] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [companies, setCompanies] = useState(null);
  const [companySlug, setCompanySlug] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const request = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/auth/forgot-password", { identifier });
      setSentTo(r.data.data?.sentTo ?? "");
      setStep("reset");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { identifier, code, newPassword, companySlug: companySlug || undefined });
      toast.success("Password changed. Please log in.");
      router.replace("/login");
    } catch (err) {
      const choices = err?.response?.status === 409 && err.response.data?.details?.companies;
      if (choices) {
        setCompanies(choices);
        setCompanySlug(choices[0].slug);
        setError("Select which company's account to reset.");
      } else setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Reset password"
      subtitle={step === "request" ? "We will send a 6-digit code to your registered mobile." : `Enter the code sent to ${sentTo || "your mobile"}.`}
      footer={
        <Link href="/login" className="font-semibold text-primary-700 hover:underline">
          Back to login
        </Link>
      }
    >
      {step === "request" ? (
        <form onSubmit={request} noValidate>
          <LabelWithInput label="Phone or email" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
          <ContainerButton title="Send code" loading={busy} />
        </form>
      ) : (
        <form onSubmit={reset} noValidate>
          <LabelWithInput label="6-digit code" required inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          <LabelWithInput label="New password" type="password" required hint="At least 8 characters with a letter and a number" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          {companies && (
            <div className="mb-5 flex flex-col gap-1">
              <label className="font-semibold text-zinc-700">Company</label>
              <select className="rounded-md border border-line bg-surface px-4 py-2.5 text-ink" value={companySlug} onChange={(e) => setCompanySlug(e.target.value)}>
                {companies.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
          <ContainerButton title="Change password" loading={busy} />
          <button type="button" className="mt-3 w-full cursor-pointer text-sm text-primary-700 hover:underline" onClick={() => setStep("request")}>
            Didn&apos;t get a code? Send again
          </button>
        </form>
      )}
    </AuthCard>
  );
}
