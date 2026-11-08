"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Send } from "lucide-react";
import { SaveBar, SettingsSection } from "@/components/settings/SettingsSection";
import { Button, ErrorBox, Input, Loading, PageHeader, Switch } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";

const toForm = (s) => ({
  smsCreditPriceBDT: s.smsCreditPriceBDT ?? "",
  smsCreditPriceUSD: s.smsCreditPriceUSD ?? "",
  graceDays: s.graceDays ?? "",
  smtp: {
    enabled: Boolean(s.smtp?.enabled),
    host: s.smtp?.host ?? "",
    port: s.smtp?.port ?? "",
    user: s.smtp?.user ?? "",
    pass: "",
    from: s.smtp?.from ?? "",
  },
});

export default function AdminSettingsPage() {
  const { data, isLoading, error } = useAdminApi("settings", "/admin/settings");
  const { register, handleSubmit, reset, formState } = useForm();
  const save = useAdminMutation((body) => adminApi.patch("/admin/settings", body), { invalidate: ["settings"] });
  const [testTo, setTestTo] = useState("");
  const test = useAdminMutation(() => adminApi.post("/admin/settings/test-email", { to: testTo }));

  useEffect(() => {
    if (data?.data) reset(toForm(data.data));
  }, [data, reset]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const onSubmit = (v) =>
    save
      .mutateAsync({
        smsCreditPriceBDT: Number(v.smsCreditPriceBDT),
        smsCreditPriceUSD: Number(v.smsCreditPriceUSD),
        graceDays: Number(v.graceDays),
        smtp: {
          enabled: Boolean(v.smtp?.enabled),
          host: v.smtp?.host || undefined,
          port: v.smtp?.port ? Number(v.smtp.port) : undefined,
          user: v.smtp?.user || undefined,
          pass: v.smtp?.pass || undefined,
          from: v.smtp?.from || undefined,
        },
      })
      .then(() => reset({ ...v, smtp: { ...v.smtp, pass: "" } }))
      .catch(() => undefined);

  return (
    <div className="mx-auto w-full max-w-6xl pb-6">
      <PageHeader title="Platform settings" subtitle="Pricing, subscription rules and outgoing email for the whole platform." className="mb-6 border-b border-line pb-5" />
      <form onSubmit={handleSubmit(onSubmit)}>
        <SettingsSection first title="SMS credit price" description="What ISPs pay per SMS credit when they top up their balance.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Price per credit (৳)" type="number" step="0.01" min={0} hint="bKash, Nagad, SSLCommerz" {...register("smsCreditPriceBDT")} />
            <Input label="Price per credit ($)" type="number" step="0.0001" min={0} hint="Stripe" {...register("smsCreditPriceUSD")} />
          </div>
        </SettingsSection>

        <SettingsSection title="Subscription" description="How long an ISP can keep working after its subscription period ends.">
          <Input label="Grace period (days)" type="number" min={0} className="sm:max-w-xs" hint="ISPs stay writable (past due) for this many days, then get suspended." {...register("graceDays")} />
        </SettingsSection>

        <SettingsSection
          title="Email (SMTP)"
          description="Used for ISP daily summaries and subscription reminders. Any SMTP provider works — Gmail app password, Zoho, Amazon SES, Brevo."
        >
          <div className="space-y-5">
            <Switch label="Send emails" hint="Turn off to stop all platform email without losing these settings." {...register("smtp.enabled")} />
            <div className="grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <Input label="Host" placeholder="smtp.gmail.com" {...register("smtp.host")} />
              <Input label="Port" type="number" placeholder="587" {...register("smtp.port")} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Username" autoComplete="off" {...register("smtp.user")} />
              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                placeholder={data.data.smtpHasPassword ? "•••••••• (saved)" : ""}
                hint={data.data.smtpHasPassword ? "Leave empty to keep the saved password." : undefined}
                {...register("smtp.pass")}
              />
            </div>
            <Input label="From address" placeholder="ISP Manager <no-reply@yourdomain.com>" {...register("smtp.from")} />

            <div className="border-t border-line pt-5">
              <p className="text-sm font-medium text-ink">Send a test email</p>
              <p className="mb-3 text-sm text-muted">Uses the saved settings — save first if you changed anything.</p>
              <div className="flex flex-wrap items-end gap-2">
                <Input className="min-w-56 flex-1" type="email" aria-label="Test email address" placeholder="you@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                <Button variant="secondary" loading={test.isPending} disabled={!testTo} onClick={() => test.mutate()}>
                  {!test.isPending && <Send />} Send test
                </Button>
              </div>
            </div>
          </div>
        </SettingsSection>

        <SaveBar dirty={formState.isDirty} saving={save.isPending} onReset={() => reset(toForm(data.data))} />
      </form>
    </div>
  );
}
