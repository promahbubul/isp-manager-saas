import {
  Activity,
  BarChart3,
  Boxes,
  Calculator,
  CreditCard,
  FileText,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Network,
  Settings,
  ShieldCheck,
  TicketCheck,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

/**
 * Dashboard navigation, grouped into sections.
 * `perm` hides an item without that permission; `feature` (plan feature) keeps it visible
 * but locked, linking to the upgrade page.
 */
const sidebarSections = [
  {
    items: [{ title: "Dashboard", icon: LayoutDashboard, path: "/dashboard", perm: "dashboard.view", exact: true }],
  },
  {
    title: "Customers & billing",
    items: [
      {
        title: "Customers",
        icon: Users,
        perm: "customer.view",
        children: [
          { title: "All customers", path: "/dashboard/customers", exact: true },
          { title: "Add customer", path: "/dashboard/customers/create", perm: "customer.create" },
          { title: "Import", path: "/dashboard/customers/import", perm: "customer.import" },
          { title: "Package requests", path: "/dashboard/customers/package-requests", feature: "customer_portal" },
        ],
      },
      {
        title: "Billing",
        icon: CreditCard,
        perm: "payment.view",
        children: [
          { title: "Recharge", path: "/dashboard/billing/recharge", perm: "payment.recharge" },
          { title: "Payment history", path: "/dashboard/billing/payments" },
          { title: "Online payments", path: "/dashboard/billing/online", feature: "online_payment" },
          { title: "Postpaid invoices", path: "/dashboard/billing/invoices", perm: "invoice.view" },
          { title: "Cash collection", path: "/dashboard/collections" },
        ],
      },
      { title: "Support tickets", icon: TicketCheck, path: "/dashboard/tickets", perm: "ticket.view", feature: "ticket" },
      {
        title: "SMS",
        icon: MessageSquare,
        perm: "sms.view",
        children: [
          { title: "Send SMS", path: "/dashboard/sms/send", perm: "sms.send" },
          { title: "SMS history", path: "/dashboard/sms/history" },
          { title: "Templates", path: "/dashboard/sms/templates" },
        ],
      },
      { title: "Resellers", icon: Handshake, path: "/dashboard/resellers", perm: "reseller.view", feature: "reseller" },
    ],
  },
  {
    title: "Network",
    items: [
      {
        title: "Network",
        icon: Network,
        perm: "package.view",
        children: [
          { title: "Routers", path: "/dashboard/routers", perm: "router.view" },
          { title: "Packages", path: "/dashboard/packages" },
          { title: "Zones", path: "/dashboard/zones" },
          { title: "OLTs (fiber)", path: "/dashboard/olts", perm: "router.view" },
        ],
      },
      { title: "IP log (BTRC)", icon: ShieldCheck, path: "/dashboard/ip-log", perm: "ip_log.view", feature: "ip_log" },
    ],
  },
  {
    title: "Business",
    items: [
      { title: "Reports", icon: FileText, path: "/dashboard/reports", perm: "report.view" },
      { title: "Analytics", icon: TrendingUp, path: "/dashboard/analytics", perm: "report.view" },
      { title: "Accounts (P&L)", icon: Calculator, path: "/dashboard/accounts", perm: "expense.view" },
      { title: "Employees & salary", icon: Wallet, path: "/dashboard/employees", perm: "employee.view" },
      { title: "Inventory", icon: Boxes, path: "/dashboard/inventory", perm: "inventory.view", feature: "inventory" },
    ],
  },
  {
    title: "Administration",
    items: [
      { title: "Staff", icon: UserCog, path: "/dashboard/staff", perm: "staff.manage" },
      { title: "Activity log", icon: Activity, path: "/dashboard/activity-log", perm: "activity_log.view" },
      { title: "My subscription", icon: BarChart3, path: "/dashboard/billing/subscription", perm: "subscription.manage" },
      {
        title: "Settings",
        icon: Settings,
        perm: "setting.manage",
        children: [
          { title: "General", path: "/dashboard/settings", exact: true },
          { title: "Payment gateways", path: "/dashboard/settings/payments", feature: "online_payment" },
          { title: "Integrations", path: "/dashboard/settings/integrations" },
        ],
      },
      { title: "Help & support", icon: LifeBuoy, path: "/dashboard/support", perm: "setting.manage" },
    ],
  },
];

export default sidebarSections;
