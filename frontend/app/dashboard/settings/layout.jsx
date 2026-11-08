"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAuth } from "@/providers/AuthProvider";

const TABS = [
  { label: "General", href: "/dashboard/settings" },
  { label: "Payment gateways", href: "/dashboard/settings/payments", feature: "online_payment" },
  { label: "Integrations", href: "/dashboard/settings/integrations" },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  const { subscription } = useAuth();
  const features = subscription?.plan?.features ?? [];
  const tabs = TABS.filter((t) => !t.feature || features.includes(t.feature));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Settings" subtitle="Manage your company profile, billing rules, notifications and connected services." className="mb-4" />
      <nav aria-label="Settings sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "border-primary-600 text-primary-700 dark:text-primary-300" : "border-transparent text-muted hover:border-line hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
