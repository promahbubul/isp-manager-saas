"use client";

import { Phone, Wifi } from "lucide-react";
import ThemeToggle from "@/components/shell/ThemeToggle";
import { cn } from "@/lib/cn";

/**
 * Mobile-first frame for the customer portal, in the ISP's own name and colour.
 * The ISP colour is exposed as the CSS variable --brand so pages can use bg-[var(--brand)].
 */
export default function PortalShell({ isp, children, actions, wide = false }) {
  const color = isp?.primaryColor || "#4f46e5";
  const width = wide ? "max-w-3xl" : "max-w-md";
  return (
    <div className="min-h-dvh bg-canvas" style={{ "--brand": color }}>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className={cn("mx-auto flex h-16 items-center gap-3 px-4", width)}>
          {isp?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- ISP logo is an arbitrary external URL
            <img src={isp.logo} alt="" className="size-9 rounded-lg border border-line bg-white object-contain p-0.5" />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-white shadow-sm">
              <Wifi className="size-4.5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-ink">{isp?.name ?? "…"}</p>
            {isp?.phone && (
              <a href={`tel:${isp.phone}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                <Phone className="size-3" /> {isp.phone}
              </a>
            )}
          </div>
          <ThemeToggle />
          {actions}
        </div>
      </header>
      <main className={cn("mx-auto px-4 pb-12 pt-6", width)}>{children}</main>
    </div>
  );
}
