"use client";

import sidebarModules from "@/app/constant/dashboard/sidebar";
import { useAuth } from "@/providers/AuthProvider";
import Module from "./Module";

const Sidebar = () => {
  const { company, can } = useAuth();

  const visible = sidebarModules
    .filter((m) => !m.perm || can(m.perm))
    .map((m) => ({ ...m, subModules: m.subModules?.filter((s) => !s.perm || can(s.perm)) }));

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
