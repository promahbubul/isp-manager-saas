# ISP Management System (SaaS)

Multi-tenant ISP billing & management platform. Full product plan: [PLAN.md](PLAN.md).
Production setup (VPS + PM2 + Nginx): [DEPLOY.md](DEPLOY.md).

- `backend/` — Express 5 + TypeScript + MongoDB (Mongoose)
- `frontend/` — Next.js 16 (App Router) + Tailwind CSS 4

## Requirements

- Node.js 22+ and pnpm 11
- MongoDB 6+ running as a **replica set** (the app uses transactions; a standalone server will fail on signup)

## 1. MongoDB

Choose one:

**A. MongoDB Atlas (easiest).** Create a free cluster at https://www.mongodb.com/atlas. Atlas clusters
are replica sets already. Put the connection string in `backend/.env` → `DB_URL`.

**B. Local install (Windows).**

1. Install MongoDB Community Server (as a Windows service) and `mongosh`.
2. Open `C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg` as administrator and add:
   ```yaml
   replication:
     replSetName: rs0
   ```
3. Restart the service (PowerShell as administrator): `Restart-Service MongoDB`
4. Initialise the replica set once: `mongosh --eval "rs.initiate()"`
5. Keep the default `DB_URL=mongodb://localhost:27017/isp?replicaSet=rs0`.

## 2. Backend

```bash
cd backend
pnpm install
cp .env.example .env        # first time only — then set secrets (see below)
pnpm seed                   # creates plans + super admin (SUPER_ADMIN_EMAIL / PASSWORD) + starter Help/Blog articles
pnpm seed:demo-data company1   # (dev only) fills one ISP with sample customers, payments, tickets, expenses
pnpm dev                    # http://localhost:5000/api/v1/health
```

Generate secrets for `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use separate values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `ENCRYPTION_KEY`.

Other scripts: `pnpm test` (Vitest + in-memory MongoDB), `pnpm typecheck`, `pnpm build && pnpm start`,
`pnpm dev:worker` / `pnpm start:worker` (cron jobs in a separate process — set `RUN_JOBS=false` on the API then).

## 3. Frontend

```bash
cd frontend
pnpm install
cp .env.example .env.local  # first time only
pnpm dev                    # http://localhost:3000
```

Open http://localhost:3000/signup to create an ISP account (starts a 1-year trial, `TRIAL_DAYS`).

## API (Phase 0)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/health` | — |
| GET | `/api/v1/public/plans` | — |
| POST | `/api/v1/auth/signup` | — |
| POST | `/api/v1/auth/login` | — (`identifier` = phone or email) |
| POST | `/api/v1/auth/refresh-token` | `rt` cookie |
| POST | `/api/v1/auth/logout` | — |
| POST | `/api/v1/auth/logout-all` | Bearer |
| GET | `/api/v1/auth/me` | Bearer |
| POST | `/api/v1/auth/change-password` | Bearer |
| POST | `/api/v1/auth/admin/login` · `/admin/refresh-token` · `/admin/logout` | — / `prt` cookie |
| GET | `/api/v1/auth/admin/me` | Bearer (platform) |
| GET | `/api/v1/users/permissions` | Bearer |
| GET/POST | `/api/v1/users` | `staff.manage` |
| GET/PATCH/DELETE | `/api/v1/users/:id` | `staff.manage` |

