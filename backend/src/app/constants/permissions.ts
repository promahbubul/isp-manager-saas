import { TenantRole } from "./roles";

export const PERMISSIONS = {
  dashboard: ["view"],
  customer: ["view", "create", "edit", "delete", "enable_disable", "kick", "import", "export"],
  package: ["view", "manage"],
  router: ["view", "manage"],
  zone: ["view", "manage"],
  payment: ["view", "recharge", "refund", "delete"],
  invoice: ["view", "manage"],
  reseller: ["view", "manage", "deposit"],
  ticket: ["view", "create", "assign", "solve"],
  sms: ["view", "send", "template"],
  employee: ["view", "manage", "salary"],
  collection: ["view", "handover"],
  expense: ["view", "manage"],
  inventory: ["view", "manage"],
  ip_log: ["view", "export"],
  report: ["view", "export"],
  staff: ["manage"],
  setting: ["manage"],
  subscription: ["manage"],
  activity_log: ["view"],
} as const;

type Perms = typeof PERMISSIONS;
export type Permission = { [K in keyof Perms]: `${K}.${Perms[K][number]}` }[keyof Perms];

export const ALL_PERMISSIONS = Object.entries(PERMISSIONS).flatMap(([mod, actions]) =>
  actions.map((a) => `${mod}.${a}`),
) as Permission[];

const all = (mod: keyof Perms) => PERMISSIONS[mod].map((a) => `${mod}.${a}`) as Permission[];

/** Default permissions per role. Owner always gets everything. */
export const ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((p) => p !== "subscription.manage"),
  manager: [
    "dashboard.view",
    ...all("customer").filter((p) => p !== "customer.delete"),
    "package.view",
    "router.view",
    "zone.view",
    "payment.view",
    "payment.recharge",
    "invoice.view",
    "reseller.view",
    ...all("ticket"),
    "sms.view",
    "sms.send",
    "collection.view",
    "inventory.view",
    "report.view",
    "report.export",
  ],
  accountant: [
    "dashboard.view",
    "customer.view",
    ...all("payment"),
    ...all("invoice"),
    "reseller.view",
    "reseller.deposit",
    ...all("collection"),
    ...all("expense"),
    "employee.view",
    "employee.salary",
    "report.view",
    "report.export",
  ],
  collector: ["dashboard.view", "customer.view", "payment.view", "payment.recharge", "collection.handover", "report.view"],
  technician: [
    "dashboard.view",
    "customer.view",
    "customer.enable_disable",
    "customer.kick",
    "router.view",
    "ticket.view",
    "ticket.solve",
    "inventory.view",
  ],
  reseller: [
    "dashboard.view",
    "customer.view",
    "customer.create",
    "customer.edit",
    "customer.enable_disable",
    "payment.view",
    "payment.recharge",
    "package.view",
    "ticket.view",
    "ticket.create",
    "report.view",
  ],
  custom: [],
};

/**
 * Effective permissions: owner → all; custom → only the user's own list;
 * other roles → user's explicit overrides if set, otherwise the role defaults.
 */
export function resolvePermissions(role: TenantRole, userPermissions: string[] = []): Permission[] {
  if (role === "owner") return ALL_PERMISSIONS;
  const valid = userPermissions.filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission));
  if (role === "custom") return valid;
  return valid.length ? valid : ROLE_PERMISSIONS[role];
}
