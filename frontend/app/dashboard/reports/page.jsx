"use client";

import { useState } from "react";
import { toast } from "sonner";
import PermissionGate from "@/components/common/PermissionGate";
import { Button, ErrorBox, Input, Loading, PageHeader, Select, StatCell, Table, statGroupClass } from "@/components/ui";
import { downloadFile, getErrorMessage } from "@/lib/api";
import { formatDate, formatDateTime, taka, toDateInput } from "@/lib/format";
import { useApi } from "@/lib/hooks";

const REPORTS = [
  { value: "collection", label: "Collection", range: true },
  { value: "due", label: "Due list" },
  { value: "expiring", label: "Expiring soon" },
  { value: "expired", label: "Expired customers" },
  { value: "new-customers", label: "New customers", range: true },
  { value: "left-customers", label: "Customers who left", range: true },
  { value: "package-wise", label: "Package-wise" },
  { value: "payments", label: "All payments", range: true },
  { value: "expenses", label: "Income & expenses", range: true },
  { value: "invoices", label: "Invoices" },
];

const fmt = (type, v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "money") return taka(v);
  if (type === "date") return formatDate(v);
  if (type === "datetime") return formatDateTime(v);
  return String(v);
};

export default function ReportsPage() {
  const today = new Date();
  const monthStart = toDateInput(new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const [type, setType] = useState("collection");
  const [opts, setOpts] = useState({ from: monthStart, to: toDateInput(today), groupBy: "day", days: 3 });
  const [downloading, setDownloading] = useState(false);
  const meta = REPORTS.find((r) => r.value === type);

  const params = {
    ...(meta.range ? { from: opts.from, to: opts.to } : {}),
    ...(type === "collection" ? { groupBy: opts.groupBy } : {}),
    ...(type === "expiring" ? { days: opts.days } : {}),
  };
  const { data, isLoading, error } = useApi(["report", type, params], `/reports/${type}`, params);
  const report = data?.data;
  const set = (k) => (e) => setOpts((o) => ({ ...o, [k]: e.target.value }));

  const exportXlsx = async () => {
    setDownloading(true);
    try {
      await downloadFile(`/reports/${type}`, { ...params, format: "xlsx" }, `${type}.xlsx`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        actions={
          <PermissionGate perm="report.export">
            <Button variant="secondary" loading={downloading} onClick={exportXlsx}>
              Download Excel
            </Button>
          </PermissionGate>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Select label="Report" options={REPORTS} value={type} onChange={(e) => setType(e.target.value)} />
        {meta.range && (
          <>
            <Input label="From" type="date" value={opts.from} onChange={set("from")} />
            <Input label="To" type="date" value={opts.to} onChange={set("to")} />
          </>
        )}
        {type === "collection" && (
          <Select
            label="Group by"
            value={opts.groupBy}
            onChange={set("groupBy")}
            options={[
              { value: "day", label: "Day" },
              { value: "collector", label: "Collector" },
              { value: "method", label: "Payment method" },
              { value: "zone", label: "Zone" },
            ]}
          />
        )}
        {type === "expiring" && <Input label="Within days" type="number" min={1} max={60} value={opts.days} onChange={set("days")} />}
      </div>

      {error && <ErrorBox error={error} />}
      {isLoading || !report ? (
        <Loading />
      ) : (
        <>
          <div className={statGroupClass(4, "mb-4")}>
            {report.summary.map((s) => (
              <StatCell key={s.label} label={s.label} value={fmt(s.type, s.value)} />
            ))}
          </div>
          <Table
            rowKey="__key"
            rows={report.rows.map((r, i) => ({ ...r, __key: i }))}
            columns={report.columns.map((c) => ({
              key: c.key,
              header: c.header,
              className: c.type === "money" || c.type === "number" ? "text-right" : "",
              render: (r) => fmt(c.type, r[c.key]),
            }))}
          />
          {report.rows.length >= 10000 && <p className="mt-2 text-sm text-amber-700">Showing the first 10,000 rows.</p>}
        </>
      )}
    </div>
  );
}
