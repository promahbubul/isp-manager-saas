"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FaMinus, FaPlus } from "react-icons/fa6";
import SubModule from "./SubModule";

const rowClass = "flex w-full cursor-pointer flex-row items-center justify-between px-5 py-2.5 hover:bg-white/20";

const Module = ({ module }) => {
  const pathname = usePathname();
  const hasChildren = module.subModules?.length > 0;
  const childActive = hasChildren && module.subModules.some((s) => s.path === pathname);
  const [open, setOpen] = useState(childActive);
  const Icon = module.icon;

  const label = (
    <span className="flex items-center gap-4">
      {Icon && <Icon className="text-xl" />}
      {module.title}
    </span>
  );

  if (!hasChildren) {
    return (
      <Link href={module.path} className={`${rowClass} ${pathname === module.path ? "bg-white/20" : ""}`}>
        {label}
      </Link>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className={rowClass} aria-expanded={open}>
        {label}
        {open ? <FaMinus /> : <FaPlus />}
      </button>
      {open && <SubModule subModules={module.subModules} />}
    </div>
  );
};

export default Module;
