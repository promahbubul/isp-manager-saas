"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthCard from "@/components/auth/AuthCard";
import { ContainerButton, ErrorBox, LabelWithInput } from "@/components/ui";
import { adminApi, setAdminToken } from "@/lib/adminApi";
import { getErrorMessage } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await adminApi.post("/auth/admin/login", { email, password, ...(needs2fa ? { totp } : {}) });
      setAdminToken(res.data.data.accessToken);
      router.replace("/admin");
    } catch (err) {
      if (err?.response?.data?.details?.needs2fa) {
        // First step passed — ask for the authenticator code (only show an error after a wrong code).
        if (needs2fa) setError(getErrorMessage(err));
        setNeeds2fa(true);
      } else setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Platform admin" subtitle={needs2fa ? "Enter the 6-digit code from your authenticator app" : "Super admin / finance staff only"}>
      <form onSubmit={submit} noValidate>
        {!needs2fa ? (
          <>
            <LabelWithInput label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <LabelWithInput label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </>
        ) : (
          <LabelWithInput
            label="Authenticator code"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
          />
        )}
        {error && (
          <div className="mb-4">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
        <ContainerButton title={needs2fa ? "Verify" : "Login"} loading={busy} />
      </form>
    </AuthCard>
  );
}
