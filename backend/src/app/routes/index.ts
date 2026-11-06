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
import adminRoutes from "../modules/admin/admin.routes";
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
  { path: "/routers", route: routerRoutes },
  { path: "/packages", route: packageRoutes },
  { path: "/customers", route: customerRoutes },
  { path: "/payments", route: paymentRoutes },
  { path: "/settings/payment-gateways", route: tenantGatewayRoutes },
  { path: "/settings", route: settingRoutes },
  { path: "/billing", route: billingRoutes },
  { path: "/online-payments", route: tenantOnlinePaymentRoutes },
  { path: "/sms", route: smsRoutes },
  { path: "/tickets", route: ticketRoutes },
  { path: "/reports", route: reportRoutes },
  { path: "/notifications", route: notificationRoutes },
  { path: "/activity-logs", route: activityLogRoutes },
  { path: "/admin", route: adminRoutes },
];

for (const { path, route } of moduleRoutes) router.use(path, route);

export default router;
