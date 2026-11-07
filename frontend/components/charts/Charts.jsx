"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { taka } from "@/lib/format";

const PRIMARY = "#4f46e5";
const GREEN = "#10b981";
const ROSE = "#f43f5e";
const GRID = "#e4e4e7";
const TICK = { fontSize: 11, fill: "#71717a" };
const compact = (n) => (n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n));

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="tabular font-medium text-ink">{taka(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Daily collection (last N days). data: [{ date: "2026-11-07", amount }] */
export function CollectionChart({ data }) {
  const rows = data.map((d) => ({ ...d, label: new Date(`${d.date}T00:00:00+06:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) }));
  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="collFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.25} />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: GRID }} />
          <Area type="monotone" dataKey="amount" name="Collected" stroke={PRIMARY} strokeWidth={2} fill="url(#collFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Monthly income vs expense. data: [{ month: "2026-11", income, expense }] */
export function IncomeExpenseChart({ data }) {
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "#f4f4f5" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name="Income" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" name="Expense" fill={ROSE} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