### Phase 1 — ISP core

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/dashboard` | `dashboard.view` |
| GET · POST · PATCH/DELETE `:id` | `/api/v1/zones` | read: any · write: `zone.manage` |
| GET · POST · GET/PATCH/DELETE `:id` | `/api/v1/routers` | `router.view` / `router.manage` |
| POST | `/api/v1/routers/:id/test` | `router.view` |
| GET | `/api/v1/routers/:id/profiles` · `/active` | `router.view` |
| GET · POST · PATCH/DELETE `:id` | `/api/v1/packages` | read: any · write: `package.manage` |
| GET | `/api/v1/customers?search&status&zone&package&expiring=3&page&limit` | `customer.view` |
| POST · GET/PATCH `:id` · DELETE `:id` | `/api/v1/customers` | `customer.create` / `.view` / `.edit` / `.delete` |
| PATCH | `/api/v1/customers/:id/enable` · `/disable` | `customer.enable_disable` |
| POST | `/api/v1/customers/:id/kick` | `customer.kick` |
| GET | `/api/v1/customers/:id/live` | `customer.view` |
| POST · GET | `/api/v1/customers/:id/sync` · `/credentials` | `customer.edit` |
| POST | `/api/v1/payments/recharge` | `payment.recharge` |
| GET | `/api/v1/payments?from&to&method&customer` · `/payments/:id` (receipt) | `payment.view` |
| GET · PATCH | `/api/v1/settings` | read: any · write: `setting.manage` |

### MikroTik setup

1. `/ip service enable api` (or `api-ssl` on 8729) and restrict "Available From" to the server's IP.
2. Create an API user group with policies `read,write,api,policy,test,sensitive` and a user in it
   (`sensitive` lets the panel read existing PPP passwords when importing from MikroTik).
3. Create PPP profiles (e.g. `10M`) — packages map to these names.
4. In the panel: Network → Routers → Add → **Test**.

The server must reach the router's API port. Without a public IP use a VPN (planned: WireGuard, PLAN.md Flow 5).

### Background jobs

`RUN_JOBS=true` runs, in-process (node-cron, Asia/Dhaka):
- every 15 min — disable customers whose expiry + grace days passed, and kick their sessions
- every 10 min — retry customers whose router sync failed
- daily 10:00 — expiry reminder SMS (once per billing period)

Enable it in **one** process only.

### Phase 2 — communication & reports

| Method | Path | Permission |
|---|---|---|
| GET · PUT `:event` | `/api/v1/sms/templates` | `sms.view` / `sms.template` |
| POST | `/api/v1/sms/send` — `{ message, target: {type:"numbers"\|"customers"\|"filter", ...} }` | `sms.send` |
| GET | `/api/v1/sms/logs` · `/sms/balance` | `sms.view` |
| GET · POST · GET/PATCH `:id` | `/api/v1/tickets` (+ `/counts`, `/assignees`) | `ticket.view` / `.create` |
| PATCH | `/api/v1/tickets/:id/assign` · `/status` | `ticket.assign` / `ticket.solve` |
| POST | `/api/v1/tickets/:id/comments` | `ticket.view` |
| GET | `/api/v1/reports/:type?format=xlsx` — collection, due, expiring, expired, new-customers, left-customers, package-wise | `report.view` (+ `report.export`) |
| GET | `/api/v1/customers/export` · `/customers/import/template` | `customer.export` / `customer.import` |
| POST | `/api/v1/customers/import[?commit=true]` (multipart `file`) | `customer.import` |
| GET · POST | `/api/v1/customers/import/mikrotik/:routerId` | `customer.import` |
| GET · PATCH | `/api/v1/notifications` · `/:id/read` · `/read-all` | logged-in user |
| GET | `/api/v1/activity-logs` | `activity_log.view` |
| POST | `/api/v1/admin/companies/:id/sms-credits` | super admin / finance |

**SMS:** set `SMS_PROVIDER=http` and `SMS_HTTP_URL` (see `backend/.env.example`). Each ISP gets 50 free credits at
signup; ISPs buy more under My Subscription (or super admin adds them). Bangla SMS = 70 characters per credit.

### Phase 3 — payments (SaaS billing + customer bill payment)

Two independent layers, each with **SSLCommerz, bKash, Stripe and Manual (TrxID)** — every method can be switched on/off:

| Who pays whom | Where it's configured | Money goes to |
|---|---|---|
| ISP → platform (subscription, SMS credits) | Super admin → `/admin/gateways` | Platform merchant account |
| Customer → ISP (monthly bill) | ISP admin → Settings → Payment gateways | ISP's own merchant account |

- Credentials are entered in the panel and stored AES-encrypted; they are never returned in clear text.
- Nagad / Rocket / cards / net banking are available inside SSLCommerz's checkout page.
- Stripe charges subscriptions in **USD** (plan `priceUSD`); local gateways use **BDT**.
- Every result is re-verified server-side (SSLCommerz validation API, bKash execute/status, Stripe session retrieve);
  duplicate IPN/webhook/redirects are idempotent.
- Customers pay at **`/pay/<isp-slug>`** (customer ID or username + registered mobile). A paid bill runs the normal
  recharge: extends expiry, reconnects on MikroTik, sends the payment SMS. SMS templates can use `{pay_link}`.
- Manual payments wait as *pending review*: ISP staff approve customer payments under Billing → Online Payments;
  super admin approves subscription payments under `/admin/payments`. A TrxID can be claimed once.
- Subscription lifecycle (hourly): trial ended → suspended · period ended → past due (writable for `graceDays`)
  → suspended. Suspended ISPs can still pay and are reactivated immediately.

**Callback URLs** (set `API_PUBLIC_URL` to your public API address):

| Gateway | URL |
|---|---|
| SSLCommerz success/fail/cancel | `{API_PUBLIC_URL}/api/v1/pg/sslcommerz/return` (sent automatically) |
| SSLCommerz IPN | `{API_PUBLIC_URL}/api/v1/pg/sslcommerz/ipn` (sent automatically; also set it in the merchant panel) |
| bKash callback | `{API_PUBLIC_URL}/api/v1/pg/bkash/callback` (sent automatically) |
| Stripe webhook | `{API_PUBLIC_URL}/api/v1/pg/stripe/webhook/platform` or `/webhook/<companyId>` — event `checkout.session.completed` |

| Method | Path | Permission |
|---|---|---|
| GET · POST | `/api/v1/billing` · `/billing/checkout` · `/billing/sms-credits` | `subscription.manage` (owner) |
| GET · PUT `:gateway` | `/api/v1/settings/payment-gateways` | `setting.manage` |
| GET · POST `:id/approve` · `:id/reject` | `/api/v1/online-payments` | `payment.view` / `payment.recharge` |
| GET · POST `lookup` · POST `checkout` · GET `status/:tranId` | `/api/v1/public/pay/:slug` | public (rate-limited) |
| GET · PUT `:gateway` | `/api/v1/admin/gateways` | super admin |
| GET · POST `:id/review` | `/api/v1/admin/payments` | super admin / finance |
| GET · PATCH | `/api/v1/admin/settings` (SMS credit price, grace days) | super admin |

Also in Phase 3: `POST /auth/forgot-password` · `/auth/reset-password` (SMS OTP), `GET/PATCH /settings/company`,
`POST /billing/coupon` (preview), `GET/POST/PATCH /admin/coupons`. Public pages: `/pricing`, `/terms`, `/privacy`,
`/refund-policy`, `/contact` — set `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_SUPPORT_*`, `NEXT_PUBLIC_OFFICE_ADDRESS` in `frontend/.env.local`.

### Phase 4 — super admin

`/admin` panel: metrics, ISPs (suspend/activate, extend trial, assign plan, SMS credits, **log in as owner**), plans, coupons,
announcements, gateways, payments, audit log, platform admins, account (2FA). API under `/api/v1/admin/*`
(`metrics`, `companies`, `companies/:id/{status,extend-trial,assign-plan,impersonate,sms-credits}`, `plans`, `announcements`,
`platform-users`, `audit-logs`) and `/api/v1/auth/admin/{2fa/setup,2fa/enable,2fa/disable,change-password}`.
Write actions need `super_admin`; `finance` can also approve payments and add SMS credits; `support` can read and answer
support tickets. Turn on 2FA for every admin.

Also in Phase 4:

- **ISP → platform support:** ISPs use `/dashboard/support` (`/api/v1/support`, works even while suspended); platform
  staff answer at `/admin/support` (`/api/v1/admin/support-tickets`, `:id/reply`, `:id/status`). Replies notify the ISP.
- **System health:** `/admin/system` (`GET /api/v1/admin/system/health`) — database/replica set, worker jobs (each run is
  recorded in `JobRun`; overdue or failed jobs are flagged), offline routers, failed MikroTik syncs, SMS failures,
  payments waiting for review, urgent support tickets.
- **Plan features are enforced:** `requireFeature("ticket")` on `/tickets`, `online_payment` on gateway settings and the
  public pay page (403 `{ details: { code: "feature_locked" } }`). The sidebar shows locked items with 🔒 linking to the
  upgrade page. Trial includes Growth features.
- **Archive / restore / delete / export:** `POST /admin/companies/:id/{archive,restore}`, `DELETE /admin/companies/:id`
  (only when archived, body `{ confirmSlug }`; keeps invoices, platform payments and audit log), `GET
  /admin/companies/:id/export` and owner self-export `GET /settings/export` (streamed JSON, passwords never included).
### Phase 5 — customer portal

- `/portal/<slug>`: the ISP's customer logs in with a 6-digit SMS code (sent from the ISP's SMS balance; unknown numbers
  get the same answer). One number can hold several connections. Shows package, validity, due, payment history, a
  "Pay bill" button (pre-filled `/pay/<slug>?c=&p=`) and complaints (creates a `source: "portal"` ticket; replies are
  marked `fromCustomer`). Needs the `customer_portal` plan feature; complaints also need `ticket`.
- API: `GET /portal/isp/:slug`, `POST /portal/isp/:slug/{otp,verify}`, then Bearer: `GET /portal/me`,
  `GET /portal/accounts/:id/payments`, `GET|POST /portal/tickets`, `GET /portal/tickets/:id`, `POST /portal/tickets/:id/comments`.
  The 7-day portal token has `scope: "customer"` and cannot call any staff API.
- SMS: reminder/expired templates end with `{pay_link}` (empty when the plan has no online payment); `{portal_link}` is available.
- Optional subdomains: set `NEXT_PUBLIC_ROOT_DOMAIN` (frontend) and add a wildcard DNS record + certificate; `proxy.js`
  rewrites `speednet.<domain>/` to `/portal/speednet`.

- Portal also shows live router status (`GET /portal/accounts/:id/live`) and takes package change requests
  (`POST /portal/accounts/:id/package-request`; staff decide at `/package-requests/:id/decide`).

### Phase 6 — advanced ISP

| Area | UI | API |
|---|---|---|
| Accounts / P&L | `/dashboard/accounts` | `/accounts/entries`, `/accounts/pnl`, `/accounts/categories` |
| Resellers | `/dashboard/resellers` | `/resellers`, `/:id/deposit`, `/:id/adjust`, `/:id/ledger`, `/resellers/me` |
| Postpaid invoices | `/dashboard/billing/invoices` | `/invoices`, `/invoices/issue`, `/invoices/:id/void` |
| Employees & salary | `/dashboard/employees` | `/employees`, `/employees/salaries`, `/employees/salary-sheet?month=` |
| Cash handover | `/dashboard/collections` | `/collections/{me,summary,receivers,handovers}`, `/handovers/:id/decide` |
| Inventory | `/dashboard/inventory` | `/inventory/{summary,items,movements}` |
| BTRC IP log | `/dashboard/ip-log` | `/ip-logs`, `/ip-logs/export` (worker polls every 5 min) |
| WireGuard VPN | Routers → Use VPN | `POST/DELETE /routers/:id/vpn` (`WG_*` env, see DEPLOY.md §১১) |

Rules worth knowing: a reseller's recharge is paid from their balance (rate = package price − discount %, or a
per-package override) and is **not** ISP income — their deposit is. Postpaid payments settle the oldest invoice first;
the connection is cut when an invoice is unpaid past due date + grace days and restored when nothing is due. Salary,
purchases and reseller deposits are written to Accounts automatically.

### Phase 7 — growth

Settings → **Integrations** (`/dashboard/settings/integrations`): logo upload (`POST /settings/company/logo`), own SMS
gateway (`/settings/sms-gateway`, no credits used), WhatsApp Cloud API templates (`/settings/whatsapp`), API keys
(`/settings/api-keys`) for the public API `/public-api/v1/{customers,customers/:id,customers/:id/recharge,payments,packages}`
with header `X-API-Key`, and a custom portal domain (`/settings/custom-domain`, TXT verify; `GET /public/domain/:host`,
`GET /public/domain-check?domain=` for Caddy). Analytics: `/dashboard/analytics` (`GET /analytics`).
Not built (need hardware or a separate project): mobile app, RADIUS, OLT, Nagad direct API.

### Remaining feature-list items (also done)

- Marketing: `/blog`, `/help` (articles written in super admin → Content), `/faq`. (Demo booking was removed; `/demo` redirects to `/signup`.)
- Super admin: SMTP in Settings (test button), **Errors** page (5xx grouped, 30 days), refund on Payments.
- Customers: photo/NID upload (private: `POST|GET /customers/:id/documents/:kind`), fiber length, timeline
  (`/customers/:id/timeline`), bulk zone actions (`/customers/bulk`), package change now/prorate/next cycle
  (`/customers/:id/change-package`), other charges (`/customers/charges`). Package `vatPercent`.
- Tickets: attachments (`/tickets/:id/attachments`), SLA hours per priority in Settings, `status=overdue` filter.
- Accounts: cash book (`/accounts/cashbook`). Routers: `GET /routers/:id/sync-report`, `POST /routers/:id/sync-fix`,
  SSTP VPN (`POST /routers/:id/vpn {type:"sstp"}`, `SSTP_*` env).
- Email: daily summary 21:00 Dhaka (ISP can turn it off) and renewal reminders, via the SMTP set by the super admin.
- Activity log stores field-level before/after for customer, package, router and staff edits.
- Portal: PPPoE login (`/portal/isp/:slug/login`), receipts, profile and PPPoE password change, complaint photos, PWA.
- UI is English only.
- SMS gateways (ISP owner's own account, all plans): PutulHost WO SMS (`smsapi.resellcore.com`, server IP must be
  whitelisted in their panel), Twilio, Vonage, Plivo or any HTTP API — `/settings/sms-gateway` (`/providers`, `/test`, `/balance`).
- RADIUS: `POST /radius/authorize|accounting` for FreeRADIUS rlm_rest (basic auth = `RADIUS_API_SECRET`); routers switch with
  `POST /routers/:id/radius`. Config files in `deploy/freeradius/`.
- OLT: `/olts` (SNMP v2c, Huawei GPON profile, BDCOM unverified, custom OIDs), `POST /olts/:id/poll`, polled every 30 min;
  ONU signal is stored on the customer (`device.onuRx`) matched by ONU MAC/serial.
- Private files (NID, ticket attachments) live in `UPLOAD_DIR/private` and are never served by `/uploads`.

- `pnpm seed` only inserts missing default plans — it never overwrites prices or limits edited in the admin panel.

### UI & platform (redesign)

- **Design system** in `frontend/app/globals.css` (`@theme` tokens: `primary-*` indigo, `canvas/surface/subtle/line/ink/muted`).
  Shared UI kit in `components/ui` (Button with variants, fields, Card, Badge, Stat, skeleton Loading, Radix Modal that is a
  bottom sheet on phones, Table built on TanStack Table v8 — sticky header, row numbers, `100dvh - top bar` height,
  click-to-sort columns and rows-per-page on every table; pass `pager={list.pager}` from `usePaged()` for server lists).
- **Light / dark / system theme** via next-themes (`.dark` token overrides in `globals.css`); the icon switch
  `components/shell/ThemeToggle.jsx` is in the dashboard, admin, portal, auth pages and the marketing header.
- **Marketing site**: real app screenshots (`public/screens/*-light|dark.png`, switched with the theme) in
  `components/marketing/Screenshot.jsx`, scroll reveal + typing headline (`Motion.jsx`), per-plan colours
  (`PlanCards.jsx`). One-click light/dark button (`components/shell/ThemeToggle.jsx`; follows the OS until clicked).
- **UI kit extras**: `confirmDialog()` (promise-based, replaces window.confirm), `RowActions` ("⋯" menu per row),
  skeleton loading (`react-loading-skeleton`), route progress bar (`nextjs-toploader`), quick search + phone card view
  built into `Table`, custom 404 / error pages. `promptDialog()` asks for a reason (replaces window.prompt), `Tip`
  is a Radix tooltip.
- **Page permissions**: the dashboard layout blocks a page when the user lacks the permission its sidebar entry needs
  (`pagePermission()` in `components/dashboard/Sidebar.jsx`), so typing the URL shows "no access" instead of the page.
- **Excel export**: `ExportButton` on Payments, Invoices and Accounts downloads `/reports/payments|invoices|expenses`
  with the page's filters (needs `report.export` plus the module's view permission).
- **Payment refund**: `POST /payments/:id/refund` (permission `payment.refund`, reason required) — only the customer's
  latest payment; validity, due and advance go back to what they were. `POST /sms/logs/:id/resend` for failed SMS.
- **One login page** `/login` for every role: ISP staff → `/dashboard`, platform staff → `/admin` (2FA step inline).
- **App shell** `components/shell/AppShell.jsx`: sidebar on desktop, drawer on phones, sticky top bar, user menu — used by
  the ISP dashboard and the platform admin. Icons: lucide-react. Toasts: sonner. Charts: recharts.
- **Cursor pagination**: every list returns `meta.nextCursor`; pass it as `?cursor=` (stable under inserts, fast on big
  collections, ties broken by `_id`). `?page=` still works. Frontend hook `lib/usePaged.js`.
- **Backend hardening**: pino structured logs with `X-Request-Id`, secrets redacted (`LOG_LEVEL`), gzip compression,
  NoSQL-injection guard (`$`/dotted keys stripped from query and body), MongoDB-backed rate limits shared by all PM2
  instances, `/api/v1/health/live` and `/api/v1/health/ready`, graceful shutdown (drains for up to 15 s),
  `autoIndex` off in production + `pnpm db:indexes` (run by `deploy.sh`).

Response shape: `{ success, message, meta?, data }`; errors: `{ success: false, message, errors?: [{ path, message }] }`.

## Architecture notes

- **Tenant isolation:** `tenantPlugin` (`backend/src/app/plugins/tenant.plugin.ts`) adds `company` to tenant
  models and, inside an authenticated request, forces every query to the user's company (AsyncLocalStorage).
- **Auth:** 15-minute access token (memory on the client) + 30-day httpOnly refresh cookie. Bumping a
  user's `tokenVersion` (password change, deactivation, logout-all) invalidates all their sessions.
- **Permissions:** `backend/src/app/constants/permissions.ts`; middleware `authorize("customer.create")`.
- **Read-only when unpaid:** suspended companies or expired trials get `402` on writes.
- **Express 5** forwards async errors to the error handler, so no `catchAsync` wrapper is needed.
