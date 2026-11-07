"use client";

import { useState } from "react";
import { Button, ErrorBox, Loading, Modal, PageHeader, Table } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { usePaged } from "@/lib/usePaged";
import { formatDateTime } from "@/lib/format";

/** Unexpected server errors (5xx), grouped; kept 30 days. */
export default function ErrorLogPage() {
  const [open, setOpen] = useState(null);
  const list = usePaged("errors", "/admin/error-logs", {}, { client: "admin", defaultLimit: 50 });
  const { data, isLoading, error } = list;
  const detail = useAdminApi(["error", open], `/admin/error-logs/${open}`, undefined, { enabled: Boolean(open) });
  const fixed = useAdminMutation((id) => adminApi.delete(`/admin/error-logs/${id}`), { invalidate: ["errors"], onSuccess: () => setOpen(null) });

  return (
    <div>
      <PageHeader title="Error log" subtitle="Server errors (500) grouped by place and message. Mark fixed after a deploy; it comes back if it happens again." />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table pager={list.pager}
            rows={data?.data ?? []}
            empty="No server errors. 🎉"
            onRowClick={(e) => setOpen(e._id)}
            columns={[
              { key: "lastAt", header: "Last seen", render: (e) => formatDateTime(e.lastAt) },
              { key: "count", header: "Times", render: (e) => <strong>{e.count}</strong> },
              { key: "where", header: "Where", render: (e) => <code className="text-xs">{`${e.method} ${e.path}`}</code> },
              { key: "message", header: "Message", className: "max-w-md truncate" },
              { key: "company", header: "ISP", render: (e) => e.company?.name ?? "—" },
            ]}
          />
        </>
      )}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title="Error details" size="lg">
        {detail.isLoading ? (
          <Loading />
        ) : (
          detail.data?.data && (
            <div className="space-y-3 text-sm">
              <p>
                <strong>{detail.data.data.message}</strong>
              </p>
              <p className="text-zinc-600">
                {detail.data.data.method} {detail.data.data.path} · {detail.data.data.count}× · first {formatDateTime(detail.data.data.firstAt)}
              </p>
              <pre className="max-h-80 overflow-auto rounded bg-[#18181b] p-3 text-xs text-[#e4e4e7] ring-1 ring-line">{detail.data.data.stack}</pre>
              <Button variant="success" loading={fixed.isPending} onClick={() => fixed.mutate(open)}>
                Mark fixed
              </Button>
            </div>
          )
        )}
      </Modal>
    </div>
  );
}
