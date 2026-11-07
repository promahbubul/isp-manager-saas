import { CheckCircle2, Wifi } from "lucide-react";
import Link from "next/link";
import ThemeToggle from "@/components/shell/ThemeToggle";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "ISP Manager";

const POINTS = ["MikroTik auto enable / disable", "Bills, SMS reminders and online payment", "Customer portal, tickets and reports"];

/** Split layout: brand panel (desktop) + form card. */
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-dvh w-full bg-canvas lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary-950 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-primary-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-indigo-400/20 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
            <Wifi className="size-5" />
          </span>
          {APP_NAME}
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Run your ISP from one place.</h2>
          <ul className="mt-6 space-y-3 text-primary-100">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <CheckCircle2 className="size-5 text-primary-300" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-primary-200/70">© {new Date().getFullYear()} {APP_NAME}</p>
      </div>

      <div className="relative flex items-center justify-center px-4 py-10 sm:px-6">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold text-ink lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <Wifi className="size-4" />
            </span>
            {APP_NAME}
          </Link>
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>}
            {!subtitle && <div className="mb-6" />}
            {children}
          </div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
