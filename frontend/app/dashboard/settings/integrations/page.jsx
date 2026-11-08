"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LockedNote, SettingsSection } from "@/components/settings/SettingsSection";
import { Badge, Button, Checkbox, ErrorBox, Input, Loading, Select, Switch, Table, confirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";

const locked = (err) => err?.response?.data?.details?.code === "feature_locked";

/** Settings section that shows "not in your plan" instead of an error when the feature is locked. */
function FeatureSection({ title, description, query, children, first }) {
  let body = children;
  if (query.isLoading) body = <Loading />;
  else if (locked(query.error)) body = <LockedNote>{query.error.response.data.message}</LockedNote>;
  else if (query.error) body = <ErrorBox error={query.error} />;
  return (
    <SettingsSection first={first} title={title} description={description}>
      {body}
    </SettingsSection>
  );
}

/** Small inline text input used inside tables. */
const cellInput = "h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-100";

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
    <FeatureSection first title="SMS gateway" description="Connect your own SMS account. All your SMS — automatic, bulk and login codes — then go through it, and no platform SMS credits are used." query={q}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Provider"
          className="sm:col-span-2"
          value={v.provider}
          onChange={(e) => setF({ ...v, provider: e.target.value, fields: e.target.value === cur?.provider ? { ...(cur?.options ?? {}) } : {} })}
          options={Object.entries(SMS_PROVIDERS).map(([value, p]) => ({ value, label: p.label }))}
        />
        <p className="-mt-2 text-xs text-muted sm:col-span-2">{SMS_PROVIDERS[v.provider]?.help}</p>
        {spec ? [...spec.options, ...spec.credentials].map(input) : <Loading />}
        <div className="border-t border-line pt-4 sm:col-span-2">
          <Switch label="Use this gateway" hint="Send all my SMS through this account." checked={v.enabled} onChange={(e) => setF({ ...v, enabled: e.target.checked })} />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button loading={save.isPending} onClick={() => save.mutate(v)}>
          Save gateway
        </Button>
      </div>
      {cur && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">Test the connection</p>
            {cur.lastTestAt && <Badge color={cur.lastTestOk ? "green" : "red"} dot>{`Last test ${cur.lastTestOk ? "passed" : `failed: ${cur.lastTestError ?? ""}`} · ${formatDateTime(cur.lastTestAt)}`}</Badge>}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input className="min-w-48 flex-1" aria-label="Test mobile number" placeholder="01XXXXXXXXX" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button variant="secondary" loading={test.isPending} disabled={!to} onClick={() => test.mutate()}>
              Send test SMS
            </Button>
            <Button variant="ghost" loading={balance.isPending} onClick={() => balance.mutate()}>
              Check balance
            </Button>
          </div>
        </div>
      )}
    </FeatureSection>
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
    <FeatureSection
      title="WhatsApp"
      description={<>Official WhatsApp Cloud API. Create message templates in Meta WhatsApp Manager, wait for approval, then enter their names here. Variables fill {"{{1}}, {{2}}"}… in the order you list them.</>}
      query={q}
    >
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Input label="Phone number ID" value={v.phoneNumberId} onChange={(e) => setF({ ...v, phoneNumberId: e.target.value })} />
        <Input label="Permanent access token" type="password" placeholder={cur?.hasAccessToken ? "•••• saved" : ""} value={v.accessToken} onChange={(e) => setF({ ...v, accessToken: e.target.value })} />
      </div>
      <Table
        rowKey="e"
        rows={WA_EVENTS.map(([e, label]) => ({ e, label }))}
        columns={[
          { key: "label", header: "Event" },
          { key: "t", header: "Template name", render: (r) => <input aria-label={`${r.label} template`} className={cellInput} value={v.events[r.e].template} onChange={setEv(r.e, "template")} placeholder="payment_received_v1" /> },
          { key: "l", header: "Language", render: (r) => <input aria-label={`${r.label} language`} className={`${cellInput} w-16`} value={v.events[r.e].language} onChange={setEv(r.e, "language")} /> },
          { key: "p", header: "Variables in order", render: (r) => <input aria-label={`${r.label} variables`} className={cellInput} value={v.events[r.e].params} onChange={setEv(r.e, "params")} placeholder="name, amount, expiry" /> },
        ]}
      />
      <div className="mt-5 border-t border-line pt-4">
        <Switch label="Send WhatsApp messages" hint="Sent together with the automatic SMS for the events above." checked={v.enabled} onChange={(e) => setF({ ...v, enabled: e.target.checked })} />
      </div>
      <div className="mt-5 flex justify-end">
        <Button loading={save.isPending} onClick={submit}>
          Save WhatsApp
        </Button>
      </div>
    </FeatureSection>
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
    <FeatureSection title="API keys" description="Connect your website, accounting software or payment kiosk. Send the key in the X-API-Key header." query={q}>
      <div className="mb-5 rounded-lg bg-subtle px-3 py-2.5 text-xs leading-relaxed text-muted">
        <p>
          Base URL <code className="font-mono text-ink">https://&lt;your API domain&gt;/api/v1/public-api/v1</code>
        </p>
        <p className="mt-1">
          Endpoints <code className="font-mono text-ink">GET /customers · GET /customers/:id · POST /customers/:id/recharge · GET /payments · GET /packages</code>
        </p>
      </div>
      {shown && (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Copy this key now — it will not be shown again.</p>
          <code className="mt-1 block break-all font-mono">{shown}</code>
          <Button size="sm" className="mt-2" variant="secondary" onClick={() => navigator.clipboard.writeText(shown).then(() => toast.success("Copied"))}>
            Copy
          </Button>
        </div>
      )}
      <div className="mb-5 space-y-4">
        <Input label="New key name" placeholder="e.g. Website" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Permissions</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {SCOPES.map((s) => (
              <Checkbox key={s} label={<code className="font-mono text-[13px]">{s}</code>} checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={name.trim().length < 2 || !scopes.length} loading={create.isPending} onClick={() => create.mutate()}>
            Create key
          </Button>
        </div>
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
                <Button size="sm" variant="danger" onClick={() => confirmDialog(`Revoke "${k.name}"? Anything using it stops working.`).then((ok) => ok && revoke.mutate(k._id))}>
                  Revoke
                </Button>
              ),
          },
        ]}
      />
    </FeatureSection>
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
    <FeatureSection title="Custom domain" description="Serve your customer portal on your own domain, e.g. my.speednet.com.bd. HTTPS is set up by the platform after verification." query={q}>
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
            <Button variant="danger" onClick={() => confirmDialog("Remove the custom domain?").then((ok) => ok && remove.mutate())}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <Input label="Domain" className="flex-1" placeholder="my.speednet.com.bd" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <Button loading={save.isPending} disabled={!domain} onClick={() => save.mutate()}>
            Set domain
          </Button>
        </div>
      )}
    </FeatureSection>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="pb-6">
      <SmsGatewayCard />
      <WhatsAppCard />
      <ApiKeysCard />
      <CustomDomainCard />
    </div>
  );
}
