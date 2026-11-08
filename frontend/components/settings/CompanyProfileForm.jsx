"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { ImageUp } from "lucide-react";
import { toast } from "sonner";
import { ErrorBox, Input, Loading, Select, Textarea } from "@/components/ui";
import { FormFooter, SettingsSection } from "@/components/settings/SettingsSection";
import { api, applyFieldErrors, getErrorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const LICENSE = [
  { value: "nationwide", label: "Nationwide" },
  { value: "divisional", label: "Divisional" },
  { value: "district", label: "District" },
  { value: "upazila", label: "Upazila" },
];

/** Logo upload — saves immediately, independent of the profile form. */
function LogoUpload() {
  const { company, reload } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/settings/company/logo", fd);
      toast.success("Logo updated");
      qc.invalidateQueries({ queryKey: ["company-profile"] });
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-4">
      {company?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded file on the API host
        <img src={company.logo} alt="Company logo" className="size-16 rounded-lg border border-line bg-surface object-contain p-1" />
      ) : (
        <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted">No logo</div>
      )}
      <div>
        <label className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-subtle", busy && "pointer-events-none opacity-60")}>
          <ImageUp className="size-4" />
          {busy ? "Uploading…" : company?.logo ? "Change logo" : "Upload logo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <p className="mt-1.5 text-xs text-muted">PNG, JPG or WebP, up to 1 MB.</p>
      </div>
    </div>
  );
}

export default function CompanyProfileForm() {
  const { reload } = useAuth();
  const { data, isLoading, error } = useApi("company-profile", "/settings/company");
  const { register, handleSubmit, reset, setError, formState } = useForm();
  const save = useApiMutation((body) => api.patch("/settings/company", body), {
    invalidate: ["company-profile", "dashboard"],
    onSuccess: () => reload().catch(() => undefined),
  });

  const toForm = (c) => ({
    name: c.name ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    district: c.district ?? "",
    btrcLicenseNo: c.btrcLicenseNo ?? "",
    licenseType: c.licenseType ?? "",
    portalColor: c.portalTheme?.primaryColor ?? "#2563eb",
  });

  useEffect(() => {
    if (data?.data) reset(toForm(data.data));
  }, [data, reset]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const e = formState.errors;

  const onSubmit = ({ licenseType, ...v }) =>
    save
      .mutateAsync({ ...v, ...(licenseType ? { licenseType } : {}) })
      .then(() => reset({ licenseType, ...v }))
      .catch((err) => applyFieldErrors(err, setError));

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SettingsSection first title="Company profile" description="Your business details. They appear on money receipts, the customer portal and the payment page.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Company name" required error={e.name?.message} {...register("name")} />
          <Input label="Subdomain" value={data.data.slug} disabled readOnly hint="Set at signup and cannot be changed." />
          <Input label="Helpline mobile" required placeholder="01XXXXXXXXX" error={e.phone?.message} {...register("phone")} />
          <Input label="Email" type="email" required error={e.email?.message} {...register("email")} />
          <Textarea label="Office address" className="sm:col-span-2" error={e.address?.message} {...register("address")} />
          <Input label="District" error={e.district?.message} {...register("district")} />
        </div>
      </SettingsSection>

      <SettingsSection title="Licence" description="Your BTRC ISP licence. It is printed on receipts.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="BTRC licence no." error={e.btrcLicenseNo?.message} {...register("btrcLicenseNo")} />
          <Select label="Licence type" placeholder="Select…" options={LICENSE} {...register("licenseType")} />
        </div>
      </SettingsSection>

      <SettingsSection title="Branding" description="Your logo and colour on the customer portal, the payment page and receipts.">
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Logo</p>
            <LogoUpload />
          </div>
          <div className="flex items-end gap-3">
            <Input label="Brand colour" type="color" className="w-24" error={e.portalColor?.message} {...register("portalColor")} />
            <p className="pb-2 text-xs text-muted">Used for buttons and highlights on your customer pages.</p>
          </div>
        </div>
        <div className="mt-8">
          <FormFooter dirty={formState.isDirty} saving={save.isPending} onReset={() => reset(toForm(data.data))} label="Save profile" />
        </div>
      </SettingsSection>
    </form>
  );
}
