"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import GatewaySettings from "@/components/payment/GatewaySettings";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button, ErrorBox, Loading } from "@/components/ui";
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
    <div className="pb-6">
      <SettingsSection
        first
        title="Payment link"
        description={
          <>
            Customers enter their customer ID (or PPPoE username) and mobile number, then pay with any method you turn on. Paid bills are recharged and reconnected automatically. Add{" "}
            <code className="rounded bg-subtle px-1 text-xs">{"{pay_link}"}</code> to your SMS templates.
          </>
        }
      >
        <div className="flex items-center gap-2">
          <code className="h-9 min-w-0 flex-1 truncate rounded-lg border border-line bg-subtle px-3 py-2 font-mono text-[13px] text-ink">{payLink}</code>
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(payLink).then(() => toast.success("Link copied"))}>
            <Copy /> Copy
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Gateways" description="Connect your own merchant accounts. Money goes straight to you — the platform never holds it.">
        <GatewaySettings
          gateways={data.data.gateways}
          webhookBase={data.data.webhookBase}
          save={(gateway, body) => api.put(`/settings/payment-gateways/${gateway}`, body)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["tenant-gateways"] })}
        />
      </SettingsSection>
    </div>
  );
}
