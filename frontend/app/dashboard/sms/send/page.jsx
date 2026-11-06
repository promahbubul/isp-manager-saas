"use client";

import { useState } from "react";
import { Button, Card, PageHeader, Select, Stat, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi, useApiMutation } from "@/lib/hooks";
import { SegmentHint } from "@/lib/sms";

const STATUS = [
  { value: "", label: "All customers" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "disabled", label: "Disabled" },
  { value: "free", label: "Free" },
];

const VARS = ["{name}", "{customerId}", "{amount}", "{due}", "{expiry}", "{company}"];

export default function SendSmsPage() {
  const [mode, setMode] = useState("filter");
  const [message, setMessage] = useState("");
  const [numbers, setNumbers] = useState("");
  const [filter, setFilter] = useState({ status: "", zone: "", package: "" });

  const balance = useApi("sms-balance", "/sms/balance");
  const zones = useApi("zones", "/zones");
  const packages = useApi("packages", "/packages");

  const send = useApiMutation((body) => api.post("/sms/send", body), {
    invalidate: ["sms-balance", "sms-logs"],
    onSuccess: () => {
      setMessage("");
      setNumbers("");
    },
  });

  const submit = () => {
    const target =
      mode === "numbers"
        ? { type: "numbers", numbers: numbers.split(/[\s,;]+/).filter(Boolean) }
        : { type: "filter", ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) };
    if (confirm("Send this SMS now? Credits will be deducted.")) send.mutate({ message, target });
  };

  return (
    <div>
      <PageHeader title="Send SMS" subtitle="Bulk or single SMS to your customers" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Message" className="lg:col-span-2">
          <div className="mb-4 flex gap-2">
            {[
              ["filter", "To customers"],
              ["numbers", "To numbers"],
            ].map(([v, l]) => (
              <Button key={v} size="sm" variant={mode === v ? "primary" : "secondary"} onClick={() => setMode(v)}>
                {l}
              </Button>
            ))}
          </div>

          {mode === "filter" ? (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select label="Status" options={STATUS} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} />
              <Select
                label="Zone"
                placeholder="All zones"
                options={(zones.data?.data ?? []).map((z) => ({ value: z._id, label: z.name }))}
                value={filter.zone}
                onChange={(e) => setFilter({ ...filter, zone: e.target.value })}
              />
              <Select
                label="Package"
                placeholder="All packages"
                options={(packages.data?.data ?? []).map((p) => ({ value: p._id, label: p.name }))}
                value={filter.package}
                onChange={(e) => setFilter({ ...filter, package: e.target.value })}
              />
            </div>
          ) : (
            <div className="mb-4">
              <Textarea
                label="Mobile numbers"
                placeholder="01711000001, 01811000002 ..."
                hint="Separate with comma, space or new line"
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
              />
            </div>
          )}

          <Textarea
            label="Message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="প্রিয় {name}, ..."
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <SegmentHint text={message} />
            <div className="flex flex-wrap gap-1">
              {(mode === "filter" ? VARS : ["{company}"]).map((v) => (
                <button key={v} type="button" onClick={() => setMessage((m) => m + v)} className="cursor-pointer rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs hover:bg-purple-100">
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={submit} disabled={!message.trim() || (mode === "numbers" && !numbers.trim())} loading={send.isPending}>
              Send SMS
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Stat label="SMS balance" value={balance.data?.data?.balance ?? "—"} hint="credits · 1 credit = 1 SMS part" />
          <Card title="Tips">
            <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600">
              <li>English SMS: 160 characters per credit. Bangla: 70 per credit.</li>
              <li>Variables like {"{name}"} are filled for each customer.</li>
              <li>Need more credits? Contact support (online purchase is coming).</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
