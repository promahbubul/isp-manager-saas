"use client";

import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import QuickForm from "@/components/common/QuickForm";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Pagination, Stat, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, taka } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";

const CATEGORIES = ["router", "onu", "switch", "fiber_cable", "utp_cable", "connector", "splitter", "tools", "other"].map((c) => ({ value: c, label: c.replace("_", " ") }));
const UNITS = ["pcs", "meter", "box", "roll", "kg"].map((u) => ({ value: u, label: u }));
const MOVES = [
  { value: "in", label: "Purchase (stock in)" },
  { value: "out", label: "Issue (to customer / staff)" },
  { value: "return", label: "Return to stock" },
  { value: "damage", label: "Damaged / lost" },
  { value: "adjust", label: "Count correction (+/−)" },
];
const MOVE_COLOR = { in: "green", out: "blue", return: "amber", damage: "red", adjust: "slate" };

function MoveForm({ item, onClose }) {
  const customers = useApi(["inv-customers"], "/customers", { limit: 100, status: "active" });
  const employees = useApi(["inv-employees"], "/employees", { limit: 100 });
  const move = useApiMutation((b) => api.post("/inventory/movements", b), { invalidate: ["inventory", "inv-moves", "inv-summary", "ledger", "pnl"] });
  return (
    <QuickForm
      title={`Stock: ${item.name} (${item.stock} ${item.unit} in stock)`}
      submitLabel="Save"
      loading={move.isPending}
      initial={{ type: "in", recordExpense: true }}
      fields={[
        { name: "type", label: "What happened", type: "select", options: MOVES },
        { name: "quantity", label: `Quantity (${item.unit})`, type: "number", required: true },
        { name: "unitCost", label: "Price per unit (৳) — purchases", type: "number" },
        ...(item.trackSerials ? [{ name: "serials", label: "Serial / MAC numbers", type: "textarea", hint: "One per line, as many as the quantity", required: true }] : []),
        { name: "customer", label: "Customer (issue/return)", type: "select", placeholder: "—", options: (customers.data?.data ?? []).map((c) => ({ value: c._id, label: `${c.name} (${c.customerId})` })) },
        { name: "employee", label: "Staff (issue/return)", type: "select", placeholder: "—", options: (employees.data?.data ?? []).map((e) => ({ value: e._id, label: e.name })) },
        { name: "supplier", label: "Supplier (purchases)" },
        { name: "note", label: "Note" },
        { name: "recordExpense", label: "Add purchase cost to expenses", type: "checkbox" },
      ]}
      onSubmit={(v) =>
        move.mutateAsync({
          ...v,
          item: item._id,
          serials: typeof v.serials === "string" ? v.serials.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) : [],
        })
      }
      onClose={onClose}
    />
  );
}

export default function InventoryPage() {
  const [tab, setTab] = useState("items");
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);
  const summary = useApi("inv-summary", "/inventory/summary");
  const items = usePaged("inventory", "/inventory/items", {}, { defaultLimit: 50 });
  const moves = usePaged("inv-moves", "/inventory/movements", {}, { defaultLimit: 50, enabled: tab === "moves" });
  const save = useApiMutation((b) => (editing?._id ? api.patch(`/inventory/items/${editing._id}`, b) : api.post("/inventory/items", b)), { invalidate: ["inventory", "inv-summary"] });
  const s = summary.data?.data;
  const error = summary.error || items.error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="Routers, ONUs, cable and connectors"
        actions={
          <PermissionGate perm="inventory.manage">
            <Button onClick={() => setEditing({})}>+ Add item</Button>
          </PermissionGate>
        }
      />
      {error && <ErrorBox error={error} />}
      {s && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Stock value" value={taka(s.stockValue)} />
          <Stat label="Items" value={s.items} />
          <Stat label="Low stock" value={s.lowStock.length} tone={s.lowStock.length ? "red" : undefined} />
        </div>
      )}
      {s?.lowStock?.length > 0 && (
        <p className="rounded bg-amber-50 px-4 py-2 text-sm text-amber-900">Low stock: {s.lowStock.map((i) => `${i.name} (${i.stock} ${i.unit})`).join(", ")}</p>
      )}
      <div className="flex gap-2">
        {[
          ["items", "Items"],
          ["moves", "Stock history"],
        ].map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? "primary" : "secondary"} onClick={() => setTab(k)}>
            {l}
          </Button>
        ))}
      </div>
      {tab === "items" ? (
        items.isLoading ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={items.data?.data ?? []}
              empty="No items yet."
              columns={[
                { key: "name", header: "Item", render: (i) => <strong>{i.name}</strong> },
                { key: "category", header: "Category", render: (i) => i.category.replace("_", " ") },
                { key: "stock", header: "Stock", render: (i) => <span className={i.stock <= i.minStock ? "font-semibold text-rose-600" : ""}>{`${i.stock} ${i.unit}`}</span> },
                { key: "avgCost", header: "Avg. cost", render: (i) => taka(i.avgCost) },
                { key: "value", header: "Value", render: (i) => taka(i.stock * i.avgCost) },
                {
                  key: "act",
                  header: "",
                  render: (i) => (
                    <PermissionGate perm="inventory.manage">
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => setMoving(i)}>
                          Stock in/out
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditing(i)}>
                          Edit
                        </Button>
                      </div>
                    </PermissionGate>
                  ),
                },
              ]}
            />
            <Pagination {...items.pager} />
          </>
        )
      ) : (
        <Card>
          {moves.isLoading ? (
            <Loading />
          ) : (
            <>
              <Table
                rows={moves.data?.data ?? []}
                empty="No stock movements."
                columns={[
                  { key: "date", header: "Date", render: (m) => formatDate(m.date) },
                  { key: "item", header: "Item", render: (m) => m.item?.name },
                  { key: "type", header: "Type", render: (m) => <Badge color={MOVE_COLOR[m.type]}>{m.type}</Badge> },
                  { key: "quantity", header: "Qty", render: (m) => `${m.quantity > 0 ? "+" : ""}${m.quantity} ${m.item?.unit ?? ""}` },
                  { key: "totalCost", header: "Cost", render: (m) => (m.totalCost ? taka(m.totalCost) : "—") },
                  { key: "to", header: "Customer / staff", render: (m) => m.customer?.name ?? m.employee?.name ?? m.supplier ?? "—" },
                  { key: "serials", header: "Serials", className: "max-w-xs truncate", render: (m) => m.serials?.join(", ") },
                  { key: "stockAfter", header: "Stock after" },
                ]}
              />
              <Pagination {...moves.pager} />
            </>
          )}
        </Card>
      )}
      {editing && (
        <QuickForm
          title={editing._id ? `Edit ${editing.name}` : "Add item"}
          loading={save.isPending}
          initial={editing._id ? editing : { category: "router", unit: "pcs", minStock: 0 }}
          fields={[
            { name: "name", label: "Name", required: true, placeholder: "e.g. Xiaomi 4A router" },
            { name: "category", label: "Category", type: "select", options: CATEGORIES },
            { name: "unit", label: "Unit", type: "select", options: UNITS },
            { name: "sku", label: "SKU / model" },
            { name: "minStock", label: "Warn when stock is at or below", type: "number" },
            ...(editing._id ? [] : [{ name: "trackSerials", label: "Track serial/MAC numbers (devices)", type: "checkbox" }]),
            { name: "note", label: "Note" },
          ]}
          onSubmit={(v) => save.mutateAsync(v)}
          onClose={() => setEditing(null)}
        />
      )}
      {moving && <MoveForm item={moving} onClose={() => setMoving(null)} />}
    </div>
  );
}
