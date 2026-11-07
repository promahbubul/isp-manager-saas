"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Checkbox, ErrorBox, Input, Loading, PageHeader, Select, Table } from "@/components/ui";
import { api, getErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const locked = (err) => err?.response?.data?.details?.code === "feature_locked";

/** Card that shows "not in your plan" instead of an error when the feature is locked. */
function FeatureCard({ title, query, children }) {
  if (query.isLoading) return <Card title={title}><Loading /></Card>;
  if (locked(query.error)) {
    return (
      <Card title={title}>
        <p className="text-sm text-zinc-500">🔒 {query.error.response.data.message}</p>
      </Card>
    );
  }
  if (query.error) return <Card title={title}><ErrorBox error={query.error} /></Card>;
  return <Card title={title}>{children}</Card>;
}

function LogoCard() {
  const { company, reload } = useAuth();
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/settings/company/logo", fd);
      toast.success("Logo updated");
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Logo">
      <div className="flex items-center gap-4">
        {company?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded file on the API host
          <img src={company.logo} alt="Logo" className="h-16 w-16 rounded border border-zinc-200 object-contain" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-zinc-300 text-xs text-zinc-400">no logo</div>
        )}
        <label className={`cursor-pointer rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 ${busy ? "opacity-60" : ""}`}>
          {busy ? "Uploading…" : "Upload PNG / JPG / WebP (max 1 MB)"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Shown on receipts, the customer portal and the payment page.</p>
    </Card>
  );
}

/** Labels and help for each SMS provider's fields (the server decides which fields exist). */
const SMS_PROVIDERS = {
  putulhost: { label: "PutulHost (WO SMS)", help: "Bangladesh. Get the username and API key from your PutulHost SMS panel, and whitelist this server's IP there, otherwise sending fails with “IP Black List.”" },
  twilio: { label: "Twilio", help: "International. Account SID and Auth Token from the Twilio console; From = your Twilio number or alphanumeric sender." },
  vonage: { label: "Vonage (Nexmo)", help: "International. API key and secret from the Vonage dashboard; From = sender name or number." },
  plivo: { label: "Plivo", help: "International. Auth ID and Auth Token from the Plivo console; From = your Plivo number or sender ID." },
  http: { label: "Other (any HTTP API)", help: "Any gateway with a GET/POST URL, e.g. BulkSMSBD, Alpha SMS, Greenweb. Use {to} {message} {apiKey} {senderId} in the URL." },
};
const FIELD_LABELS = {
  userName: "Username",
  apiKey: "API key",
  senderName: "Sender ID (masking)",
  transactionType: "Message type",
  accountSid: "Account SID",
  authToken: "Auth token",
  from: "From (sender)",
  apiSecret: "API secret",
  authId: "Auth ID",
  httpUrl: "Gateway URL",
  httpMethod: "Method",
  successPattern: "Success pattern (regex on the response)",
  senderId: "Sender ID",
};

