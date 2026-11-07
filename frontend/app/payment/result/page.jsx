"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/** Fallback page when a gateway return could not be matched to a payment. */
function ResultContent() {
  const params = useSearchParams();
  const ok = params.get("payment") === "success";
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <div className="max-w-md rounded-xl bg-surface p-8 text-center shadow-lg">
        <p className="text-5xl">{ok ? "✅" : "❌"}</p>
        <h1 className="mt-3 text-xl font-bold">{ok ? "Payment successful" : "Payment could not be completed"}</h1>
        {params.get("reason") && <p className="mt-2 text-zinc-600">{params.get("reason")}</p>}
        <Link href="/" className="mt-6 inline-block text-primary-700 hover:underline">
          Go to home
        </Link>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense>
      <ResultContent />
    </Suspense>
  );
}
