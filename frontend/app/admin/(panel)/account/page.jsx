"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader } from "@/components/ui";
import { adminApi, setAdminToken } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";

function TwoFactor({ enabled }) {
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl }
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const start = useAdminMutation(() => adminApi.post("/auth/admin/2fa/setup"), { onSuccess: (res) => setSetup(res.data) });
  const enable = useAdminMutation(() => adminApi.post("/auth/admin/2fa/enable", { code }), { invalidate: ["me"], onSuccess: () => setSetup(null) });
  const disable = useAdminMutation(() => adminApi.post("/auth/admin/2fa/disable", { code, password }), { invalidate: ["me"] });

  useEffect(() => {
    if (setup?.otpauthUrl) QRCode.toDataURL(setup.otpauthUrl, { width: 200, margin: 1 }).then(setQr);
  }, [setup]);

  if (enabled) {
    return (
      <Card title={<span className="flex items-center gap-2">Two-factor authentication <Badge color="green">on</Badge></span>}>
        <p className="mb-4 text-sm text-slate-600">To turn it off, confirm your password and a current code.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input label="Authenticator code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </div>
        <Button className="mt-4" variant="danger" disabled={!password || code.length !== 6} loading={disable.isPending} onClick={() => disable.mutate()}>
          Turn off 2FA
        </Button>
      </Card>
    );
  }

  return (
    <Card title={<span className="flex items-center gap-2">Two-factor authentication <Badge color="amber">off</Badge></span>}>
      {!setup ? (
        <>
          <p className="mb-4 text-sm text-slate-600">Protect the admin panel with a code from Google Authenticator, Microsoft Authenticator or Authy.</p>
          <Button loading={start.isPending} onClick={() => start.mutate()}>
            Set up 2FA
          </Button>
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">1. Scan this QR code with your authenticator app (or type the key).</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing for next/image to optimise */}
          {qr && <img src={qr} alt="2FA QR code" width={200} height={200} className="rounded border border-slate-200" />}
          <code className="block break-all rounded bg-slate-100 p-2 text-sm">{setup.secret}</code>
          <p className="text-sm text-slate-600">2. Enter the 6-digit code the app shows.</p>
          <div className="flex items-end gap-2">
            <Input label="Code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <Button disabled={code.length !== 6} loading={enable.isPending} onClick={() => enable.mutate()}>
              Turn on
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ currentPassword: "", newPassword: "" });
  const save = useAdminMutation(() => adminApi.post("/auth/admin/change-password", f), {
    onSuccess: (res) => {
      setAdminToken(res.data.accessToken);
      setF({ currentPassword: "", newPassword: "" });
    },
  });
  return (
    <Card title="Change password">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Current password" type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />
        <Input label="New password" type="password" hint="At least 8 characters with a letter and a number" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
      </div>
      <Button className="mt-4" disabled={!f.currentPassword || !f.newPassword} loading={save.isPending} onClick={() => save.mutate()}>
        Change password
      </Button>
      <p className="mt-2 text-xs text-slate-500">Other sessions are logged out.</p>
    </Card>
  );
}

export default function AdminAccountPage() {
  const { data, isLoading, error } = useAdminApi("me", "/auth/admin/me");
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const me = data.data;
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="My account" subtitle={`${me.name} · ${me.email} · ${me.role}`} />
      <TwoFactor enabled={me.twoFactor?.enabled} />
      <ChangePassword />
    </div>
  );
}