function SmsGatewayCard() {
  const q = useApi("own-sms", "/settings/sms-gateway", undefined, { retry: false });
  const specs = useApi("sms-providers", "/settings/sms-gateway/providers");
  const [f, setF] = useState(null);
  const [to, setTo] = useState("");
  const save = useApiMutation((b) => api.put("/settings/sms-gateway", b), { invalidate: ["own-sms"] });
  const test = useApiMutation(() => api.post("/settings/sms-gateway/test", { to }), { invalidate: ["own-sms"] });
  const balance = useApiMutation(() => api.get("/settings/sms-gateway/balance"), { successToast: false, onSuccess: (r) => toast(r.data.balance ? `Balance: ${r.data.balance}` : "This provider does not report a balance") });
  const cur = q.data?.data;
  const v = f ?? { enabled: cur?.enabled ?? false, provider: cur?.provider ?? "putulhost", fields: { ...(cur?.options ?? {}) } };
  const spec = specs.data?.data?.[v.provider];
  const secrets = new Set(spec?.credentials ?? []);
  const saved = new Set(cur?.provider === v.provider ? (cur?.savedSecrets ?? []) : []);
  const setField = (k) => (e) => setF({ ...v, fields: { ...v.fields, [k]: e.target.value } });

  const input = (k) => {
    if (k === "transactionType") {
      return <Select key={k} label={FIELD_LABELS[k]} value={v.fields[k] ?? "T"} onChange={setField(k)} options={[{ value: "T", label: "Transactional (bills, OTP)" }, { value: "P", label: "Promotional (offers)" }]} />;
    }
    if (k === "httpMethod") {
      return <Select key={k} label={FIELD_LABELS[k]} value={v.fields[k] ?? "GET"} onChange={setField(k)} options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST (form)" }]} />;
    }
    return (
      <Input
        key={k}
        className={k === "httpUrl" ? "sm:col-span-2" : ""}
        label={`${FIELD_LABELS[k] ?? k}${spec?.required.includes(k) ? " *" : ""}`}
        type={secrets.has(k) ? "password" : "text"}
        placeholder={secrets.has(k) && saved.has(k) ? "•••• saved (leave empty to keep)" : k === "httpUrl" ? "https://bulksmsbd.net/api/smsapi?api_key={apiKey}&type=text&number={to}&senderid={senderId}&message={message}" : ""}
        value={v.fields[k] ?? ""}
        onChange={setField(k)}
      />
    );
  };

  return (
    <FeatureCard title="SMS gateway" query={q}>
      <p className="mb-4 text-sm text-zinc-600">Connect your own SMS account. All your SMS (automatic, bulk and login codes) then go through it and no platform SMS credits are used.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Provider"
          className="sm:col-span-2"
          value={v.provider}
          onChange={(e) => setF({ ...v, provider: e.target.value, fields: e.target.value === cur?.provider ? { ...(cur?.options ?? {}) } : {} })}
          options={Object.entries(SMS_PROVIDERS).map(([value, p]) => ({ value, label: p.label }))}
        />
        <p className="text-xs text-zinc-500 sm:col-span-2">{SMS_PROVIDERS[v.provider]?.help}</p>
        {spec ? [...spec.options, ...spec.credentials].map(input) : <Loading />}
        <div className="sm:col-span-2">
          <Checkbox label="Send all my SMS through this gateway" checked={v.enabled} onChange={(e) => setF({ ...v, enabled: e.target.checked })} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Button loading={save.isPending} onClick={() => save.mutate(v)}>
          Save
        </Button>
        {cur && (
          <>
            <Input label="Test to" placeholder="01XXXXXXXXX" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button variant="secondary" loading={test.isPending} disabled={!to} onClick={() => test.mutate()}>
              Send test
            </Button>
            <Button variant="secondary" loading={balance.isPending} onClick={() => balance.mutate()}>
              Check balance
            </Button>
            {cur.lastTestAt && <Badge color={cur.lastTestOk ? "green" : "red"}>{`last test ${cur.lastTestOk ? "ok" : `failed: ${cur.lastTestError ?? ""}`} · ${formatDateTime(cur.lastTestAt)}`}</Badge>}
          </>
        )}
      </div>
    </FeatureCard>
  );
}

const WA_EVENTS = [
  ["welcome", "New connection"],
  ["payment_success", "Payment received"],
  ["expiry_reminder", "Expiry reminder"],
  ["expired", "Expired"],
  ["ticket_update", "Complaint update"],
];

