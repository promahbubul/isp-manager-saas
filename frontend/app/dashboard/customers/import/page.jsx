"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader, Select, Table } from "@/components/ui";
import { api, downloadFile, getErrorMessage } from "@/lib/api";
import { toDateInput } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

function ExcelImport() {
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const upload = async (commit) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post(`/customers/import${commit ? "?commit=true" : ""}`, form);
      setResult({ ...res.data.data, committed: commit });
      toast.success(res.data.message);
      if (commit) qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Import from Excel">
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>
          Download the{" "}
          <button type="button" className="cursor-pointer text-purple-700 hover:underline" onClick={() => downloadFile("/customers/import/template", undefined, "template.xlsx")}>
            template
          </button>{" "}
          and fill one customer per row. <code>package</code> and <code>zone</code> must match names in the panel exactly.
        </li>
        <li>
          <code>expiry_date</code> as dd/mm/yyyy. Empty = expired until the first recharge.
        </li>
        <li>Upload → check → import. Rows with errors are skipped.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} className="text-sm" />
        <Button variant="secondary" disabled={!file} loading={busy && !result} onClick={() => upload(false)}>
          Check file
        </Button>
        {result && !result.committed && result.valid > 0 && (
          <Button variant="success" loading={busy} onClick={() => upload(true)}>
            Import {result.valid} customer(s)
          </Button>
        )}
      </div>
      {result && (
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            <Badge color="slate">{result.total} rows</Badge> <Badge color="green">{result.valid} valid</Badge>{" "}
            <Badge color="red">{result.invalid} with errors</Badge>
            {result.committed && <Badge color="purple"> {result.created} imported — syncing to MikroTik in the background</Badge>}
          </p>
          {result.errors.length > 0 && (
            <Table
              rowKey="row"
              rows={result.errors}
              columns={[
                { key: "row", header: "Row" },
                { key: "username", header: "Username" },
                { key: "errors", header: "Problems", className: "whitespace-normal", render: (r) => r.errors.join("; ") },
              ]}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function MikrotikImport() {
  const qc = useQueryClient();
  const routers = useApi("routers", "/routers");
  const [routerId, setRouterId] = useState("");
  const [expiry, setExpiry] = useState(() => {
    const d = new Date();
    return toDateInput(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); // end of this month
  });
  const [pkgFor, setPkgFor] = useState({}); // username → packageId
  const [selected, setSelected] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = useApi(["mikrotik-import", routerId], `/customers/import/mikrotik/${routerId}`, undefined, { enabled: Boolean(routerId), retry: false });

  const secrets = useMemo(() => (preview.data?.data?.secrets ?? []).filter((s) => !s.exists), [preview.data]);
  const packages = preview.data?.data?.packages ?? [];
  const pkgOf = (s) => pkgFor[s.username] ?? s.suggestedPackage ?? "";
  const isSelected = (s) => selected[s.username] ?? Boolean(s.hasPassword && s.suggestedPackage);
  const chosen = secrets.filter((s) => isSelected(s) && pkgOf(s));

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/customers/import/mikrotik/${routerId}`, {
        expiryDate: new Date(`${expiry}T23:59:59+06:00`).toISOString(),
        items: chosen.map((s) => ({ username: s.username, package: pkgOf(s) })),
      });
      setResult(res.data.data);
      toast.success(res.data.message);
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["mikrotik-import", routerId] });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Import from MikroTik">
      <p className="mb-4 text-sm text-slate-600">
        Creates customers for PPP secrets that already exist on a router. The router is not changed. The API user needs the{" "}
        <code>sensitive</code> policy so passwords can be read. Add phone numbers afterwards.
      </p>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          label="Router"
          placeholder="— Select router —"
          value={routerId}
          onChange={(e) => { setRouterId(e.target.value); setResult(null); setSelected({}); setPkgFor({}); }}
          options={(routers.data?.data ?? []).map((r) => ({ value: r._id, label: r.name }))}
        />
        <Input label="Expiry date for all" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </div>
      {preview.isLoading && routerId && <Loading />}
      {preview.error && <ErrorBox error={preview.error} />}
      {preview.isSuccess && (
        <>
          {packages.length === 0 && <ErrorBox>Create packages for this router first (matching its PPP profiles).</ErrorBox>}
          <p className="mb-2 text-sm text-slate-600">
            {secrets.length} new secret(s) · {(preview.data.data.secrets.length ?? 0) - secrets.length} already imported
          </p>
          <Table
            rowKey="username"
            rows={secrets}
            empty="Nothing new to import."
            columns={[
              {
                key: "sel",
                header: "",
                render: (s) => (
                  <input type="checkbox" className="h-4 w-4 accent-purple-600" disabled={!s.hasPassword} checked={isSelected(s) && s.hasPassword} onChange={(e) => setSelected({ ...selected, [s.username]: e.target.checked })} />
                ),
              },
              { key: "username", header: "Username" },
              { key: "comment", header: "Comment / name" },
              { key: "profile", header: "Profile" },
              { key: "disabled", header: "State", render: (s) => (s.disabled ? <Badge color="slate">disabled</Badge> : <Badge color="green">enabled</Badge>) },
              {
                key: "package",
                header: "Package",
                render: (s) => (
                  <select className="rounded border border-slate-300 px-2 py-1 text-sm" value={pkgOf(s)} onChange={(e) => setPkgFor({ ...pkgFor, [s.username]: e.target.value })}>
                    <option value="">— choose —</option>
                    {packages.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ),
              },
              { key: "pw", header: "", render: (s) => !s.hasPassword && <span className="text-xs text-red-600">no password</span> },
            ]}
          />
          <div className="mt-4">
            <Button variant="success" disabled={!chosen.length} loading={busy} onClick={run}>
              Import {chosen.length} customer(s)
            </Button>
          </div>
        </>
      )}
      {result?.errors?.length > 0 && (
        <div className="mt-4">
          <ErrorBox>{result.errors.map((e) => `${e.username}: ${e.error}`).join(" · ")}</ErrorBox>
        </div>
      )}
    </Card>
  );
}

export default function ImportCustomersPage() {
  const { can } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="Import customers" subtitle="Move your existing customers in without typing them one by one" />
      <ExcelImport />
      {can("router.view") && <MikrotikImport />}
    </div>
  );
}
