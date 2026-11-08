"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import PermissionGate from "@/components/common/PermissionGate";
import QuickForm from "@/components/common/QuickForm";
import { Badge, Button, Card, Loading, Skeleton } from "@/components/ui";
import { api, getErrorMessage } from "@/lib/api";
import { formatDateTime, taka, methodLabel } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";

const KIND_COLOR = { payment: "green", ticket: "amber", sms: "blue", change: "slate" };

/** Payments, complaints, SMS and edits in one list. */
export function CustomerTimeline({ id }) {
  const { data, isLoading } = useApi(["customer-timeline", id], `/customers/${id}/timeline`);
  return (
    <Card title="Timeline">
      {isLoading ? (
        <Loading />
      ) : !data?.data?.length ? (
        <p className="text-sm text-zinc-500">Nothing yet.</p>
      ) : (
        <ol className="max-h-[28rem] space-y-3 overflow-y-auto">
          {data.data.map((e, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="w-32 shrink-0 text-xs text-zinc-500">{formatDateTime(e.at)}</span>
              <Badge color={KIND_COLOR[e.kind]}>{e.kind}</Badge>
              <div className="min-w-0">
                <p className="font-medium text-zinc-800">{e.title}</p>
                {e.detail && <p className="break-words text-xs text-zinc-500">{e.detail}</p>}
                {e.by && <p className="text-xs text-zinc-400">by {e.by}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Loads a private image with the staff token (an <img src> could not send it). */
function PrivateImage({ id, kind, version }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    let href;
    api
      .get(`/customers/${id}/documents/${kind}`, { responseType: "blob" })
      .then((r) => {
        href = URL.createObjectURL(r.data);
        if (alive) setUrl(href);
      })
      .catch(() => alive && setUrl(""));
    return () => {
      alive = false;
      if (href) URL.revokeObjectURL(href);
    };
  }, [id, kind, version]);
  if (url === null) return <Skeleton width={160} height={112} borderRadius={6} />;
  if (!url) return <div className="flex h-28 w-40 items-center justify-center rounded border border-dashed text-xs text-zinc-400">not uploaded</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob URL of a private file */}
      <img src={url} alt={kind} className="h-28 w-40 rounded border object-cover" />
    </a>
  );
}

const DOCS = [
  ["photo", "Photo"],
  ["nidFront", "NID front"],
  ["nidBack", "NID back"],
];

export function CustomerDocuments({ customer }) {
  const [version, setVersion] = useState(0);
  const upload = async (kind, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post(`/customers/${customer._id}/documents/${kind}`, fd);
      toast.success("Saved");
      setVersion((v) => v + 1);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  return (
    <Card title="Photo & NID (KYC)">
      <div className="flex flex-wrap gap-6">
        {DOCS.map(([kind, label]) => (
          <div key={kind} className="space-y-2">
            <p className="text-xs font-medium text-zinc-600">{label}</p>
            {customer.documents?.[kind] || version ? <PrivateImage id={customer._id} kind={kind} version={version} /> : <div className="flex h-28 w-40 items-center justify-center rounded border border-dashed text-xs text-zinc-400">not uploaded</div>}
            <PermissionGate perm="customer.edit">
              <label className="block cursor-pointer text-xs text-primary-700 hover:underline">
                Upload
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(kind, e.target.files?.[0])} />
              </label>
            </PermissionGate>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-zinc-500">Images are private: only logged-in staff can see them. Max 2 MB.</p>
    </Card>
  );
}

/** "Change package" (now / prorate / next cycle) and "Other charge" buttons for the header. */
export function CustomerActions({ customer }) {
  const [modal, setModal] = useState(null);
  const packages = useApi(["packages", "active"], "/packages", { active: "true" });
  const inv = [["customer", customer._id], ["customer-timeline", customer._id], "customers"];
  const change = useApiMutation((b) => api.post(`/customers/${customer._id}/change-package`, b), { invalidate: inv });
  const charge = useApiMutation((b) => api.post("/customers/charges", { ...b, customer: customer._id }), { invalidate: [...inv, "payments"] });
  const options = (packages.data?.data ?? []).filter((p) => p._id !== (customer.package?._id ?? customer.package)).map((p) => ({ value: p._id, label: `${p.name} · ${taka(p.price)}` }));
  return (
    <>
      <PermissionGate perm="customer.edit">
        <Button variant="secondary" onClick={() => setModal("package")}>
          Change package
        </Button>
      </PermissionGate>
      <PermissionGate perm="payment.recharge">
        <Button variant="secondary" onClick={() => setModal("charge")}>
          Other charge
        </Button>
      </PermissionGate>
      {modal === "package" && (
        <QuickForm
          title="Change package"
          submitLabel="Change"
          loading={change.isPending}
          initial={{ mode: "prorate" }}
          fields={[
            { name: "package", label: "New package", type: "select", required: true, placeholder: "— choose —", options },
            {
              name: "mode",
              label: "When",
              type: "select",
              options: [
                { value: "prorate", label: "Now — convert remaining days to the new price" },
                { value: "now", label: "Now — keep the expiry date" },
                { value: "next", label: "At the next recharge" },
              ],
            },
          ]}
          onSubmit={(v) => change.mutateAsync(v)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "charge" && (
        <QuickForm
          title="Connection fee / device sale / other"
          submitLabel="Save"
          loading={charge.isPending}
          initial={{ type: "connection_fee", method: "cash" }}
          fields={[
            { name: "type", label: "Type", type: "select", options: [{ value: "connection_fee", label: "Connection / installation fee" }, { value: "other", label: "Device sale or other" }] },
            { name: "amount", label: "Amount (৳)", type: "number", required: true },
            { name: "note", label: "What for", required: true, placeholder: "e.g. ONU + 50 m fiber" },
            { name: "method", label: "Paid by", type: "select", options: ["cash", "bkash", "nagad", "rocket", "bank"].map((m) => ({ value: m, label: methodLabel(m) })) },
            { name: "trxId", label: "TrxID (bKash/Nagad)" },
            { name: "addToDue", label: "Not paid now — add to the customer's due", type: "checkbox" },
          ]}
          onSubmit={(v) => charge.mutateAsync(v)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
