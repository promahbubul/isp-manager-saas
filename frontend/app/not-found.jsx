import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-50 text-primary-600">
          <Compass className="size-7" />
        </span>
        <p className="mt-6 text-sm font-semibold text-primary-600">404</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Page not found</h1>
        <p className="mt-3 text-muted">The page you are looking for does not exist or was moved.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-subtle">
            <ArrowLeft className="size-4" /> Home
          </Link>
          <Link href="/dashboard" className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-500">
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
