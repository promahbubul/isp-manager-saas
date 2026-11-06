export const TENANT_ROLES = [
  "owner",
  "admin",
  "manager",
  "accountant",
  "collector",
  "technician",
  "reseller",
  "custom",
] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

/** Roles an owner/admin may assign to staff (owner is created only at signup). */
export const ASSIGNABLE_ROLES = TENANT_ROLES.filter((r) => r !== "owner") as Exclude<TenantRole, "owner">[];

export const PLATFORM_ROLES = ["super_admin", "support", "finance"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const COMPANY_STATUSES = ["trial", "active", "past_due", "suspended", "archived"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const RESERVED_SLUGS = [
  "www", "app", "api", "admin", "vpn", "portal", "mail", "smtp", "staging", "dev",
  "static", "cdn", "docs", "blog", "help", "support", "status", "billing",
];
