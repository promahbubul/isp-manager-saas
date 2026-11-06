"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SubModule = ({ subModules }) => {
  const pathname = usePathname();
  return subModules.map((sub) => (
    <Link
      key={sub.id}
      href={sub.path}
      className={`block bg-sky-900 py-2.5 pl-14 pr-6 hover:bg-white/20 ${pathname === sub.path ? "bg-white/20" : ""}`}
    >
      {sub.title}
    </Link>
  ));
};

export default SubModule;
