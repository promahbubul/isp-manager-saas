"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import CompanyProfileForm from "@/components/settings/CompanyProfileForm";
import { Button, Card, Checkbox, ErrorBox, Input, Loading, PageHeader } from "@/components/ui";
import { api, downloadFile, getErrorMessage } from "@/lib/api";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

/** Links to share with customers (Facebook page, SMS, printed on the receipt). */
function CustomerLinks() {
  const { company, subscription } = useAuth();
  const features = subscription?.plan?.features ?? [];
  if (!company) return null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const links = [
    { feature: "customer_portal", label: "Customer portal (login with SMS code)", url: `${origin}/portal/${company.slug}` },
    { feature: "online_payment", label: "Pay bill online", url: `${origin}/pay/${company.slug}` },
  ];
  const copy = (url) => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"));
  return (
    <Card title="Links for your customers">
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.url}>
            <p className="text-sm font-medium">{l.label}</p>
            {features.includes(l.feature) ? (
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-sm">{l.url}</code>
                <Button size="sm" variant="secondary" onClick={() => copy(l.url)}>
                  Copy
                </Button>
              </div>
            ) : (
              <p className="mt-1 text-sm text-zinc-500">🔒 Not in your plan — upgrade under My Subscription.</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-zinc-500">
        Reminder and expiry SMS include the pay link automatically. Add {"{portal_link}"} to an SMS template to send the portal link.
      </p>
    </Card>
  );
}

/** Owner-only: everything in one JSON file (customers, payments, packages, logs...). Passwords are never included. */
function DataExport() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (user?.role !== "owner") return null;
  const run = async () => {
    setBusy(true);
    try {
      await downloadFile("/settings/export", undefined, "isp-data-export.json");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Export all data">
      <p className="mb-4 text-sm text-zinc-600">
        Download a full copy of your ISP&apos;s data as JSON — customers, packages, payments, tickets, SMS and activity logs. Customer, staff and router passwords are not included. Large ISPs may take a minute.
      </p>
      <Button variant="secondary" loading={busy} onClick={run}>
        Download export
      </Button>
    </Card>
  );
}

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
        slaLow: s.ticket?.slaHours?.low ?? 72,
        slaMedium: s.ticket?.slaHours?.medium ?? 24,
        slaHigh: s.ticket?.slaHours?.high ?? 6,
        dailySummaryEmail: s.notifications?.dailySummaryEmail ?? true,
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
      ticket: { slaHours: { low: Number(v.slaLow), medium: Number(v.slaMedium), high: Number(v.slaHigh) } },
      notifications: { dailySummaryEmail: v.dailySummaryEmail },
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
            <p className="text-xs text-zinc-500">Each SMS uses credits from your SMS balance. Edit the texts under SMS → Templates.</p>
          </div>
        </Card>
        <Card title="Complaint SLA (hours to solve)">
          <div className="grid grid-cols-3 gap-4">
            <Input label="High priority" type="number" min={1} {...register("slaHigh")} />
            <Input label="Medium" type="number" min={1} {...register("slaMedium")} />
            <Input label="Low" type="number" min={1} {...register("slaLow")} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">Complaints past this time show as “SLA missed”. Applies to new complaints.</p>
        </Card>
        <Card title="Email">
          <Checkbox label="Daily summary email to the owner at 9 PM" hint="Collection, new and expired customers, open complaints" {...register("dailySummaryEmail")} />
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
      <div className="mt-6 max-w-2xl space-y-6">
        <CustomerLinks />
        <DataExport />
      </div>
    </div>
  );
}
