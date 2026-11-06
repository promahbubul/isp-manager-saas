"use client";

import { useForm, useWatch } from "react-hook-form";
import toast from "react-hot-toast";
import { Button, Card, Checkbox, Input, Select, Textarea } from "@/components/ui";
import { api, applyFieldErrors, getErrorMessage } from "@/lib/api";
import { toDateInput } from "@/lib/format";
import { useApi } from "@/lib/hooks";

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined));

/**
 * Create (customer = undefined) or edit a customer.
 * onSaved(responseData) is called after a successful save.
 */
export default function CustomerForm({ customer, onSaved }) {
  const isEdit = Boolean(customer);
  const packages = useApi(["packages", "active"], "/packages", { active: "true" });
  const zones = useApi("zones", "/zones");

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
      dueAmount: 0,
      onuMac: customer?.device?.onuMac ?? "",
      boxNo: customer?.device?.boxNo ?? "",
      port: customer?.device?.port ?? "",
      note: customer?.note ?? "",
    },
  });
  const e = formState.errors;
  const packageList = packages.data?.data ?? [];

  const onPackageChange = (ev) => {
    const pkg = packageList.find((p) => p._id === ev.target.value);
    if (pkg) setValue("monthlyFee", pkg.price);
  };

  const onSubmit = async (v) => {
    const { onuMac, boxNo, port, expiryDate, dueAmount, ...rest } = v;
    const body = clean({
      ...rest,
      monthlyFee: rest.monthlyFee === "" ? undefined : Number(rest.monthlyFee),
      discount: Number(rest.discount || 0),
      // Expiry is the end of the chosen day in Dhaka.
      expiryDate: expiryDate ? new Date(`${expiryDate}T23:59:59+06:00`).toISOString() : undefined,
      ...(isEdit ? {} : { dueAmount: Number(dueAmount || 0) }),
    });
    body.device = clean({ onuMac, boxNo, port });
    if (isEdit) {
      // Only send billing fields that changed, so saving the form never shifts the expiry time.
      if (expiryDate === toDateInput(customer.expiryDate)) delete body.expiryDate;
      if (v.isFree === (customer.status === "free")) delete body.isFree;
      if (v.pppoeUsername === customer.pppoe?.username) delete body.pppoeUsername;
      // allow clearing optional fields
      for (const k of ["altPhone", "email"]) if (!v[k] && customer?.[k]) body[k] = null;
      if (!v.zone && customer?.zone) body.zone = null;
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Card title="Personal information">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Input label="Full name" required error={e.name?.message} {...register("name")} />
          <Input label="Mobile" required placeholder="01XXXXXXXXX" error={e.phone?.message} {...register("phone")} />
          <Input label="Alternative mobile" error={e.altPhone?.message} {...register("altPhone")} />
          <Input label="Email" type="email" error={e.email?.message} {...register("email")} />
          <Input label="NID" error={e.nid?.message} {...register("nid")} />
          <Select
            label="Zone"
            placeholder="— No zone —"
            options={(zones.data?.data ?? []).map((z) => ({ value: z._id, label: z.parent ? `↳ ${z.name}` : z.name }))}
            error={e.zone?.message}
            {...register("zone")}
          />
          <Textarea label="Address" className="md:col-span-2 lg:col-span-3" error={e.address?.message} {...register("address")} />
        </div>
      </Card>

      <Card title="Connection">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Package"
            required
            placeholder={packages.isLoading ? "Loading..." : "— Select package —"}
            options={packageList.map((p) => ({ value: p._id, label: `${p.name} — ৳${p.price}` }))}
            error={e.package?.message}
            {...register("package", { onChange: onPackageChange })}
          />
          <Input label="PPPoE username" required error={e.pppoeUsername?.message} {...register("pppoeUsername")} />
          <Input
            label="PPPoE password"
            hint={isEdit ? "Leave empty to keep the current password" : "Leave empty to generate one"}
            error={e.pppoePassword?.message}
            {...register("pppoePassword")}
          />
          <Input label="ONU MAC" {...register("onuMac")} />
          <Input label="Box no." {...register("boxNo")} />
          <Input label="Port" {...register("port")} />
        </div>
      </Card>

      <Card title="Billing">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
          <div className="flex flex-col gap-3 pt-1">
            <Checkbox label="Free customer" hint="Never expires (staff, VIP)" {...register("isFree")} />
            <Checkbox label="Auto disable on expiry" {...register("autoDisable")} />
          </div>
          <Textarea label="Note" className="md:col-span-2 lg:col-span-3" {...register("note")} />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          {isEdit ? "Save changes" : "Create customer"}
        </Button>
      </div>
    </form>
  );
}
