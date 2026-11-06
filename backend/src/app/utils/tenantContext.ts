import { AsyncLocalStorage } from "async_hooks";

type TenantStore = { companyId: string };

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export const getTenantId = () => tenantStorage.getStore()?.companyId;

/** Run code scoped to a tenant (used by auth middleware, background jobs and tests). */
export const runWithTenant = <T>(companyId: string, fn: () => T) => tenantStorage.run({ companyId }, fn);
