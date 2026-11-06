"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button, Card, ErrorBox, Input, Loading, PageHeader } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";

export default function AdminSettingsPage() {
  const { data, isLoading, error } = useAdminApi("settings", "/admin/settings");
  const { register, handleSubmit, reset } = useForm();
  const save = useAdminMutation((body) => adminApi.patch("/admin/settings", body), { invalidate: ["settings"] });

  useEffect(() => {
    if (data?.data) reset(data.data);
  }, [data, reset]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  return (
    <div>
      <PageHeader title="Platform settings" />
      <form
        onSubmit={handleSubmit((v) =>
          save.mutate({ smsCreditPriceBDT: Number(v.smsCreditPriceBDT), smsCreditPriceUSD: Number(v.smsCreditPriceUSD), graceDays: Number(v.graceDays) }),
        )}
        className="max-w-xl space-y-6"
      >
        <Card title="SMS credit price">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Per credit (৳)" type="number" step="0.01" {...register("smsCreditPriceBDT")} />
            <Input label="Per credit ($, Stripe)" type="number" step="0.0001" {...register("smsCreditPriceUSD")} />
          </div>
        </Card>
        <Card title="Subscription">
          <Input label="Grace days after a period ends" hint="ISPs stay writable (past due) for this many days, then get suspended" type="number" {...register("graceDays")} />
        </Card>
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </form>
    </div>
  );
}
