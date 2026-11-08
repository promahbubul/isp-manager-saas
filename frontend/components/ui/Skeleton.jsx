"use client";

import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { cn } from "@/lib/cn";

/** Shimmer colours follow the theme tokens, so light and dark both look right. */
export function SkeletonProvider({ children }) {
  return (
    <SkeletonTheme baseColor="var(--color-line)" highlightColor="var(--color-subtle)" duration={1.3}>
      {children}
    </SkeletonTheme>
  );
}

export { Skeleton };

/** Content placeholder for a card / table while data loads. */
export function Loading({ rows = 6, className }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-4", className)} role="status" aria-label="Loading">
      <Skeleton width="35%" height={14} />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.1 }}>
            <Skeleton circle width={28} height={28} />
            <div className="flex-1">
              <Skeleton height={12} width={`${70 - (i % 3) * 12}%`} />
              <Skeleton height={10} width="40%" className="mt-1.5" />
            </div>
            <Skeleton width={64} height={22} borderRadius={999} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Whole app shell placeholder (sidebar + top bar + page) while the session is checked. */
export function ShellLoading() {
  return (
    <div className="flex h-dvh bg-canvas" role="status" aria-label="Loading">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface p-4 lg:block">
        <div className="flex items-center gap-3">
          <Skeleton width={36} height={36} borderRadius={10} />
          <div className="flex-1">
            <Skeleton height={12} width="70%" />
            <Skeleton height={10} width="45%" />
          </div>
        </div>
        <div className="mt-8 space-y-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton width={18} height={18} borderRadius={5} />
              <Skeleton height={12} containerClassName="flex-1" width={`${75 - (i % 4) * 10}%`} />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[var(--topbar-h)] items-center justify-end gap-3 border-b border-line bg-surface px-4">
          <Skeleton circle width={32} height={32} />
          <Skeleton circle width={32} height={32} />
          <Skeleton width={120} height={32} borderRadius={8} />
        </header>
        <main className="space-y-5 p-4 sm:p-6">
          <Skeleton width={260} height={26} containerClassName="block" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <Skeleton width="50%" height={11} />
                <Skeleton width="70%" height={24} className="mt-2" />
              </div>
            ))}
          </div>
          <Loading rows={7} />
        </main>
      </div>
    </div>
  );
}
