"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { downloadFile, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

/** Downloads a report as Excel with the page's current filters. Hidden without report.export. */
export default function ExportButton({ report, params = {}, label = "Excel" }) {
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!can("report.view") || !can("report.export")) return null;
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v !== undefined && v !== null));
  const run = async () => {
    setBusy(true);
    try {
      await downloadFile(`/reports/${report}`, { ...clean, format: "xlsx" }, `${report}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="secondary" loading={busy} onClick={run}>
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}
