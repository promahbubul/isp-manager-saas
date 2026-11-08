"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { Copy, Download } from "lucide-react";
import CompanyProfileForm from "@/components/settings/CompanyProfileForm";
import { LockedNote, SaveBar, SettingsList, SettingsSection } from "@/components/settings/SettingsSection";
import { Button, ErrorBox, Input, Loading, Switch } from "@/components/ui";
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
    { feature: "customer_portal", label: "Customer portal", hint: "Customers log in with an SMS code", url: `${origin}/portal/${company.slug}` },
    { feature: "online_payment", label: "Online bill payment", hint: "Customers pay with their ID and mobile number", url: `${origin}/pay/${company.slug}` },
  ];
  const copy = (url) => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"));
  return (
    <SettingsSection
      title="Customer links"
      description={
        <>
          Share these on Facebook, in SMS or on printed receipts. Reminder and expiry SMS include the pay link automatically; add <code className="rounded bg-subtle px-1 text-xs">{"{portal_link}"}</code> to a template for the portal.
        </>
      }
    >
      <SettingsList>
        {links.map((l) => (
          <div key={l.url}>
            <p className="text-sm font-medium text-ink">{l.label}</p>
            <p className="text-sm text-muted">{l.hint}</p>
            {features.includes(l.feature) ? (
              <div className="mt-2 flex items-center gap-2">
                <code className="h-9 min-w-0 flex-1 truncate rounded-lg border border-line bg-subtle px-3 py-2 font-mono text-[13px] text-ink">{l.url}</code>
                <Button variant="secondary" onClick={() => copy(l.url)}>
                  <Copy /> Copy
                </Button>
              </div>
            ) : (
              <div className="mt-2">
                <LockedNote>Not in your plan — upgrade under My subscription.</LockedNote>
              </div>
            )}
          </div>
        ))}
      </SettingsList>
    </SettingsSection>
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
    <SettingsSection title="Export data" description="A full copy of your ISP's data as one JSON file. Customer, staff and router passwords are never included.">
      <p className="mb-4 text-sm text-muted">Includes customers, packages, payments, tickets, SMS and activity logs. Large ISPs may take a minute.</p>
      <Button variant="secondary" loading={busy} onClick={run}>
        {!busy && <Download />} Download export
      </Button>
    </SettingsSection>
  );
}

const toForm = (s) => ({
  graceDays: s.billing?.graceDays ?? 0,
  autoDisable: s.billing?.autoDisable ?? true,
  header: s.receipt?.header ?? "",
  footer: s.receipt?.footer ?? "",
  sms: {
    welcome: false,
    payment_success: false,
    expiry_reminder: false,
    expired: false,
    ticket_update: false,
    ...(s.sms?.autoEvents ?? {}),
  },
  reminderDaysBefore: s.sms?.reminderDaysBefore ?? 3,
  slaLow: s.ticket?.slaHours?.low ?? 72,
  slaMedium: s.ticket?.slaHours?.medium ?? 24,
  slaHigh: s.ticket?.slaHours?.high ?? 6,
  dailySummaryEmail: s.notifications?.dailySummaryEmail ?? true,
});

