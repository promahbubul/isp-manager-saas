"use client";

import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import GatewaySettings from "@/components/payment/GatewaySettings";
import { Button, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

export default function PaymentGatewaysPage() {
  const qc = useQueryClient();
  const { company } = useAuth();
  const { data, isLoading, error } = useApi("tenant-gateways", "/settings/payment-gateways");
  const payLink = typeof window !== "undefined" && company ? `${window.location.origin}/pay/${company.slug}` : "";

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Payment gateways" subtitle="How your customers can pay their bills online. Money goes straight to your merchant account." />
      <Card title="Your customer payment link">
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded bg-slate-100 px-3 py-2 text-sm">{payLink}</code>
          <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(payLink).then(() => toast.success("Copied"))}>
            Copy
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Customers enter their customer ID (or PPPoE username) and mobile number, then pay with any method you turned on. Paid bills are
          recharged and reconnected automatically. Add <code>{"{pay_link}"}</code> to your SMS templates.
        </p>
      </Card>
      <GatewaySettings
        gateways={data.data.gateways}
        webhookBase={data.data.webhookBase}
        save={(gateway, body) => api.put(`/settings/payment-gateways/${gateway}`, body)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["tenant-gateways"] })}
      />
    </div>
  );
}
