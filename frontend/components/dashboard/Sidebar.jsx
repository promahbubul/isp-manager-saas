"use client";

import sidebarModules from "@/app/constant/dashboard/sidebar";
import { useAuth } from "@/providers/AuthProvider";
import Module from "./Module";

const Sidebar = () => {
  const { company, can, subscription } = useAuth();
  const features = subscription?.plan?.features ?? [];
  // Not in the plan: keep it visible (so ISPs know it exists) but send them to the upgrade page.
  const lock = (item) =>
    item.feature && !features.includes(item.feature) ? { ...item, title: `${item.title} 🔒`, path: "/dashboard/billing/subscription" } : item;

  const visible = sidebarModules
    .filter((m) => !m.perm || can(m.perm))
    .map((m) => lock({ ...m, subModules: m.subModules?.filter((s) => !s.perm || can(s.perm)).map(lock) }));

  return (
    <aside className="print:hidden flex h-full w-64 shrink-0 flex-col overflow-y-auto bg-blue-950 text-white">
      <h1 className="truncate border-b border-slate-600 px-4 py-5 text-center text-2xl font-extrabold italic">
        {company?.name ?? "ISP Manager"}
      </h1>
      <nav className="py-2">
        {visible.map((module) => (
          <Module key={module.id} module={module} />
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
