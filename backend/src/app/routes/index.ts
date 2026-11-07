import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import customerRoutes from "../modules/customer/customer.routes";
import dashboardRoutes from "../modules/dashboard/dashboard.routes";
import packageRoutes from "../modules/package/package.routes";
import paymentRoutes from "../modules/payment/payment.routes";
import planRoutes from "../modules/plan/plan.routes";
import routerRoutes from "../modules/router/router.routes";
import settingRoutes from "../modules/setting/setting.routes";
import userRoutes from "../modules/user/user.routes";
import zoneRoutes from "../modules/zone/zone.routes";
import activityLogRoutes from "../modules/activityLog/activityLog.routes";
import notificationRoutes from "../modules/notification/notification.routes";
import reportRoutes from "../modules/report/report.routes";
import smsRoutes from "../modules/sms/sms.routes";
import ticketRoutes from "../modules/ticket/ticket.routes";
import { ispSupportRoutes } from "../modules/support/support.routes";
import portalRoutes from "../modules/portal/portal.routes";
import accountsRoutes from "../modules/accounts/accounts.routes";
import resellerRoutes from "../modules/reseller/reseller.routes";
import invoiceRoutes from "../modules/invoice/invoice.routes";
import inventoryRoutes from "../modules/inventory/inventory.routes";
import ipLogRoutes from "../modules/iplog/iplog.routes";
import { packageRequestRoutes } from "../modules/portal/packageRequest";
import { ownGatewayRoutes } from "../modules/sms/ownGateway";
import { apiKeyRoutes, publicApiRoutes } from "../modules/apiKey/apiKey";
import { customDomainRoutes, publicDomainRoutes } from "../modules/company/customDomain";
import { analyticsRoutes } from "../modules/report/analytics";
import { customerExtraRoutes } from "../modules/customer/customer.extras";
import { routerSyncRoutes } from "../modules/router/routerSync";
import { publicContentRoutes } from "../modules/content/content";
import { radiusRoutes } from "../modules/radius/radius.routes";
import { oltRoutes } from "../modules/olt/olt";
import { whatsappRoutes } from "../modules/sms/whatsapp";
import { collectionRoutes, employeeRoutes } from "../modules/employee/employee.routes";
import adminRoutes from "../modules/admin/admin.routes";
import announcementRoutes from "../modules/announcement/announcement.routes";
import billingRoutes from "../modules/billing/billing.routes";
import pgRoutes from "../modules/onlinePayment/pg.routes";
import { publicPayRoutes, tenantGatewayRoutes, tenantOnlinePaymentRoutes } from "../modules/onlinePayment/onlinePayment.routes";

const router = Router();

const moduleRoutes: { path: string; route: Router }[] = [
  { path: "/auth", route: authRoutes },
  { path: "/public/plans", route: planRoutes },
  { path: "/public/pay", route: publicPayRoutes },
  { path: "/pg", route: pgRoutes },
  { path: "/users", route: userRoutes },
  { path: "/dashboard", route: dashboardRoutes },
  { path: "/zones", route: zoneRoutes },
  { path: "/routers", route: routerSyncRoutes },
  { path: "/routers", route: routerRoutes },
  { path: "/packages", route: packageRoutes },
  { path: "/customers", route: customerExtraRoutes },
  { path: "/customers", route: customerRoutes },
  { path: "/payments", route: paymentRoutes },
  { path: "/settings/payment-gateways", route: tenantGatewayRoutes },
  { path: "/settings/sms-gateway", route: ownGatewayRoutes },
  { path: "/settings/whatsapp", route: whatsappRoutes },
  { path: "/settings/api-keys", route: apiKeyRoutes },
  { path: "/settings/custom-domain", route: customDomainRoutes },
  { path: "/public", route: publicDomainRoutes },
  { path: "/public/content", route: publicContentRoutes },
  { path: "/radius", route: radiusRoutes },
  { path: "/olts", route: oltRoutes },
  { path: "/analytics", route: analyticsRoutes },
  { path: "/public-api/v1", route: publicApiRoutes },
  { path: "/settings", route: settingRoutes },
  { path: "/billing", route: billingRoutes },
  { path: "/online-payments", route: tenantOnlinePaymentRoutes },
  { path: "/sms", route: smsRoutes },
  { path: "/tickets", route: ticketRoutes },
  { path: "/support", route: ispSupportRoutes },
  { path: "/portal", route: portalRoutes },
  { path: "/accounts", route: accountsRoutes },
  { path: "/resellers", route: resellerRoutes },
  { path: "/invoices", route: invoiceRoutes },
  { path: "/inventory", route: inventoryRoutes },
  { path: "/ip-logs", route: ipLogRoutes },
  { path: "/package-requests", route: packageRequestRoutes },
  { path: "/employees", route: employeeRoutes },
  { path: "/collections", route: collectionRoutes },
  { path: "/reports", route: reportRoutes },
  { path: "/notifications", route: notificationRoutes },
  { path: "/announcements", route: announcementRoutes },
  { path: "/activity-logs", route: activityLogRoutes },
  { path: "/admin", route: adminRoutes },
];

for (const { path, route } of moduleRoutes) router.use(path, route);

export default router;
