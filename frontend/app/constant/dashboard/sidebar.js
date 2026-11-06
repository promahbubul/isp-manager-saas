import { FaMoneyBill, FaNetworkWired, FaUserAlt, FaUsersCog } from "react-icons/fa";
import { MdCardMembership, MdDashboard, MdHistory, MdSettings, MdSms, MdSupportAgent } from "react-icons/md";
import { TbReportAnalytics } from "react-icons/tb";

/**
 * `perm` hides the item when the user lacks that permission.
 * Later phases (resellers, accounts, inventory...) are listed in PLAN.md §18.
 */
const sidebarModules = [
  { id: "dashboard", title: "Dashboard", icon: MdDashboard, path: "/dashboard", perm: "dashboard.view" },
  {
    id: "customers",
    title: "Customers",
    icon: FaUserAlt,
    perm: "customer.view",
    subModules: [
      { id: "customers-all", title: "All Customers", path: "/dashboard/customers" },
      { id: "customers-create", title: "Add Customer", path: "/dashboard/customers/create", perm: "customer.create" },
      { id: "customers-import", title: "Import", path: "/dashboard/customers/import", perm: "customer.import" },
    ],
  },
  {
    id: "billing",
    title: "Billing",
    icon: FaMoneyBill,
    perm: "payment.view",
    subModules: [
      { id: "billing-recharge", title: "Recharge", path: "/dashboard/billing/recharge", perm: "payment.recharge" },
      { id: "billing-payments", title: "Payment History", path: "/dashboard/billing/payments" },
      { id: "billing-online", title: "Online Payments", path: "/dashboard/billing/online" },
    ],
  },
  { id: "tickets", title: "Support Tickets", icon: MdSupportAgent, path: "/dashboard/tickets", perm: "ticket.view" },
  {
    id: "sms",
    title: "SMS",
    icon: MdSms,
    perm: "sms.view",
    subModules: [
      { id: "sms-send", title: "Send SMS", path: "/dashboard/sms/send", perm: "sms.send" },
      { id: "sms-history", title: "SMS History", path: "/dashboard/sms/history" },
      { id: "sms-templates", title: "Templates", path: "/dashboard/sms/templates" },
    ],
  },
  { id: "reports", title: "Reports", icon: TbReportAnalytics, path: "/dashboard/reports", perm: "report.view" },
  {
    id: "network",
    title: "Network",
    icon: FaNetworkWired,
    perm: "package.view",
    subModules: [
      { id: "network-routers", title: "Routers", path: "/dashboard/routers", perm: "router.view" },
      { id: "network-packages", title: "Packages", path: "/dashboard/packages" },
      { id: "network-zones", title: "Zones", path: "/dashboard/zones" },
    ],
  },
  { id: "staff", title: "Staff", icon: FaUsersCog, path: "/dashboard/staff", perm: "staff.manage" },
  { id: "activity", title: "Activity Log", icon: MdHistory, path: "/dashboard/activity-log", perm: "activity_log.view" },
  { id: "subscription", title: "My Subscription", icon: MdCardMembership, path: "/dashboard/billing/subscription", perm: "subscription.manage" },
  {
    id: "settings",
    title: "Settings",
    icon: MdSettings,
    perm: "setting.manage",
    subModules: [
      { id: "settings-general", title: "General", path: "/dashboard/settings" },
      { id: "settings-payments", title: "Payment Gateways", path: "/dashboard/settings/payments" },
    ],
  },
];

export default sidebarModules;
