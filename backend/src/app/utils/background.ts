/**
 * Fire-and-forget work (SMS after a recharge, bulk sends, router syncs after import)
 * that must not delay the HTTP response. The tenant context (AsyncLocalStorage)
 * carries over into the promise. Tests call flushBackground() to wait for it.
 */
const pending = new Set<Promise<unknown>>();

export function runInBackground(label: string, fn: () => Promise<unknown>) {
  const p = fn()
    .catch((err) => console.error(`[background] ${label} failed:`, err))
    .finally(() => pending.delete(p));
  pending.add(p);
}

export async function flushBackground() {
  while (pending.size) await Promise.all([...pending]);
}
