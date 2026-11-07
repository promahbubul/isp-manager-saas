"use client";

/** Mobile-first frame for the customer portal, in the ISP's own name and colour. */
export default function PortalShell({ isp, children, actions, wide = false }) {
  const color = isp?.primaryColor || "#7e22ce";
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="text-white" style={{ backgroundColor: color }}>
        <div className={`mx-auto flex items-center gap-3 px-4 py-4 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
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
          {actions}
        </div>
      </header>
      <main className={`mx-auto px-4 py-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}>{children}</main>
    </div>
  );
}
