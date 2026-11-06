"use client";

import { useQueryClient } from "@tanstack/react-query";
import GatewaySettings from "@/components/payment/GatewaySettings";
import { ErrorBox, Loading, PageHeader } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi } from "@/lib/adminHooks";

export default function AdminGatewaysPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useAdminApi("gateways", "/admin/gateways");
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div>
      <PageHeader title="Platform payment gateways" subtitle="What ISPs can use to pay for subscriptions and SMS credits. Turn each one on or off." />
      <GatewaySettings
        gateways={data.data.gateways}
        webhookBase={data.data.webhookBase}
        save={(gateway, body) => adminApi.put(`/admin/gateways/${gateway}`, body)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "gateways"] })}
      />
    </div>
  );
}