/** Number input with a unit shown inside the field ("days", "hours"). */
function UnitInput({ unit, className, ...props }) {
  return (
    <div className={className}>
      <div className="relative">
        <Input type="number" style={{ paddingRight: "3.75rem" }} {...props} />
        <span className="pointer-events-none absolute bottom-0 right-3 flex h-9 items-center text-sm text-muted">{unit}</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data, isLoading, error } = useApi("settings", "/settings");
  const { register, handleSubmit, reset, control, formState } = useForm();
  const save = useApiMutation((body) => api.patch("/settings", body), { invalidate: ["settings"] });
  const reminderOn = useWatch({ control, name: "sms.expiry_reminder" });
  const autoDisable = useWatch({ control, name: "autoDisable" });

  useEffect(() => {
    if (data?.data) reset(toForm(data.data));
  }, [data, reset]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const onSubmit = (v) =>
    save
      .mutateAsync({
        billing: { graceDays: Number(v.graceDays), autoDisable: v.autoDisable },
        receipt: { header: v.header, footer: v.footer },
        sms: { autoEvents: v.sms, reminderDaysBefore: Number(v.reminderDaysBefore) },
        ticket: { slaHours: { low: Number(v.slaLow), medium: Number(v.slaMedium), high: Number(v.slaHigh) } },
        notifications: { dailySummaryEmail: v.dailySummaryEmail },
      })
      .then(() => reset(v))
      .catch(() => undefined);

  return (
    <div className="pb-6">
      <CompanyProfileForm />

      <form onSubmit={handleSubmit(onSubmit)}>
        <SettingsSection title="Billing" description="What happens when a customer's package expires.">
          <SettingsList>
            <Switch label="Auto-disable expired customers" hint="Checked every 15 minutes. Turn off to cut connections manually." {...register("autoDisable")} />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Grace period</p>
                <p className="text-sm text-muted">Days the connection keeps working after expiry{autoDisable ? "" : " (only used when auto-disable is on)"}.</p>
              </div>
              <UnitInput unit="days" className="w-full sm:w-36" min={0} max={30} {...register("graceDays")} />
            </div>
          </SettingsList>
        </SettingsSection>

        <SettingsSection
          title="Automatic SMS"
          description={
            <>
              Messages sent to customers on these events. Each SMS uses credits from your balance. Edit the wording under <span className="font-medium text-ink">SMS → Templates</span>.
            </>
          }
        >
          <SettingsList>
            <Switch label="Welcome" hint="New customers get their PPPoE username and password." {...register("sms.welcome")} />
            <Switch label="Payment received" hint="Confirmation with amount and new expiry date." {...register("sms.payment_success")} />
            <div>
              <Switch label="Expiry reminder" hint="A heads-up before the package runs out, with the pay link." {...register("sms.expiry_reminder")} />
              {reminderOn && (
                <div className="mt-3 flex items-center gap-3 border-l-2 border-line pl-4">
                  <span className="text-sm text-muted">Send</span>
                  <UnitInput unit="days" className="w-32" min={1} max={10} aria-label="Days before expiry" {...register("reminderDaysBefore")} />
                  <span className="text-sm text-muted">before expiry</span>
                </div>
              )}
            </div>
            <Switch label="Connection expired" hint="Sent when the connection is disabled." {...register("sms.expired")} />
            <Switch label="Complaint solved" hint="Sent when a ticket is marked solved." {...register("sms.ticket_update")} />
          </SettingsList>
        </SettingsSection>

        <SettingsSection title="Complaint SLA" description="Target time to solve a complaint. Late complaints are marked “SLA missed”. Applies to new complaints.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <UnitInput label="High priority" unit="hours" min={1} {...register("slaHigh")} />
            <UnitInput label="Medium priority" unit="hours" min={1} {...register("slaMedium")} />
            <UnitInput label="Low priority" unit="hours" min={1} {...register("slaLow")} />
          </div>
        </SettingsSection>

        <SettingsSection title="Email notifications" description="Reports sent to the owner's email address.">
          <Switch label="Daily summary at 9 PM" hint="Today's collection, new and expired customers, and open complaints." {...register("dailySummaryEmail")} />
        </SettingsSection>

        <SettingsSection title="Money receipt" description="Extra lines printed at the top and bottom of every receipt.">
          <div className="space-y-4">
            <Input label="Header line" placeholder="e.g. Licensed ISP — BTRC No. ..." {...register("header")} />
            <Input label="Footer line" placeholder="e.g. Thank you! Hotline: 01XXXXXXXXX" {...register("footer")} />
          </div>
        </SettingsSection>

        <SaveBar dirty={formState.isDirty} saving={save.isPending} onReset={() => reset(toForm(data.data))} />
      </form>

      <CustomerLinks />
      <DataExport />
    </div>
  );
}
