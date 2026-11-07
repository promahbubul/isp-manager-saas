"use client";

import { useState } from "react";
import { Badge, Button, Card, Checkbox, Input, Textarea } from "@/components/ui";
import { getErrorMessage } from "@/lib/api";
import { toast } from "sonner";

/**
 * One card per gateway: on/off, sandbox, credentials, instructions (manual).
 * `save(gateway, body)` → Promise; used by both the ISP settings page and the super admin.
 */
function GatewayCard({ g, save, webhookBase, onSaved }) {
  const [enabled, setEnabled] = useState(g.enabled);
  const [sandbox, setSandbox] = useState(g.sandbox);
  const [instructions, setInstructions] = useState(g.instructions ?? "");
  const [creds, setCreds] = useState(Object.fromEntries(g.fields.map((f) => [f.key, f.secret ? "" : (f.value ?? "")])));
  const [busy, setBusy] = useState(false);

  const submit = async (overrides = {}) => {
    setBusy(true);
    try {
      const body = { enabled, sandbox, credentials: creds, ...(g.gateway === "manual" ? { instructions } : {}), ...overrides };
      await save(g.gateway, body);
      toast.success(`${g.label.split(" (")[0]} saved`);
      onSaved?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
      if (overrides.enabled !== undefined) setEnabled(!overrides.enabled);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {g.label}
          {g.enabled ? <Badge color="green">on</Badge> : <Badge color="slate">off</Badge>}
          {g.enabled && g.sandbox && g.gateway !== "manual" && <Badge color="amber">sandbox</Badge>}
        </span>
      }
      actions={
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary-600"
            checked={enabled}
            disabled={busy}
            onChange={(e) => {
              setEnabled(e.target.checked);
              submit({ enabled: e.target.checked });
            }}
          />
          Enabled
        </label>
      }
    >
      <p className="mb-4 text-sm text-zinc-600">{g.help}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {g.fields.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            required={f.required}
            type={f.secret ? "password" : "text"}
            autoComplete="off"
            placeholder={f.secret && f.hint ? `Saved (${f.hint}) — leave empty to keep` : ""}
            value={creds[f.key]}
            onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
          />
        ))}
        {g.gateway === "manual" && (
          <Textarea
            className="sm:col-span-2"
            label="Instructions shown to payers"
            placeholder={"bKash/Nagad personal: 01XXXXXXXXX (Send Money)\nBank: ABC Bank, A/C 123456789"}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        )}
        {g.gateway !== "manual" && (
          <div className="sm:col-span-2">
            <Checkbox id={`sandbox-${g.gateway}`} label="Sandbox / test mode" hint="Turn off when you go live with real merchant credentials" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
          </div>
        )}
        {g.gateway === "stripe" && webhookBase && (
          <p className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-600 sm:col-span-2">
            Stripe webhook URL (event <code>checkout.session.completed</code>): <code className="break-all">{webhookBase}</code>
          </p>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" loading={busy} onClick={() => submit()}>
          Save
        </Button>
      </div>
    </Card>
  );
}

export default function GatewaySettings({ gateways, save, webhookBase, onSaved }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {gateways.map((g) => (
        <GatewayCard key={`${g.gateway}-${g.enabled}-${g.configured}`} g={g} save={save} webhookBase={webhookBase} onSaved={onSaved} />
      ))}
    </div>
  );
}
