"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { SettingsList, SettingsSection } from "@/components/settings/SettingsSection";
import { Button, Input, Select, Switch, Textarea } from "@/components/ui";
import { api, applyFieldErrors, getErrorMessage } from "@/lib/api";
import { toDateInput } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined));

/**
 * Create (customer = undefined) or edit a customer.
 * onSaved(responseData) is called after a successful save.
 */
export default function CustomerForm({ customer, onSaved }) {
  const isEdit = Boolean(customer);
  const router = useRouter();
  const packages = useApi(["packages", "active"], "/packages", { active: "true" });
  const zones = useApi("zones", "/zones");
  const { user, can, subscription } = useAuth();
  const resellers = useApi(["resellers", "all"], "/resellers", { limit: 100 }, { enabled: can("reseller.view") && (subscription?.plan?.features ?? []).includes("reseller") });

  const { register, handleSubmit, setError, control, setValue, formState } = useForm({
    defaultValues: {
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      altPhone: customer?.altPhone ?? "",
      email: customer?.email ?? "",
      nid: customer?.nid ?? "",
      address: customer?.address ?? "",
      zone: customer?.zone?._id ?? customer?.zone ?? "",
      pppoeUsername: customer?.pppoe?.username ?? "",
      pppoePassword: "",
      package: customer?.package?._id ?? customer?.package ?? "",
      monthlyFee: customer?.monthlyFee ?? "",
      discount: customer?.discount ?? 0,
      expiryDate: toDateInput(customer?.expiryDate),
      isFree: customer?.status === "free",
      autoDisable: customer?.autoDisable ?? true,
      billingType: customer?.billingType ?? "prepaid",
      reseller: customer?.reseller?._id ?? customer?.reseller ?? "",
      dueAmount: 0,
      onuMac: customer?.device?.onuMac ?? "",
      boxNo: customer?.device?.boxNo ?? "",
      port: customer?.device?.port ?? "",
      fiberLength: customer?.device?.fiberLength ?? "",
      note: customer?.note ?? "",
    },
  });
  const e = formState.errors;
  const packageList = packages.data?.data ?? [];
  const resellerList = (resellers.data?.data ?? []).filter((r) => r.isActive);

  const onPackageChange = (ev) => {
    const pkg = packageList.find((p) => p._id === ev.target.value);
    if (pkg) setValue("monthlyFee", pkg.price);
  };

  const onSubmit = async (v) => {
    const { onuMac, boxNo, port, fiberLength, expiryDate, dueAmount, ...rest } = v;
    const body = clean({
      ...rest,
      monthlyFee: rest.monthlyFee === "" ? undefined : Number(rest.monthlyFee),
      discount: Number(rest.discount || 0),
      // Expiry is the end of the chosen day in Dhaka.
      expiryDate: expiryDate ? new Date(`${expiryDate}T23:59:59+06:00`).toISOString() : undefined,
      ...(isEdit ? {} : { dueAmount: Number(dueAmount || 0) }),
    });
    body.device = clean({ onuMac, boxNo, port, fiberLength: fiberLength === "" ? undefined : Number(fiberLength) });
    if (isEdit) {
      // Only send billing fields that changed, so saving the form never shifts the expiry time.
      if (expiryDate === toDateInput(customer.expiryDate)) delete body.expiryDate;
      if (v.isFree === (customer.status === "free")) delete body.isFree;
      if (v.pppoeUsername === customer.pppoe?.username) delete body.pppoeUsername;
      // allow clearing optional fields
      for (const k of ["altPhone", "email"]) if (!v[k] && customer?.[k]) body[k] = null;
      if (!v.zone && customer?.zone) body.zone = null;
      if (!v.reseller && customer?.reseller) body.reseller = null;
    }
    try {
      const res = isEdit ? await api.patch(`/customers/${customer._id}`, body) : await api.post("/customers", body);
      const msg = res.data.message;
      if (/sync failed/i.test(msg)) toast.error(msg, { duration: 7000 });
      else toast.success(msg);
      onSaved?.(res.data.data);
    } catch (err) {
      if (!applyFieldErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  };

  const isFree = useWatch({ control, name: "isFree" });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SettingsSection first title="Personal information" description="Who the customer is and where the connection is.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Full name" required className="sm:col-span-2" error={e.name?.message} {...register("name")} />
          <Input label="Mobile" required placeholder="01XXXXXXXXX" error={e.phone?.message} {...register("phone")} />
          <Input label="Alternative mobile" placeholder="Optional" error={e.altPhone?.message} {...register("altPhone")} />
          <Input label="Email" type="email" placeholder="Optional" error={e.email?.message} {...register("email")} />
          <Input label="NID" placeholder="Optional" error={e.nid?.message} {...register("nid")} />
          <Select
            label="Zone"
            className="sm:col-span-2"
            placeholder="— No zone —"
            options={(zones.data?.data ?? []).map((z) => ({ value: z._id, label: z.parent ? `↳ ${z.name}` : z.name }))}
            error={e.zone?.message}
            {...register("zone")}
          />
          <Textarea label="Address" className="sm:col-span-2" error={e.address?.message} {...register("address")} />
        </div>
      </SettingsSection>

      <SettingsSection title="Connection" description="The PPPoE account on your MikroTik and the fibre details.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Package"
            required
            className="sm:col-span-2"
            placeholder={packages.isLoading ? "Loading..." : "— Select package —"}
            options={packageList.map((p) => ({ value: p._id, label: `${p.name} — ৳${p.price}` }))}
            error={e.package?.message}
            {...register("package", { onChange: onPackageChange })}
          />
          <Input label="PPPoE username" required autoComplete="off" error={e.pppoeUsername?.message} {...register("pppoeUsername")} />
          <Input
            label="PPPoE password"
            autoComplete="new-password"
            hint={isEdit ? "Leave empty to keep the current password" : "Leave empty to generate one"}
            error={e.pppoePassword?.message}
            {...register("pppoePassword")}
          />
          <Input label="ONU MAC" placeholder="AA:BB:CC:DD:EE:FF" {...register("onuMac")} />
          <Input label="Fiber length (m)" type="number" {...register("fiberLength")} />
          <Input label="Box no." {...register("boxNo")} />
          <Input label="Port" {...register("port")} />
        </div>
      </SettingsSection>

      <SettingsSection title="Billing" description="How much the customer pays and when the connection expires.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Monthly fee (৳)" type="number" step="0.01" hint="Defaults to the package price" error={e.monthlyFee?.message} {...register("monthlyFee")} />
          <Input label="Monthly discount (৳)" type="number" step="0.01" error={e.discount?.message} {...register("discount")} />
          <Input
            label="Expiry date"
            type="date"
            disabled={isFree}
            hint={isEdit ? "Changing this re-enables or disables the connection" : "For existing customers. Empty = must recharge first."}
            error={e.expiryDate?.message}
            {...register("expiryDate")}
          />
          {!isEdit && (
            <Input label="Previous due (৳)" type="number" step="0.01" hint="Unpaid amount when migrating" error={e.dueAmount?.message} {...register("dueAmount")} />
          )}
          <Select
            label="Billing type"
            hint="Postpaid: invoice on the 1st, cut off when an invoice is overdue"
            options={[
              { value: "prepaid", label: "Prepaid (pay first)" },
              { value: "postpaid", label: "Postpaid (monthly invoice)" },
            ]}
            {...register("billingType")}
          />
          {resellerList.length > 0 && user?.role !== "reseller" && (
            <Select label="Reseller" placeholder="— Own customer —" options={resellerList.map((r) => ({ value: r._id, label: r.name }))} {...register("reseller")} />
          )}
        </div>
        <SettingsList className="mt-6 border-t border-line pt-5">
          <Switch label="Free customer" hint="Never expires — for staff or VIP connections." {...register("isFree")} />
          <Switch label="Auto-disable on expiry" hint="Cut the connection automatically when the package runs out." {...register("autoDisable")} />
        </SettingsList>
      </SettingsSection>

      <SettingsSection title="Note" description="Only your staff can see this.">
        <Textarea aria-label="Note" placeholder="Anything your team should know…" {...register("note")} />
      </SettingsSection>

      <div className="sticky bottom-4 z-20 mt-2">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow-pop)] backdrop-blur">
          <span className="mr-auto hidden text-sm text-muted sm:block">{isEdit ? "Changes sync to the router when you save." : "The PPPoE account is created on the router."}</span>
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" loading={formState.isSubmitting}>
            {isEdit ? "Save changes" : "Create customer"}
          </Button>
        </div>
      </div>
    </form>
  );
}