function WhatsAppCard() {
  const q = useApi("whatsapp", "/settings/whatsapp", undefined, { retry: false });
  const [f, setF] = useState(null);
  const save = useApiMutation((b) => api.put("/settings/whatsapp", b), { invalidate: ["whatsapp"] });
  const cur = q.data?.data;
  const v = f ?? {
    enabled: cur?.enabled ?? false,
    phoneNumberId: cur?.phoneNumberId ?? "",
    accessToken: "",
    events: Object.fromEntries(WA_EVENTS.map(([e]) => [e, { template: cur?.events?.[e]?.template ?? "", language: cur?.events?.[e]?.language ?? "bn", params: (cur?.events?.[e]?.params ?? []).join(", ") }])),
  };
  const setEv = (e, k) => (ev) => setF({ ...v, events: { ...v.events, [e]: { ...v.events[e], [k]: ev.target.value } } });
  const submit = () =>
    save.mutate({
      enabled: v.enabled,
      phoneNumberId: v.phoneNumberId,
      accessToken: v.accessToken || undefined,
      events: Object.fromEntries(
        Object.entries(v.events)
          .filter(([, t]) => t.template)
          .map(([e, t]) => [e, { template: t.template, language: t.language || "bn", params: t.params.split(",").map((s) => s.trim()).filter(Boolean) }]),
      ),
    });
  return (
    <FeatureCard title="WhatsApp notifications" query={q}>
      <p className="mb-4 text-sm text-zinc-600">
        Uses the official WhatsApp Cloud API. Create message templates in Meta WhatsApp Manager, wait for approval, then enter their names here. Variables fill {"{{1}}, {{2}}"}… in the order you list them.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Phone number ID" value={v.phoneNumberId} onChange={(e) => setF({ ...v, phoneNumberId: e.target.value })} />
        <Input label="Permanent access token" type="password" placeholder={cur?.hasAccessToken ? "•••• saved" : ""} value={v.accessToken} onChange={(e) => setF({ ...v, accessToken: e.target.value })} />
      </div>
      <Table
        rowKey="e"
        rows={WA_EVENTS.map(([e, label]) => ({ e, label }))}
        columns={[
          { key: "label", header: "Event" },
          { key: "t", header: "Template name", render: (r) => <input className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" value={v.events[r.e].template} onChange={setEv(r.e, "template")} placeholder="payment_received_v1" /> },
          { key: "l", header: "Language", render: (r) => <input className="w-16 rounded border border-zinc-300 px-2 py-1 text-sm" value={v.events[r.e].language} onChange={setEv(r.e, "language")} /> },
          { key: "p", header: "Variables in order", render: (r) => <input className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" value={v.events[r.e].params} onChange={setEv(r.e, "params")} placeholder="name, amount, expiry" /> },
        ]}
      />
      <div className="mt-4 flex items-center gap-4">
        <Checkbox label="Send WhatsApp together with the automatic SMS" checked={v.enabled} onChange={(e) => setF({ ...v, enabled: e.target.checked })} />
        <Button loading={save.isPending} onClick={submit}>
          Save
        </Button>
      </div>
    </FeatureCard>
  );
}

const SCOPES = ["customers:read", "customers:write", "payments:read", "payments:write"];

function ApiKeysCard() {
  const q = useApi("api-keys", "/settings/api-keys", undefined, { retry: false });
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(["customers:read"]);
  const [shown, setShown] = useState(null);
  const create = useApiMutation(() => api.post("/settings/api-keys", { name, scopes }), { invalidate: ["api-keys"], onSuccess: (r) => setShown(r.data.key) });
  const revoke = useApiMutation((id) => api.delete(`/settings/api-keys/${id}`), { invalidate: ["api-keys"] });
  return (
    <FeatureCard title="API keys" query={q}>
      <p className="mb-4 text-sm text-zinc-600">
        For your website, accounting software or payment kiosk. Base URL: <code>https://&lt;your API domain&gt;/api/v1/public-api/v1</code>, header <code>X-API-Key</code>. Endpoints: GET /customers, GET /customers/:id, POST /customers/:id/recharge, GET /payments, GET /packages.
      </p>
      {shown && (
        <div className="mb-4 rounded bg-amber-50 p-3 text-sm">
          <p className="font-semibold">Copy this key now — it will not be shown again:</p>
          <code className="mt-1 block break-all">{shown}</code>
          <Button size="sm" className="mt-2" variant="secondary" onClick={() => navigator.clipboard.writeText(shown).then(() => toast.success("Copied"))}>
            Copy
          </Button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="Key name" placeholder="Website" value={name} onChange={(e) => setName(e.target.value)} />
        {SCOPES.map((s) => (
          <Checkbox key={s} label={s} checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />
        ))}
        <Button disabled={name.trim().length < 2 || !scopes.length} loading={create.isPending} onClick={() => create.mutate()}>
          Create key
        </Button>
      </div>
      <Table
        rows={q.data?.data ?? []}
        empty="No keys."
        columns={[
          { key: "name", header: "Name" },
          { key: "prefix", header: "Key", render: (k) => <code>{`isp_${k.prefix}_…`}</code> },
          { key: "scopes", header: "Scopes", render: (k) => k.scopes.join(", ") },
          { key: "lastUsedAt", header: "Last used", render: (k) => formatDateTime(k.lastUsedAt) },
          {
            key: "x",
            header: "",
            render: (k) =>
              k.revokedAt ? (
                <Badge>revoked</Badge>
              ) : (
                <Button size="sm" variant="danger" onClick={() => confirm(`Revoke "${k.name}"? Anything using it stops working.`) && revoke.mutate(k._id)}>
                  Revoke
                </Button>
              ),
          },
        ]}
      />
    </FeatureCard>
  );
}

function CustomDomainCard() {
  const q = useApi("custom-domain", "/settings/custom-domain", undefined, { retry: false });
  const [domain, setDomain] = useState("");
  const save = useApiMutation(() => api.put("/settings/custom-domain", { domain }), { invalidate: ["custom-domain"] });
  const verify = useApiMutation(() => api.post("/settings/custom-domain/verify"), { invalidate: ["custom-domain"] });
  const remove = useApiMutation(() => api.delete("/settings/custom-domain"), { invalidate: ["custom-domain"] });
  const d = q.data?.data;
  return (
    <FeatureCard title="Custom domain for the customer portal" query={q}>
      {d ? (
        <div className="space-y-3 text-sm">
          <p>
            <strong>{d.domain}</strong> {d.verified ? <Badge color="green">verified</Badge> : <Badge color="amber">waiting for DNS</Badge>}
          </p>
          <p>Add these records at your domain provider:</p>
          <Table
            rowKey="type"
            rows={[
              { type: "TXT", name: d.txtName, value: d.txtValue },
              { type: "CNAME", name: d.domain, value: d.cnameTarget },
            ]}
            columns={[
              { key: "type", header: "Type" },
              { key: "name", header: "Name / host", render: (r) => <code>{r.name}</code> },
              { key: "value", header: "Value", render: (r) => <code className="break-all">{r.value}</code> },
            ]}
          />
          <div className="flex gap-2">
            {!d.verified && (
              <Button loading={verify.isPending} onClick={() => verify.mutate()}>
                Verify
              </Button>
            )}
            <Button variant="danger" onClick={() => confirm("Remove the custom domain?") && remove.mutate()}>
              Remove
            </Button>
          </div>
          <p className="text-xs text-zinc-500">HTTPS for your domain is set up by the platform after verification.</p>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <Input label="Domain" placeholder="my.speednet.com.bd" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <Button loading={save.isPending} disabled={!domain} onClick={() => save.mutate()}>
            Set domain
          </Button>
        </div>
      )}
    </FeatureCard>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Integrations" subtitle="Logo, your own SMS gateway, WhatsApp, API keys and custom domain" />
      <LogoCard />
      <SmsGatewayCard />
      <WhatsAppCard />
      <ApiKeysCard />
      <CustomDomainCard />
    </div>
  );
}
