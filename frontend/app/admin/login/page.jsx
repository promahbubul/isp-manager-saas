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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await adminApi.post("/auth/admin/login", { email, password });
      setAdminToken(res.data.data.accessToken);
      router.replace("/admin");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Platform admin" subtitle="Super admin / finance staff only">
      <form onSubmit={submit} noValidate>
        <LabelWithInput label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <LabelWithInput label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && (
          <div className="mb-4">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
        <ContainerButton title="Login" loading={busy} />
      </form>
    </AuthCard>
  );
}
