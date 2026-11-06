"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import CompanyProfileForm from "@/components/settings/CompanyProfileForm";
import { Button, Card, Checkbox, ErrorBox, Input, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi, useApiMutation } from "@/lib/hooks";

export default function SettingsPage() {
  const { data, isLoading, error } = useApi("settings", "/settings");
  const { register, handleSubmit, reset } = useForm();
  const save = useApiMutation((body) => api.patch("/settings", body), { invalidate: ["settings"] });

  useEffect(() => {
    if (data?.data) {
      const s = data.data;
      reset({
        graceDays: s.billing?.graceDays ?? 0,
        autoDisable: s.billing?.autoDisable ?? true,
        header: s.receipt?.header ?? "",
        footer: s.receipt?.footer ?? "",
        sms: { ...(s.sms?.autoEvents ?? {}) },
        reminderDaysBefore: s.sms?.reminderDaysBefore ?? 3,
      });
    }
  }, [data, reset]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const onSubmit = (v) =>
    save.mutate({
      billing: { graceDays: Number(v.graceDays), autoDisable: v.autoDisable },
      receipt: { header: v.header, footer: v.footer },
      sms: { autoEvents: v.sms, reminderDaysBefore: Number(v.reminderDaysBefore) },
    });

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="mb-6 max-w-2xl">
        <CompanyProfileForm />
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-2xl flex-col gap-6">
        <Card title="Billing">
          <div className="flex flex-col gap-4">
            <Checkbox
              label="Auto disable expired customers"
              hint="Checked every 15 minutes. Turn off to manage connections manually."
              {...register("autoDisable")}
            />
            <Input
              label="Grace period (days)"
              type="number"
              min={0}
              max={30}
              hint="How many days after expiry the connection keeps working"
              {...register("graceDays")}
            />
          </div>
        </Card>
        <Card title="Automatic SMS">
          <div className="flex flex-col gap-3">
            <Checkbox label="Welcome SMS for new customers" hint="Includes PPPoE username and password" {...register("sms.welcome")} />
            <Checkbox label="Payment received" {...register("sms.payment_success")} />
            <Checkbox label="Expiry reminder" {...register("sms.expiry_reminder")} />
            <Input label="Remind how many days before expiry" type="number" min={1} max={10} {...register("reminderDaysBefore")} />
            <Checkbox label="Connection expired" {...register("sms.expired")} />
            <Checkbox label="Ticket solved" {...register("sms.ticket_update")} />
            <p className="text-xs text-slate-500">Each SMS uses credits from your SMS balance. Edit the texts under SMS → Templates.</p>
          </div>
        </Card>
        <Card title="Money receipt">
          <div className="flex flex-col gap-4">
            <Input label="Header line" placeholder="e.g. Licensed ISP — BTRC No. ..." {...register("header")} />
            <Input label="Footer line" placeholder="e.g. Thank you! Hotline: 01XXXXXXXXX" {...register("footer")} />
          </div>
        </Card>
        <div>
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </div>
  );
}
