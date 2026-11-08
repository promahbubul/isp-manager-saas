"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page crashes; the rest of the app keeps working. */
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-[60dvh] place-items-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="size-7" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Something went wrong</h1>
        <p className="mt-3 text-muted">This page could not be shown. Try again — if it keeps happening, contact support{error?.digest ? ` and mention code ${error.digest}` : ""}.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-500">
            <RotateCw className="size-4" /> Try again
          </button>
          <Link href="/" className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-subtle">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
