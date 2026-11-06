"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button, Card, ErrorBox, Input, Loading, Select, Textarea } from "@/components/ui";
import { api, applyFieldErrors } from "@/lib/api";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const LICENSE = ["nationwide", "divisional", "district", "upazila"].map((v) => ({ value: v, label: v }));

export default function CompanyProfileForm() {
  const { reload } = useAuth();
  const { data, isLoading, error } = useApi("company-profile", "/settings/company");
  const { register, handleSubmit, reset, setError, formState } = useForm();
  const save = useApiMutation((body) => api.patch("/settings/company", body), {
    invalidate: ["company-profile", "dashboard"],
    onSuccess: () => reload().catch(() => undefined),
  });

  useEffect(() => {
    const c = data?.data;
    if (c) {
      reset({
        name: c.name ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
        address: c.address ?? "",
        district: c.district ?? "",
        btrcLicenseNo: c.btrcLicenseNo ?? "",
        licenseType: c.licenseType ?? "",
        logo: c.logo ?? "",
        portalColor: c.portalTheme?.primaryColor ?? "#2563eb",
      });
    }
  }, [data, reset]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const e = formState.errors;

  const onSubmit = ({ licenseType, ...v }) =>
    save.mutateAsync({ ...v, ...(licenseType ? { licenseType } : {}) }).catch((err) => applyFieldErrors(err, setError));

  return (
    <Card title="Company profile">
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Company name" required error={e.name?.message} {...register("name")} />
        <Input label="Subdomain" value={data.data.slug} disabled hint="Cannot be changed" />
        <Input label="Helpline mobile" required error={e.phone?.message} {...register("phone")} />
        <Input label="Email" type="email" required error={e.email?.message} {...register("email")} />
        <Textarea label="Office address" className="sm:col-span-2" error={e.address?.message} {...register("address")} />
        <Input label="District" error={e.district?.message} {...register("district")} />
        <Input label="BTRC licence no." error={e.btrcLicenseNo?.message} {...register("btrcLicenseNo")} />
        <Select label="Licence type" placeholder="—" options={LICENSE} {...register("licenseType")} />
        <Input label="Brand colour" type="color" error={e.portalColor?.message} {...register("portalColor")} />
        <Input label="Logo URL" placeholder="https://..." className="sm:col-span-2" hint="Upload your logo anywhere public and paste the link (file upload comes later)" error={e.logo?.message} {...register("logo")} />
        <div className="sm:col-span-2">
          <Button type="submit" loading={save.isPending}>
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}
