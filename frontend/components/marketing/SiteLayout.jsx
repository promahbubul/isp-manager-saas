import Link from "next/link";
import { site } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-800 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-2xl font-extrabold italic text-purple-400">
          {site.name}
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/pricing" className="hover:text-purple-300">
            Pricing
          </Link>
          <Link href="/contact" className="hover:text-purple-300">
            Contact
          </Link>
          <Link href="/login" className="hover:text-purple-300">
            Login
          </Link>
          <Link href="/signup" className="rounded-md bg-purple-600 px-4 py-2 font-semibold hover:bg-purple-500">
            Free trial
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 text-slate-400">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 text-sm sm:grid-cols-3">
        <div>
          <p className="font-semibold text-white">{site.name}</p>
          <p className="mt-2">ISP billing & management for Bangladesh.</p>
          <p className="mt-2">© {new Date().getFullYear()} {site.legalName}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/terms" className="hover:text-white">Terms & Conditions</Link>
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/refund-policy" className="hover:text-white">Refund & Cancellation Policy</Link>
          <Link href="/contact" className="hover:text-white">Contact</Link>
        </div>
        <div>
          <p>{site.address}</p>
          <p className="mt-1">{site.phone}</p>
          <p className="mt-1">{site.email}</p>
          <p className="mt-3 text-xs">We accept: SSLCommerz (Visa, Mastercard, bKash, Nagad, Rocket), bKash, Stripe</p>
        </div>
      </div>
    </footer>
  );
}

export function SitePage({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** Wrapper for long legal text. */
export function LegalPage({ title, updated, children }) {
  return (
    <SitePage>
      <article className="mx-auto max-w-3xl px-6 py-12 text-slate-800 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
        {children}
      </article>
    </SitePage>
  );
}
