"use client";

import ThemeToggle from "@/components/shell/ThemeToggle";

/** Mobile-first frame for the customer portal, in the ISP's own name and colour. */
export default function PortalShell({ isp, children, actions, wide = false }) {
  const color = isp?.primaryColor || "#4f46e5";
  return (
    <div className="min-h-screen bg-canvas">
      <header className="relative text-white" style={{ backgroundColor: color }}>
        {/* tone the ISP colour down in dark mode so it does not glare */}
        <div aria-hidden className="pointer-events-none absolute inset-0 dark:bg-black/40" />
        <div className={`relative mx-auto flex items-center gap-3 px-4 py-4 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
          {isp?.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- ISP logo is an arbitrary external URL
            <img src={isp.logo} alt="" className="h-9 w-9 rounded bg-white object-contain p-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold">{isp?.name ?? "…"}</h1>
            {isp?.phone && (
              <a href={`tel:${isp.phone}`} className="text-xs text-white/80 hover:text-white">
                Helpline {isp.phone}
              </a>
            )}
          </div>
          <ThemeToggle className="text-white/90 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10" />
          {actions}
        </div>
      </header>
      <main className={`mx-auto px-4 py-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}>{children}</main>
    </div>
  );
}
