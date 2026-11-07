# ISP Management System — Full SaaS Product Plan

> Stack: **Express.js (TypeScript) + MongoDB (Mongoose) + Next.js (React)**
> Model: **Multi-tenant SaaS** — অনেক ISP কোম্পানি একই platform-এ নিজের account খুলে ব্যবহার করবে।
> Payments: **Stripe + SSLCommerz** (SaaS subscription), **SSLCommerz + bKash + Nagad** (ISP-র কাস্টমার bill pay)

---

## সূচিপত্র

1. [Product Vision](#1-product-vision)
2. [SaaS Model](#2-saas-model)
3. [User Roles](#3-user-roles)
4. [Full Feature List](#4-full-feature-list)
5. [Payment Architecture](#5-payment-architecture)
6. [Tech Stack](#6-tech-stack)
7. [System Architecture](#7-system-architecture)
8. [Project Folder Structure](#8-project-folder-structure)
9. [Database Schema](#9-database-schema)
10. [API Endpoints](#10-api-endpoints)
11. [Core Business Flows](#11-core-business-flows)
12. [Background Jobs (Cron/Queue)](#12-background-jobs)
13. [Permission System](#13-permission-system)
14. [Security](#14-security)
15. [Environment Variables](#15-environment-variables)
16. [Deployment & DevOps](#16-deployment--devops)
17. [Pricing Plan (উদাহরণ)](#17-pricing-plan-উদাহরণ)
18. [Development Roadmap](#18-development-roadmap)
19. [Testing Strategy](#19-testing-strategy)
20. [শুরুর আগে যে সিদ্ধান্ত নিতে হবে](#20-শুরুর-আগে-যে-সিদ্ধান্ত-নিতে-হবে)

---

## 1. Product Vision

**সমস্যা:** বাংলাদেশের ২,৫০০+ ছোট-মাঝারি ISP খাতা/Excel দিয়ে বিল রাখে, MikroTik-এ হাতে user বন্ধ/চালু করে, collector-এর টাকার হিসাব মেলে না, কাস্টমার complaint ট্র্যাক হয় না।

**সমাধান:** একটা cloud-based SaaS যেখানে ISP মালিক signup করে ৩০ মিনিটে:
- MikroTik connect করবে
- কাস্টমার import করবে
- Auto billing, auto disable/enable, SMS, online payment চালু হয়ে যাবে

**Unique Selling Points:**
- সম্পূর্ণ বাংলা + English interface
- Mobile-first (collector/lineman ফোনে কাজ করে)
- Self-signup + free trial (কারো সাহায্য ছাড়াই শুরু)
- Built-in VPN — router-এ public IP না থাকলেও কাজ করবে
- কাস্টমারের জন্য নিজস্ব portal (ISP-র subdomain/লোগো সহ)

---

## 2. SaaS Model

### 2.1 Multi-Tenancy Strategy
| Option | বর্ণনা | সিদ্ধান্ত |
|---|---|---|
| Shared DB, `company` field | সব tenant এক DB, প্রতি document-এ `company` | ✅ **এটাই ব্যবহার হবে** (সহজ, সস্তা, scale করা যায়) |
| DB per tenant | প্রতি ISP আলাদা DB | ❌ শুরুতে না (Enterprise plan-এ পরে option) |

**নিয়ম:**
- প্রতিটা tenant-scoped collection-এ `company: ObjectId` (required, indexed)
- একটা Mongoose plugin (`tenantPlugin`) যা প্রতিটা query-তে automatic `company` filter যোগ করবে
- JWT payload-এ `companyId` থাকবে; request-এ `req.tenant` set হবে

### 2.2 Tenant Identification
- Admin panel: `app.yourdomain.com` (login করলে JWT থেকে tenant)
- Customer portal: `{slug}.yourdomain.com` (যেমন `speednet.yourdomain.com`)
- Custom domain (Pro plan): `portal.speednet.com.bd` → CNAME → platform
- Next.js `middleware.js` host পড়ে tenant slug বের করবে

### 2.3 Tenant Lifecycle
```
Signup → Email/Phone verify → Trial (14 দিন) → Onboarding wizard
      → Plan কিনবে (Stripe/SSLCommerz) → Active
      → Payment fail → Grace (7 দিন) → Suspended (read-only)
      → 30 দিন suspended → Archived → (90 দিন পর) Deleted
```

### 2.4 Plan Limits & Feature Flags
- প্রতি plan-এ: `maxCustomers`, `maxRouters`, `maxStaff`, `features[]`
- Backend middleware `checkPlanLimit('customers')` এবং `requireFeature('reseller')`
- Limit পার হলে upgrade prompt দেখাবে

### 2.5 Onboarding Wizard (প্রথম login)
1. Company info + লোগো
2. Router যোগ (VPN script generate + test connection)
3. MikroTik profile থেকে Package import
4. MikroTik থেকে কাস্টমার import / Excel upload
5. SMS ও payment gateway setup (optional, skip করা যাবে)

---

## 3. User Roles

### 3.1 Platform Level (তোমার কোম্পানি)
| Role | কাজ |
|---|---|
| **Super Admin** | সব tenant, plan, revenue, settings |
| **Platform Support** | tenant-এর ticket দেখা, impersonate (log সহ) |
| **Platform Finance** | subscription, invoice, refund |

### 3.2 Tenant Level (ISP কোম্পানি)
| Role | কাজ |
|---|---|
| **Owner** | সব কিছু + billing/subscription + company delete |
| **Admin** | Owner-এর মতো, শুধু subscription ছাড়া |
| **Manager** | কাস্টমার, recharge, ticket, report |
| **Accountant** | payment, expense, report |
| **Collector** | assigned zone-এর কাস্টমার দেখা ও recharge |
| **Technician / Lineman** | ticket solve, কাস্টমারের live status |
| **Reseller** | নিজের কাস্টমার ও balance |
| **Custom Role** | Owner নিজে permission বেছে role বানাবে |

### 3.3 End User
| Role | কাজ |
|---|---|
| **Customer** | portal-এ বিল দেখা, online pay, complaint |

---

## 4. Full Feature List

### 4.A — Marketing Website (Public)
- Landing page (features, screenshots, testimonials)
- Pricing page (monthly/yearly toggle, BDT/USD)
- Signup / Login
- Blog (SEO), Documentation / Help Center, FAQ
- Contact / Demo request form
- Terms, Privacy Policy, Refund Policy (SSLCommerz-এর জন্য বাধ্যতামূলক)

### 4.B — Super Admin Panel (Platform)
1. **Dashboard:** MRR, ARR, active tenants, trial, churn, নতুন signup, মোট end-customer
2. **Tenant Management:** list, details, suspend/activate, plan change, trial extend, impersonate, delete
3. **Plan Management:** plan CRUD, limits, features, price (BDT/USD), monthly/yearly
4. **Subscription & Billing:** সব subscription, invoice, payment, refund, failed payment
5. **Coupon / Discount:** percent/fixed, মেয়াদ, usage limit
6. **SMS Credit Management:** SMS rate, tenant-এর SMS wallet top-up/adjust
7. **Platform Support Tickets:** tenant থেকে আসা ticket
8. **Announcements:** সব tenant-কে notice (dashboard banner/email)
9. **Global Settings:** payment gateway keys, SMS gateway, email SMTP, VPN server
10. **Audit Log:** platform staff-এর সব কাজ
11. **System Health:** queue status, router connection stats, error log
12. **Reports:** revenue, plan-wise tenant, gateway-wise collection

### 4.C — Tenant (ISP) Panel

#### 1. Dashboard
- মোট/active/expired/disabled কাস্টমার, এখন online
- আজ/এই মাসের collection, মোট due
- আজ/৩ দিনে মেয়াদ শেষ হবে
- Pending ticket, router status (online/offline)
- Chart: মাসিক আয়, নতুন vs চলে যাওয়া কাস্টমার, package-wise কাস্টমার

#### 2. Customer Management
- Create/Edit/Delete, profile photo, NID front/back upload
- Auto customer ID (`C-00001`)
- Connection type: PPPoE / Static IP / Hotspot
- PPPoE username/password (auto-generate option), MikroTik-এ auto sync
- Zone/Sub-zone, reseller, package, router assign
- Device info: ONU MAC, box, port, fiber length
- Status: active / expired / disabled / free / left
- Enable / Disable / Kick (disconnect) / Live status (uptime, IP, bandwidth)
- Package change (prorated/next cycle option)
- Customer timeline: payment, ticket, status change, SMS
- Bulk action: zone-wise disable/enable/SMS/package change
- Search, filter, sort, pagination
- Excel import/export, MikroTik থেকে import

#### 3. Package / Plan
- নাম, speed (up/down), BDIX speed, দাম, মেয়াদ (দিন)
- MikroTik PPP profile link (router থেকে dropdown)
- Reseller price, VAT/tax
- Active/inactive

#### 4. Billing & Recharge
- **Prepaid (expiry based)** এবং **Postpaid (monthly invoice)** — company setting দিয়ে বাছাই
- Recharge: cash / bKash / Nagad / bank / online
- Multiple month recharge, discount, partial payment, advance balance
- Connection fee, device sale, অন্যান্য charge
- Money receipt (PDF + print + SMS)
- Payment delete/refund (permission + log সহ)
- Auto disable (expiry + grace days), auto enable (payment হলে)
- Monthly invoice auto generate (postpaid)
- Due list, advance list

#### 5. Online Payment (কাস্টমার নিজে pay করবে)
- Tenant নিজের merchant account দেবে: **SSLCommerz / bKash PGW / Nagad**
- Portal বা SMS-এর payment link থেকে pay
- IPN/callback verify → auto recharge → MikroTik enable → SMS
- Manual bKash/Nagad (Send Money + TrxID) → office verify

#### 6. Router (MikroTik) Management
- একাধিক router, connection test, status monitor
- API (8728/8729 SSL) দিয়ে connect
- **Platform VPN:** router-এর জন্য WireGuard/SSTP config script auto generate
- PPP profile list, secret list, active session list
- Router resource (CPU, RAM, uptime)
- Sync tool: DB vs MikroTik mismatch দেখানো ও ঠিক করা

#### 7. Zone & Area
- Zone → Sub-zone (tree), map location (optional)
- Zone-wise collector/technician assign

#### 8. Reseller / Sub-ISP
- Reseller account (login সহ), নিজস্ব কাস্টমার
- Prepaid balance: deposit করবে, recharge-এ কাটবে
- Reseller-wise package price, commission
- Reseller statement / ledger

#### 9. Support Ticket
- কাস্টমার (portal) / অফিস থেকে ticket
- Category, priority, assign technician
- Status flow, comment, attachment
- SLA (কত ঘণ্টায় solve), SMS notify

#### 10. SMS
- **Platform SMS wallet** (tenant প্লাটফর্ম থেকে SMS credit কিনবে) অথবা **নিজের SMS gateway** (Pro plan)
- Template (বাংলা/English, variable: `{name}`, `{expiry}`, `{amount}`, `{due}`, `{pay_link}`)
- Auto SMS: welcome, payment, reminder, expired, ticket update, OTP
- Bulk SMS: zone/status/package wise
- SMS log, delivery status, balance
- বাংলা Unicode segment count (৭০ char/segment) দেখাবে

#### 11. Email & Notification
- In-app notification (bell icon)
- Email (staff-এর জন্য): daily summary, subscription reminder

#### 12. Staff & Employee
- Staff account (role + custom permission + zone)
- Employee profile, salary, salary payment history
- Attendance (optional, পরে)

#### 13. Collection & Cash Handover
- কোন collector কত টাকা তুলেছে (live)
- Cash handover: collector → office জমা, pending amount
- Collector-wise daily report

#### 14. Accounts
- Expense (category: bandwidth, ভাড়া, বেতন, বিদ্যুৎ, fiber, অন্যান্য)
- Income (recharge ছাড়া অন্য আয়)
- Upstream bandwidth bill
- Profit & Loss (মাসিক), Cash book

#### 15. Inventory
- Product (ONU, router, fiber, splitter, cable)
- Stock in (purchase), out (customer assign/sale), return
- Serial/MAC track, low stock alert

#### 16. Reports (সব PDF + Excel export)
- Collection (date/collector/zone/method wise)
- Due, advance, expiring, expired
- New / left customer
- Package wise customer
- Reseller statement
- Ticket report (category, technician, SLA)
- Expense, P&L
- SMS usage

#### 17. BTRC Compliance
- IP log: user, IP, MAC, login/logout time (MikroTik/RADIUS থেকে)
- কাস্টমার KYC (NID) record
- BTRC format export, ১+ বছর retention

#### 18. Settings
- Company profile, লোগো, receipt header/footer
- Billing rules: prepaid/postpaid, grace days, reminder days, auto disable on/off
- Payment gateway credentials (encrypted)
- SMS settings, templates
- Customer portal: subdomain, custom domain, theme color
- Language (বাংলা/English), timezone, currency
- **My Subscription:** current plan, usage, upgrade, invoice history, payment method

#### 19. Activity Log
- কে, কখন, কী পরিবর্তন (before/after), IP

#### 20. Data Export / Backup
- Tenant পুরো data export (JSON/Excel) করতে পারবে

### 4.D — Customer Portal (`{slug}.yourdomain.com`)
- Login: phone + OTP অথবা PPPoE username + password
- Dashboard: package, মেয়াদ, due, status
- Online pay (SSLCommerz/bKash/Nagad)
- Payment history, receipt download
- Ticket create/track
- Package change request
- Profile update (phone, password)
- PWA (mobile-এ install করা যাবে)

### 4.E — Mobile App (Phase পরে)
- Collector app: zone-wise list, recharge, offline mode
- Customer app: portal-এর মতো

---

## 5. Payment Architecture

দুইটা **সম্পূর্ণ আলাদা** payment layer:

```
┌───────────────────────────────────────────────────────────┐
│ LAYER 1: SaaS Subscription (ISP → তোমার Platform)         │
│   • Stripe         → international card, auto-recurring   │
│   • SSLCommerz     → BD card, bKash, Nagad, net banking   │
│   টাকা যাবে: তোমার merchant account-এ                   │
├───────────────────────────────────────────────────────────┤
│ LAYER 2: End-customer Bill (কাস্টমার → ISP)               │
│   • SSLCommerz / bKash PGW / Nagad                        │
│   • ISP-র নিজের merchant credential (tenant settings-এ)   │
│   টাকা যাবে: সরাসরি ISP-র account-এ                     │
└───────────────────────────────────────────────────────────┘
```

> ⚠️ Layer 2-তে কাস্টমারের টাকা তোমার account-এ নিয়ে পরে ISP-কে দেওয়া (aggregator model) বাংলাদেশে Bangladesh Bank-এর PSP লাইসেন্স ছাড়া ঝুঁকিপূর্ণ। তাই **প্রতি ISP নিজের merchant account** ব্যবহার করবে।

### 5.1 Stripe (Subscription)
- **Stripe Checkout** (subscription mode) + **Stripe Billing** (auto renew)
- **Customer Portal** (card বদলানো, cancel)
- প্রতি Plan-এর জন্য Stripe `Price` (monthly/yearly)
- Webhook events:
  - `checkout.session.completed` → subscription active
  - `invoice.paid` → period extend, invoice save
  - `invoice.payment_failed` → grace শুরু, email
  - `customer.subscription.updated` → plan change
  - `customer.subscription.deleted` → cancel
- Webhook signature verify (`stripe.webhooks.constructEvent`, raw body)

### 5.2 SSLCommerz (Subscription — manual renew)
- SSLCommerz-এ সাধারণ merchant-এর জন্য auto-recurring নেই → **invoice-based renew**
- Flow: মেয়াদ শেষের ৭ দিন আগে `SubscriptionInvoice` তৈরি → email/SMS → owner "Pay Now" → SSLCommerz session → IPN → **Validation API (`val_id`) দিয়ে verify** → period extend
- Success / Fail / Cancel / IPN — চারটা URL
- Amount + currency + tran_id মিলিয়ে দেখা (tampering রোধ)

### 5.3 Payment Rules (দুই layer-এই)
- প্রতি payment-এর unique `tran_id`, **idempotency** (একই webhook দুইবার এলে দুইবার credit হবে না)
- Frontend redirect-কে বিশ্বাস করা যাবে না — শুধু webhook/IPN + server-side validation
- সব gateway response raw `PaymentAttempt`-এ save
- Refund: Stripe API / SSLCommerz refund API, Super Admin থেকে

### 5.4 Gateway Adapter Pattern
```ts
interface PaymentGateway {
  createSession(input): Promise<{ url: string; tranId: string }>
  verify(payload): Promise<{ success: boolean; amount: number; tranId: string; raw: any }>
  refund(tranId, amount): Promise<any>
}
// StripeGateway, SslcommerzGateway, BkashGateway, NagadGateway
```

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 22 LTS, Express 5, TypeScript |
| Database | MongoDB 7+ (replica set — transaction এর জন্য), Mongoose |
| Cache/Queue | Redis + BullMQ |
| Validation | Zod |
| Auth | JWT (access 15m + refresh 30d httpOnly cookie), bcrypt, OTP |
| MikroTik | `node-routeros` |
| VPN | WireGuard server (platform VPS) |
| Payment | `stripe`, SSLCommerz REST, bKash/Nagad REST |
| SMS | BD SMS gateway adapter (BulkSMSBD / SSL Wireless / Alpha ইত্যাদি) |
| Email | Nodemailer + SMTP / Resend / Amazon SES |
| File storage | Cloudinary / S3 / R2 (adapter) |
| PDF | Puppeteer অথবা `pdfkit` |
| Excel | `exceljs` |
| Logging | `pino` + log file / Better Stack |
| Error tracking | Sentry |
| API Docs | Swagger (OpenAPI) |
| Frontend | Next.js (App Router), React 19, Tailwind CSS 4 |
| UI Kit | shadcn/ui (বা নিজস্ব), react-icons |
| Data fetching | Axios + TanStack Query |
| Forms | react-hook-form + zod |
| Charts | Recharts |
| i18n | `next-intl` (বাংলা/English) |
| Date | dayjs (Asia/Dhaka) |
| Testing | Jest/Vitest + Supertest, Playwright |
| Deploy | VPS + PM2 + Nginx, GitHub Actions |

---

## 7. System Architecture

```
                    ┌──────────────────────────────┐
                    │        Cloudflare (DNS/SSL)  │
                    └──────────────┬───────────────┘
                                   │
                         ┌─────────▼─────────┐
                         │      Nginx        │
                         └───┬──────────┬────┘
            ┌────────────────┘          └───────────────┐
   ┌────────▼────────┐                         ┌────────▼────────┐
   │ Next.js         │  REST /api/v1           │ Express API     │
   │ - marketing     │ ───────────────────────▶│ (stateless)     │
   │ - tenant panel  │                         └──┬───┬───┬───┬──┘
   │ - super admin   │                            │   │   │   │
   │ - customer      │       ┌────────────────────┘   │   │   └──────────┐
   │   portal        │       │            ┌───────────┘   │              │
   └─────────────────┘  ┌────▼────┐  ┌────▼────┐   ┌──────▼──────┐ ┌─────▼─────┐
                        │ MongoDB │  │  Redis  │   │ Worker      │ │ WireGuard │
                        │ replica │  │ (queue, │   │ (BullMQ:    │ │ VPN server│
                        └─────────┘  │  cache) │   │ cron, SMS,  │ └─────┬─────┘
                                     └─────────┘   │ mikrotik)   │       │
                                                   └──────┬──────┘       │
                                                          │   ┌──────────▼─────────┐
          Stripe / SSLCommerz / bKash / Nagad ◀───────────┤   │ ISP MikroTik       │
          SMS Gateway / Email / Cloudinary   ◀────────────┘   │ routers (tenant)   │
                                                              └────────────────────┘
```

- **API** এবং **Worker** আলাদা process (একই codebase, ভিন্ন entry: `server.ts`, `worker.ts`)
- MikroTik-এর সব ভারী কাজ (bulk disable, sync, ip log) queue-তে যাবে

---

## 8. Project Folder Structure

```
isp_management_system/
├── PLAN.md
├── README.md
├── .github/workflows/          # CI/CD
├── backend/
└── frontend/
```

### 8.1 Backend

```
backend/
├── package.json
├── tsconfig.json
├── .env / .env.example
├── ecosystem.config.js         # PM2 (api + worker)
└── src/
    ├── server.ts                    # DB connect + HTTP listen
    ├── worker.ts                    # BullMQ workers + schedulers
    ├── app.ts                       # express app, middlewares, routes
    ├── scripts/
    │   ├── seed.ts                  # super admin, default plans, permissions
    │   └── migrate.ts
    └── app/
        ├── config/
        │   ├── index.ts             # env (zod দিয়ে validate)
        │   ├── db.ts
        │   └── redis.ts
        ├── routes/index.ts          # সব module route register
        ├── middlewares/
        │   ├── auth.ts              # JWT verify → req.user, req.tenant
        │   ├── authorize.ts         # permission check
        │   ├── tenant.ts            # tenant status (suspended?) check
        │   ├── planLimit.ts         # checkPlanLimit / requireFeature
        │   ├── validateRequest.ts
        │   ├── rateLimiter.ts
        │   ├── upload.ts            # multer
        │   ├── globalErrorHandler.ts
        │   └── notFound.ts
        ├── errors/
        │   ├── AppError.ts
        │   ├── handleZodError.ts
        │   ├── handleMongooseError.ts
        │   └── handleDuplicateError.ts
        ├── utils/
        │   ├── catchAsync.ts
        │   ├── sendResponse.ts
        │   ├── QueryBuilder.ts
        │   ├── jwt.ts
        │   ├── encryption.ts        # AES-256-GCM (router/gateway secrets)
        │   ├── counter.ts           # auto ID (C-00001)
        │   ├── date.ts              # Asia/Dhaka
        │   └── logger.ts
        ├── plugins/
        │   ├── tenant.plugin.ts     # auto company filter
        │   └── softDelete.plugin.ts
        ├── constants/
        │   ├── roles.ts
        │   ├── permissions.ts
        │   └── enums.ts
        ├── services/                # বাইরের system adapter
        │   ├── mikrotik/
        │   │   ├── mikrotik.client.ts     # connection pool
        │   │   └── mikrotik.service.ts
        │   ├── vpn/wireguard.service.ts
        │   ├── payment/
        │   │   ├── gateway.interface.ts
        │   │   ├── stripe.gateway.ts
        │   │   ├── sslcommerz.gateway.ts
        │   │   ├── bkash.gateway.ts
        │   │   └── nagad.gateway.ts
        │   ├── sms/
        │   │   ├── sms.interface.ts
        │   │   └── providers/*.ts
        │   ├── email/email.service.ts
        │   ├── storage/storage.service.ts
        │   ├── pdf/pdf.service.ts
        │   └── excel/excel.service.ts
        ├── queues/
        │   ├── index.ts
        │   ├── mikrotik.queue.ts
        │   ├── sms.queue.ts
        │   ├── email.queue.ts
        │   └── report.queue.ts
        ├── jobs/                    # scheduled jobs (section 12)
        └── modules/
            │ ── PLATFORM ──
            ├── auth/
            ├── platformUser/        # super admin staff
            ├── company/             # tenant
            ├── plan/
            ├── subscription/
            ├── subscriptionInvoice/
            ├── coupon/
            ├── billingWebhook/      # stripe + sslcommerz webhook/IPN
            ├── smsWallet/
            ├── platformTicket/
            ├── announcement/
            │ ── TENANT ──
            ├── user/                # tenant staff
            ├── role/                # custom role
            ├── zone/
            ├── router/
            ├── package/
            ├── customer/
            ├── payment/             # recharge / collection
            ├── invoice/             # postpaid monthly bill
            ├── onlinePayment/       # end-customer gateway flow
            ├── reseller/
            ├── ticket/
            ├── sms/
            ├── notification/
            ├── employee/
            ├── cashHandover/
            ├── expense/
            ├── income/
            ├── inventory/
            ├── ipLog/
            ├── report/
            ├── dashboard/
            ├── setting/
            ├── activityLog/
            ├── upload/
            ├── export/
            │ ── PORTAL ──
            └── portal/              # customer portal API (auth, me, pay, ticket)
```

প্রতিটা module-এর ভেতরে:
```
customer/
├── customer.interface.ts
├── customer.model.ts
├── customer.validation.ts
├── customer.service.ts
├── customer.controller.ts
├── customer.routes.ts
└── customer.constant.ts      # searchable fields, enums
```

### 8.2 Frontend

```
frontend/
├── middleware.js                    # host → tenant slug, auth guard
├── next.config.mjs
├── messages/                        # i18n
│   ├── bn.json
│   └── en.json
├── app/
│   ├── (marketing)/                 # yourdomain.com
│   │   ├── page.jsx                 # landing
│   │   ├── pricing/page.jsx
│   │   ├── features/page.jsx
│   │   ├── blog/[slug]/page.jsx
│   │   ├── docs/[...slug]/page.jsx
│   │   ├── contact/page.jsx
│   │   ├── terms/page.jsx
│   │   ├── privacy/page.jsx
│   │   └── refund-policy/page.jsx
│   ├── (auth)/
│   │   ├── login/page.jsx
│   │   ├── signup/page.jsx
│   │   ├── verify/page.jsx
│   │   ├── forgot-password/page.jsx
│   │   └── reset-password/page.jsx
│   ├── onboarding/page.jsx          # setup wizard
│   ├── (tenant)/                    # app.yourdomain.com
│   │   ├── layout.jsx               # sidebar + topbar + subscription banner
│   │   ├── dashboard/page.jsx
│   │   ├── customers/
│   │   │   ├── page.jsx
│   │   │   ├── create/page.jsx
│   │   │   ├── import/page.jsx
│   │   │   └── [id]/{page,edit}/page.jsx
│   │   ├── packages/page.jsx
│   │   ├── zones/page.jsx
│   │   ├── routers/{page,[id]}/page.jsx
│   │   ├── billing/
│   │   │   ├── recharge/page.jsx
│   │   │   ├── payments/page.jsx
│   │   │   ├── invoices/page.jsx
│   │   │   ├── online-payments/page.jsx
│   │   │   └── due/page.jsx
│   │   ├── resellers/{page,[id]}/page.jsx
│   │   ├── tickets/{page,[id]}/page.jsx
│   │   ├── sms/{send,history,templates,wallet}/page.jsx
│   │   ├── staff/{users,roles}/page.jsx
│   │   ├── employees/{page,salary}/page.jsx
│   │   ├── collection/{page,handover}/page.jsx
│   │   ├── accounts/{expenses,income,profit-loss}/page.jsx
│   │   ├── inventory/{products,stock}/page.jsx
│   │   ├── ip-logs/page.jsx
│   │   ├── reports/[type]/page.jsx
│   │   ├── activity-log/page.jsx
│   │   ├── notifications/page.jsx
│   │   └── settings/
│   │       ├── company/page.jsx
│   │       ├── billing-rules/page.jsx
│   │       ├── payment-gateway/page.jsx
│   │       ├── sms/page.jsx
│   │       ├── portal/page.jsx
│   │       └── subscription/page.jsx   # plan, usage, upgrade, invoices
│   ├── (super-admin)/admin/
│   │   ├── dashboard/page.jsx
│   │   ├── tenants/{page,[id]}/page.jsx
│   │   ├── plans/page.jsx
│   │   ├── subscriptions/page.jsx
│   │   ├── invoices/page.jsx
│   │   ├── coupons/page.jsx
│   │   ├── sms-credit/page.jsx
│   │   ├── tickets/page.jsx
│   │   ├── announcements/page.jsx
│   │   ├── system/page.jsx
│   │   ├── audit-log/page.jsx
│   │   └── settings/page.jsx
│   ├── portal/                      # {slug}.yourdomain.com
│   │   ├── login/page.jsx
│   │   ├── page.jsx
│   │   ├── pay/page.jsx
│   │   ├── payments/page.jsx
│   │   ├── tickets/page.jsx
│   │   └── profile/page.jsx
│   └── payment/                     # gateway redirect pages
│       ├── success/page.jsx
│       ├── fail/page.jsx
│       └── cancel/page.jsx
├── components/
│   ├── ui/                          # Button, Input, Select, Modal, Drawer, Table,
│   │                                # Badge, Card, Tabs, Pagination, DatePicker, Empty
│   ├── layout/                      # Sidebar, Topbar, Breadcrumb, LanguageSwitch
│   ├── marketing/                   # Hero, PricingCard, FeatureGrid
│   ├── dashboard/                   # StatCard, Charts
│   ├── customer/                    # CustomerForm, CustomerTable, LiveStatus
│   ├── billing/                     # RechargeModal, Receipt
│   ├── router/                      # RouterForm, VpnScriptModal
│   ├── subscription/                # PlanCard, UsageBar, UpgradeModal
│   └── common/                      # PermissionGate, ConfirmDialog, FileUpload
├── lib/
│   ├── axios.js                     # interceptor, refresh token
│   ├── queryClient.js
│   ├── permissions.js
│   └── utils.js                     # taka format, date
├── hooks/                           # useAuth, useCustomers, usePermission ...
├── store/                           # (Zustand) auth/user/tenant state
└── constants/
    ├── sidebar.js
    └── enums.js
```

---

## 9. Database Schema

> প্রতিটা collection-এ `createdAt`, `updatedAt`। **(T)** = tenant-scoped (`company` field + index)।

### 9.1 Platform Collections

```ts
PlatformUser { name, email, password, role: 'super_admin'|'support'|'finance',
               isActive, lastLogin, twoFactorSecret? }

Company {
  name, slug (unique), logo, email, phone, address, district,
  btrcLicenseNo, licenseType: 'nationwide'|'divisional'|'district'|'upazila',
  owner: ObjectId(User),
  status: 'trial'|'active'|'past_due'|'suspended'|'archived',
  trialEndsAt,
  customDomain?, portalTheme: { primaryColor },
  locale: 'bn'|'en', timezone: 'Asia/Dhaka',
  smsBalance: Number,            // SMS credit
  usage: { customers, routers, staff },  // cached count
  deletedAt?
}

Plan {
  name, slug, description,
  priceBDT: { monthly, yearly }, priceUSD: { monthly, yearly },
  stripePriceIds: { monthly, yearly },
  limits: { customers, routers, staff, resellers },
  features: ['reseller','online_payment','custom_domain','own_sms_gateway',
             'inventory','ip_log','api_access','white_label'],
  isPublic, isActive, sortOrder
}

Subscription {
  company, plan, interval: 'monthly'|'yearly',
  gateway: 'stripe'|'sslcommerz'|'manual',
  status: 'trialing'|'active'|'past_due'|'canceled'|'expired',
  currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd,
  stripeCustomerId?, stripeSubscriptionId?, coupon?
}

SubscriptionInvoice {
  company, subscription, invoiceNo, plan, interval,
  amount, discount, tax, total, currency: 'BDT'|'USD',
  status: 'draft'|'open'|'paid'|'void'|'refunded',
  dueDate, paidAt, gateway, tranId, pdfUrl
}

PaymentAttempt {          // সব gateway-র raw log (platform + tenant)
  company?, scope: 'subscription'|'customer_bill'|'sms_credit',
  gateway, tranId (unique), amount, currency,
  status: 'initiated'|'success'|'failed'|'canceled',
  refId, requestPayload, responsePayload, ipnPayload, validatedAt
}

Coupon { code, type: 'percent'|'fixed', value, maxUses, used,
         validFrom, validTo, plans: [ObjectId], isActive }

SmsCreditTransaction { company, type: 'purchase'|'usage'|'adjust'|'refund',
                       credits, amount?, balanceAfter, ref? }

PlatformTicket { company, user, subject, messages:[{by, byType, text, files, at}],
                 status, priority }

Announcement { title, body, type: 'info'|'warning', audience: 'all'|plan[],
               startAt, endAt }

PlatformAuditLog { platformUser, action, target, targetId, meta, ip }

PlatformSetting { key, value }   // gateway keys (encrypted), smtp, vpn
```

### 9.2 Tenant Collections (সব (T))

```ts
User {                         // tenant staff
  company, name, phone, email, password, avatar,
  role: 'owner'|'admin'|'manager'|'accountant'|'collector'|'technician'|'reseller'|'custom',
  customRole?: ObjectId(Role), permissions: [String],
  zones: [ObjectId], reseller?: ObjectId,
  isActive, lastLogin, refreshTokenVersion
}

Role { company, name, permissions: [String] }

Zone { company, name, parent?: ObjectId, collectors:[ObjectId],
       technicians:[ObjectId], reseller?, location?: { lat, lng } }

Router {
  company, name, host, port, useSSL, username, password(encrypted),
  connectionMode: 'public'|'vpn',
  vpn?: { publicKey, privateKey(encrypted), assignedIp },
  status: 'online'|'offline', lastCheckedAt, resources?: { cpu, memory, uptime }
}

Package {
  company, name, speedUp, speedDown, bdixSpeed?, price, validityDays,
  router, mikrotikProfile, vatPercent, resellerPrice?, isActive
}

Customer {
  company, customerId,              // C-00001
  name, phone, altPhone, email, nid, photo, nidFront, nidBack,
  address, zone, reseller?,
  connectionType: 'pppoe'|'static'|'hotspot',
  pppoe: { username, password(encrypted) },
  staticIp?, macAddress?,
  package, router, monthlyFee, discount,
  billingType: 'prepaid'|'postpaid',
  expiryDate, balance, dueAmount,
  status: 'active'|'expired'|'disabled'|'free'|'left',
  autoDisable, connectionDate, leftDate?,
  device: { onuMac, boxNo, port, fiberLength },
  portalPassword?, syncStatus: 'synced'|'pending'|'failed',
  note, deletedAt?
}

Payment {                         // সব collection
  company, receiptNo, customer,
  type: 'recharge'|'invoice'|'connection_fee'|'device_sale'|'other',
  amount, discount, months,
  method: 'cash'|'bkash'|'nagad'|'bank'|'sslcommerz'|'online',
  trxId?, invoice?, onlinePayment?: ObjectId(PaymentAttempt),
  previousExpiry, newExpiry,
  receivedBy, reseller?, handedOver: Boolean, cashHandover?,
  status: 'success'|'refunded', note
}

Invoice {                         // postpaid
  company, invoiceNo, customer, month: 'YYYY-MM',
  items: [{ title, amount }], total, paid, due,
  status: 'unpaid'|'partial'|'paid'|'void', dueDate
}

TenantGateway {                   // ISP-র নিজের merchant credential
  company, gateway: 'sslcommerz'|'bkash'|'nagad',
  credentials (encrypted), sandbox: Boolean, isActive
}

Reseller { company, user, name, phone, balance, commissionPercent, zones }
ResellerTransaction { company, reseller, type: 'deposit'|'deduct'|'refund',
                      amount, balanceAfter, payment?, by, note }

Ticket {
  company, ticketNo, customer, category, subject, description,
  priority: 'low'|'medium'|'high', source: 'office'|'portal'|'phone',
  assignedTo, status: 'open'|'in_progress'|'solved'|'closed',
  comments: [{ by, text, files, at }], solvedAt, slaDueAt
}

SmsTemplate { company, event, language, message, isActive }
SmsLog { company, to, message, event, segments, cost, provider,
         status: 'queued'|'sent'|'delivered'|'failed', providerResponse }
TenantSmsGateway { company, provider, credentials(encrypted), senderId }

Notification { company, user, title, body, link, isRead }

Employee { company, user?, name, phone, nid, designation, salary, joinDate, isActive }
SalaryPayment { company, employee, month, amount, paidAt, by, note }

CashHandover { company, collector, amount, payments:[ObjectId],
               receivedBy, date, note }

Expense { company, category, amount, date, note, attachment, by }
Income  { company, category, amount, date, note, by }

Product { company, name, category, unit, stock, buyPrice, sellPrice, lowStockAlert }
StockTransaction { company, product, type: 'in'|'out'|'return'|'damage',
                   qty, unitPrice, customer?, serialNo?, mac?, by, note }

IpLog { company, customer, username, ip, mac, router, loginAt, logoutAt }
// index: {company, username, loginAt}; retention ≥ 1 বছর (archive collection)

ActivityLog { company, user, action, entity, entityId, before, after, ip, userAgent }

TenantSetting {
  company,
  billing: { type, graceDays, reminderDaysBefore, autoDisable, invoiceDay },
  receipt: { header, footer, showLogo },
  portal: { enabled, allowOnlinePay, allowTicket },
  sms: { useOwnGateway, autoEvents: { welcome, payment, reminder, expired, ticket } }
}

Counter { company, key, seq }     // customer, receipt, invoice, ticket
Otp { phone, codeHash, purpose, attempts, expiresAt }   // TTL index
```

### 9.3 গুরুত্বপূর্ণ Index
```
Customer: {company:1, 'pppoe.username':1} unique
          {company:1, phone:1}
          {company:1, status:1, expiryDate:1}
          {company:1, zone:1}
          text index: name, phone, customerId, pppoe.username
Payment:  {company:1, createdAt:-1}, {company:1, customer:1}, {company:1, receivedBy:1, handedOver:1}
PaymentAttempt: {tranId:1} unique
IpLog:    {company:1, username:1, loginAt:-1}
Company:  {slug:1} unique, {customDomain:1} unique sparse
Otp:      {expiresAt:1} TTL
```

---

## 10. API Endpoints

Base: `/api/v1` — Response format:
```json
{ "success": true, "message": "...", "meta": { "page": 1, "limit": 20, "total": 250 }, "data": {} }
```

### 10.1 Public / Auth
```
POST /auth/signup                   # company + owner তৈরি, trial শুরু
POST /auth/verify-email | /auth/verify-phone
POST /auth/login
POST /auth/refresh-token
POST /auth/logout
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/change-password
GET  /auth/me
GET  /public/plans                  # pricing page
GET  /public/tenant/:slug           # portal branding
POST /public/contact
```

### 10.2 Subscription (tenant owner)
```
GET  /subscription                  # current plan + usage
POST /subscription/checkout         # { planId, interval, gateway: 'stripe'|'sslcommerz', coupon }
POST /subscription/change-plan
POST /subscription/cancel
GET  /subscription/portal           # Stripe customer portal URL
GET  /subscription/invoices
GET  /subscription/invoices/:id/pdf
POST /coupons/validate
POST /sms-wallet/purchase           # SMS credit কেনা
GET  /sms-wallet/transactions
```

### 10.3 Webhooks / IPN
```
POST /webhooks/stripe               # raw body
POST /webhooks/sslcommerz/ipn
POST /payments/sslcommerz/success | /fail | /cancel     # redirect handler
POST /webhooks/bkash/callback
POST /webhooks/nagad/callback
POST /webhooks/sms/delivery         # SMS DLR
```

### 10.4 Super Admin (`/admin/*`)
```
GET   /admin/dashboard
CRUD  /admin/tenants      + PATCH /:id/suspend | /:id/activate | /:id/extend-trial
POST  /admin/tenants/:id/impersonate
CRUD  /admin/plans
GET   /admin/subscriptions, /admin/invoices
POST  /admin/invoices/:id/refund
CRUD  /admin/coupons
POST  /admin/sms-credit/adjust
CRUD  /admin/announcements
GET   /admin/tickets  + POST /:id/reply
GET   /admin/audit-logs
GET   /admin/system/health
GET/PATCH /admin/settings
CRUD  /admin/platform-users
```

### 10.5 Tenant
```
DASHBOARD   GET /dashboard

USERS/ROLES CRUD /users, CRUD /roles, GET /permissions

ZONES       CRUD /zones
ROUTERS     CRUD /routers
            POST /routers/:id/test
            GET  /routers/:id/vpn-script
            GET  /routers/:id/profiles | /secrets | /active | /resources
            POST /routers/:id/import-customers
            GET  /routers/:id/sync-diff   POST /routers/:id/sync

PACKAGES    CRUD /packages   POST /packages/import-from-router

CUSTOMERS   GET    /customers?search&zone&status&package&reseller&expiryFrom&expiryTo&page&limit&sort
            POST   /customers
            GET    /customers/:id
            PATCH  /customers/:id
            DELETE /customers/:id
            PATCH  /customers/:id/enable | /disable
            POST   /customers/:id/kick
            GET    /customers/:id/live
            PATCH  /customers/:id/change-package
            GET    /customers/:id/timeline
            POST   /customers/bulk          # {action, ids|filter}
            POST   /customers/import        # excel
            GET    /customers/export

BILLING     POST /payments/recharge
            POST /payments                  # other payment types
            GET  /payments   GET /payments/:id   GET /payments/:id/receipt
            POST /payments/:id/refund
            CRUD /invoices   POST /invoices/generate
            GET  /online-payments
            POST /online-payments/manual-verify     # bKash TrxID

GATEWAYS    GET/PUT /settings/gateways/:gateway  POST /settings/gateways/:gateway/test

RESELLERS   CRUD /resellers  POST /resellers/:id/deposit  GET /resellers/:id/ledger

TICKETS     CRUD /tickets  PATCH /tickets/:id/assign | /status  POST /tickets/:id/comments

SMS         POST /sms/send   GET /sms/logs   CRUD /sms/templates
            GET/PUT /settings/sms-gateway

NOTIF       GET /notifications   PATCH /notifications/:id/read   PATCH /notifications/read-all

EMPLOYEES   CRUD /employees   POST /employees/:id/salary   GET /salary-payments
COLLECTION  GET /collection/summary   GET /cash-handover/pending   CRUD /cash-handover
ACCOUNTS    CRUD /expenses   CRUD /income
INVENTORY   CRUD /products   POST /stock/in | /out | /return   GET /stock/transactions

IP LOG      GET /ip-logs   GET /ip-logs/export

REPORTS     GET /reports/collection | /due | /advance | /expiring | /expired
                 | /new-customers | /left-customers | /package-wise | /reseller
                 | /tickets | /expenses | /profit-loss | /sms-usage
            ?format=json|pdf|xlsx

SETTINGS    GET/PATCH /settings   GET/PATCH /settings/company
ACTIVITY    GET /activity-logs
UPLOAD      POST /upload
EXPORT      POST /export/all   GET /export/:jobId
SUPPORT     CRUD /support-tickets          # platform-এর কাছে
```

### 10.6 Customer Portal (`/portal/*`)
```
POST /portal/otp/send   POST /portal/otp/verify   POST /portal/login
GET  /portal/me
GET  /portal/payments   GET /portal/payments/:id/receipt
POST /portal/pay                    # { gateway, months } → session URL
GET  /portal/tickets    POST /portal/tickets
POST /portal/package-change-request
PATCH /portal/profile
```

---

## 11. Core Business Flows

### Flow 1: Signup & Onboarding
```
1. POST /auth/signup {companyName, slug, ownerName, phone, email, password}
2. Transaction: Company(status=trial, trialEndsAt=+14d) + User(owner) + TenantSetting(default)
             + default SmsTemplates + Subscription(status=trialing, plan=trial plan)
             + বোনাস SMS credit (যেমন ৫০)
3. OTP/email verify
4. Onboarding wizard → router → package → customer import
```

### Flow 2: Subscription Purchase — Stripe
```
1. Owner pricing থেকে plan বাছাই → POST /subscription/checkout {gateway:'stripe'}
2. Backend: Stripe customer (না থাকলে) → Checkout Session (mode=subscription, metadata.companyId)
3. Redirect → Stripe page → pay
4. Webhook checkout.session.completed → Subscription active, Company.status=active
5. প্রতি মাসে invoice.paid → currentPeriodEnd update + SubscriptionInvoice save
6. invoice.payment_failed → status=past_due, email/SMS, ৭ দিন grace
```

### Flow 3: Subscription Purchase — SSLCommerz
```
1. POST /subscription/checkout {gateway:'sslcommerz'}
2. SubscriptionInvoice(open) + PaymentAttempt(initiated, tranId)
3. SSLCommerz session API → GatewayPageURL → redirect
4. IPN → val_id নিয়ে Validation API call → amount/currency/tranId মেলানো
5. Success → invoice paid, subscription period extend, company active
6. Renew: job মেয়াদের ৭ দিন আগে নতুন invoice + reminder; না দিলে past_due → suspended
```

### Flow 4: Plan Limit Enforcement
```
POST /customers → checkPlanLimit('customers')
  → company.usage.customers >= plan.limits.customers ? 403 "Upgrade your plan"
Suspended tenant → শুধু GET allowed (read-only), banner: "Pay to continue"
⚠️ Suspended হলেও MikroTik auto-disable job চলবে না (ISP-র কাস্টমার বিপদে পড়বে না),
   শুধু panel lock থাকবে
```

### Flow 5: Router Connect (VPN)
```
1. Router add (mode=vpn) → WireGuard keypair + VPN IP (10.100.x.x) allocate
2. GET /routers/:id/vpn-script → MikroTik terminal-এ paste করার script
3. Platform WG server-এ peer add
4. Test → API connect 10.100.x.x:8728 → online
```

### Flow 6: নতুন Customer
```
1. Validate + plan limit check
2. Counter থেকে customerId
3. Customer save (syncStatus=pending)
4. Queue: mikrotik.addSecret → success: synced / fail: failed (retry 3 বার, notification)
5. Welcome SMS queue (wallet balance check)
6. ActivityLog, usage.customers++
```

### Flow 7: Manual Recharge (office/collector)
```
1. POST /payments/recharge {customerId, months, amount, discount, method}
2. Mongo transaction:
   - newExpiry = max(now, customer.expiryDate) + months × package.validityDays
   - Payment(receiptNo) create
   - Customer: expiryDate, dueAmount, status=active
   - Reseller হলে balance deduct (insufficient → error)
3. Commit → queue: mikrotik.enable (যদি disabled/expired ছিল)
4. SMS: payment success
5. Response: receipt data
```

### Flow 8: Customer Online Payment
```
1. Portal → POST /portal/pay {gateway:'sslcommerz', months}
2. TenantGateway credential load (decrypt) → PaymentAttempt(scope=customer_bill)
3. Gateway session → redirect
4. IPN/callback → verify (validation API) → idempotent check (tranId already success?)
5. Flow 7-এর step 2-4 (method='online', receivedBy=system)
6. Notification → ISP admin
```

### Flow 9: Auto Expire / Disable
```
Job প্রতি ১৫ মিনিটে:
1. Company.status in [active, trial, past_due]
2. Customer: status=active, autoDisable=true, billingType=prepaid,
             expiryDate + graceDays < now
3. router অনুযায়ী group → প্রতি router-এ একবার connect → disable + kick active
4. status=expired, SMS (expired + pay link)
5. Router offline হলে → retry queue + admin notification
```

### Flow 10: Postpaid Invoice
```
Job প্রতি মাসের invoiceDay-তে:
- postpaid active customer → Invoice(month, total=monthlyFee−discount + previous due)
- SMS: "আপনার নভেম্বরের বিল ৳৫০০, শেষ তারিখ ১০ নভেম্বর"
- dueDate + graceDays পার হলে → disable
```

### Flow 11: SMS Send
```
1. Template render (variables)
2. Segment count (Unicode → 70/67, GSM → 160/153)
3. Own gateway? → সরাসরি : wallet balance check → deduct (SmsCreditTransaction)
4. Queue → provider → SmsLog status
5. Fail হলে credit refund
```

### Flow 12: IP Log (BTRC)
```
Job প্রতি ৫ মিনিটে প্রতি router:
- /ppp/active list → আগের snapshot-এর সাথে diff
- নতুন session → IpLog(loginAt), চলে যাওয়া → logoutAt set
(পরে RADIUS accounting দিয়ে আরও নির্ভুল)
```

### Flow 13: Tenant Suspension / Deletion
```
past_due + 7 দিন → suspended (read-only, portal online pay চালু থাকবে)
suspended + 30 দিন → archived (login বন্ধ, data রাখা)
archived + 90 দিন → data export email → hard delete
```

---

## 12. Background Jobs

| Job | সময় | কাজ |
|---|---|---|
| `expireCustomers` | প্রতি ১৫ মিনিট | মেয়াদোত্তীর্ণ কাস্টমার disable |
| `expiryReminderSms` | প্রতিদিন সকাল ১০টা | ৩/১ দিন আগে reminder |
| `generateInvoices` | প্রতিদিন (tenant-এর invoiceDay মিললে) | postpaid invoice |
| `routerHealthCheck` | প্রতি ৫ মিনিট | router online/offline |
| `ipLogSync` | প্রতি ৫ মিনিট | BTRC IP log |
| `subscriptionRenewal` | প্রতিদিন | SSLCommerz invoice তৈরি + reminder |
| `subscriptionStatus` | প্রতি ঘণ্টা | trial শেষ, past_due → suspended → archived |
| `usageRecount` | প্রতি রাত | company.usage ঠিক করা |
| `dailySummaryEmail` | প্রতি রাত ১০টা | owner-কে দিনের collection |
| `lowStockAlert` | প্রতিদিন | inventory |
| `ipLogArchive` | প্রতি মাস | পুরনো log archive |
| `cleanup` | প্রতি রাত | expired OTP, temp file |

**Queues:** `mikrotik`, `sms`, `email`, `report`, `export`, `webhook` — retry + exponential backoff + dead letter।

---

## 13. Permission System

```ts
export const PERMISSIONS = {
  dashboard:  ['view'],
  customer:   ['view','create','edit','delete','enable_disable','kick','import','export'],
  package:    ['view','manage'],
  router:     ['view','manage'],
  zone:       ['view','manage'],
  payment:    ['view','recharge','refund','delete'],
  invoice:    ['view','manage'],
  reseller:   ['view','manage','deposit'],
  ticket:     ['view','create','assign','solve'],
  sms:        ['view','send','template'],
  employee:   ['view','manage','salary'],
  collection: ['view','handover'],
  expense:    ['view','manage'],
  inventory:  ['view','manage'],
  ip_log:     ['view','export'],
  report:     ['view','export'],
  staff:      ['manage'],
  setting:    ['manage'],
  subscription: ['manage'],      // owner only
  activity_log: ['view'],
};
```

| Permission | Owner | Admin | Manager | Accountant | Collector | Technician | Reseller |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| customer.view | ✅ | ✅ | ✅ | ✅ | zone | zone | own |
| customer.create/edit | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | own |
| customer.enable_disable | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | own |
| payment.recharge | ✅ | ✅ | ✅ | ✅ | zone | ❌ | own |
| payment.refund | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| ticket.solve | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| expense.manage | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| report.view | ✅ | ✅ | ✅ | ✅ | own | ❌ | own |
| setting.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| subscription.manage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

- Backend: `authorize('customer.create')` + **data scope** (zone/reseller filter)
- Frontend: `<PermissionGate perm="customer.create">` + sidebar filter

---

## 14. Security

- **Tenant isolation:** tenant plugin + প্রতিটা service-এ `company` check; integration test দিয়ে নিশ্চিত করা
- Password: bcrypt (12 rounds); secret (router, gateway, PPPoE): **AES-256-GCM**, key env-এ
- JWT: short access token, refresh token rotation + `refreshTokenVersion` (logout all)
- Super admin: **2FA (TOTP)** বাধ্যতামূলক; impersonation audit log
- `helmet`, CORS whitelist (subdomain wildcard), `express-rate-limit` (login, OTP, public API)
- `express-mongo-sanitize`, Zod validation সব input-এ
- Webhook: Stripe signature, SSLCommerz validation API, IP whitelist (যেখানে সম্ভব)
- File upload: type/size check, private bucket, signed URL (NID)
- Money: integer-এ রাখা (পয়সা) অথবা Decimal128; সব টাকার কাজ transaction-এ
- Activity/Audit log সব write action-এ
- Daily backup (MongoDB + file storage), ৩০ দিন retention, monthly restore test
- HTTPS everywhere, HSTS
- Data privacy: NID/phone শুধু permission থাকলে দেখাবে, export-এ mask option

---

## 15. Environment Variables

```env
# ===== backend/.env =====
NODE_ENV=development
PORT=5000
APP_URL=https://app.yourdomain.com
API_URL=https://api.yourdomain.com
ROOT_DOMAIN=yourdomain.com
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

DB_URL=mongodb+srv://...
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES=30d
BCRYPT_SALT_ROUNDS=12
ENCRYPTION_KEY=                     # 32 bytes hex

# Stripe (platform subscription)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=

# SSLCommerz (platform subscription)
SSLCZ_STORE_ID=
SSLCZ_STORE_PASSWORD=
SSLCZ_IS_LIVE=false

# Platform SMS gateway
SMS_PROVIDER=
SMS_API_KEY=
SMS_SENDER_ID=

# Email
SMTP_HOST=  SMTP_PORT=  SMTP_USER=  SMTP_PASS=  MAIL_FROM=

# Storage
STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=  CLOUDINARY_API_KEY=  CLOUDINARY_API_SECRET=

# VPN
WG_SERVER_PUBLIC_KEY=
WG_SERVER_ENDPOINT=vpn.yourdomain.com:51820
WG_SUBNET=10.100.0.0/16

SENTRY_DSN=

# ===== frontend/.env.local =====
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
NEXT_PUBLIC_ROOT_DOMAIN=yourdomain.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

> ISP-র নিজের SSLCommerz/bKash/Nagad credential **env-এ না**, DB-তে encrypted (`TenantGateway`)।

---

## 16. Deployment & DevOps

### Environments
- **Local:** নিজের machine-এ MongoDB (replica set mode) অথবা MongoDB Atlas, আর Redis (Phase 1-এ queue আসলে)
- **Staging:** `staging.yourdomain.com` (gateway sandbox)
- **Production:** `yourdomain.com`, `app.`, `api.`, `*.yourdomain.com` (portal), `vpn.`

### Infrastructure (শুরুতে)
| Service | কোথায় |
|---|---|
| API + Worker + Next.js | ১টা VPS (4 vCPU / 8GB), PM2 + Nginx |
| MongoDB | MongoDB Atlas (M10) অথবা VPS-এ ৩-node replica set |
| Redis | একই VPS / Upstash |
| WireGuard | আলাদা ছোট VPS (BD/SG — BDIX latency কম হলে ভালো) |
| DNS + SSL + wildcard | Cloudflare |
| Files | Cloudinary / R2 |
| Monitoring | Sentry, UptimeRobot, Better Stack |

### CI/CD (GitHub Actions)
```
push → lint → typecheck → test → build → SSH deploy (git pull + pnpm build + pm2 reload)
main → deploy staging (auto) → production (manual approve)
```

### Scale হলে
- API horizontal scale (stateless) + load balancer
- Worker আলাদা server
- MikroTik connection pool per router, rate limit
- বড় tenant → dedicated DB (Enterprise)

---

## 17. Pricing Plan (উদাহরণ)

> দাম বাজার যাচাই করে চূড়ান্ত করতে হবে।

| Plan | কাস্টমার | Router | Staff | মাসিক (BDT) | মূল features |
|---|---|---|---|---|---|
| **Trial** | ১০০ | ১ | ২ | ফ্রি (১৪ দিন) | Starter-এর সব |
| **Starter** | ৩০০ | ১ | ৩ | ৳৯৯৯ | Customer, billing, MikroTik, SMS, report |
| **Growth** | ১,০০০ | ৩ | ১০ | ৳২,৪৯৯ | + Online payment, portal, ticket, reseller |
| **Pro** | ৩,০০০ | ১০ | ২৫ | ৳৪,৯৯৯ | + Inventory, IP log, custom domain, own SMS gateway |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Custom | + API access, white label, dedicated DB, SLA |

- Yearly = ২ মাস ফ্রি
- SMS credit আলাদা কিনতে হবে (যেমন ৳০.৩৫/SMS)
- USD price (Stripe) international/বড় ক্লায়েন্টের জন্য

---

## 18. Development Roadmap

### Phase 0 — Foundation (সপ্তাহ ১–২)
- [x] Local MongoDB setup guide (README) — [ ] Prettier, [ ] git repo (root)
- [x] Config (zod env), DB, error handling, sendResponse, QueryBuilder (`paginate`) — [ ] logger (pino)
- [x] Tenant plugin, encryption util, counter util
- [x] Auth: signup (company + owner + trial), login, refresh, logout, logout-all, change password, super admin login — [ ] forgot/reset (Phase 2-এ SMS/email আসার পর)
- [x] Permission constants, `auth` + `authorize` + read-only (402) middleware
- [x] Staff (user) CRUD API
- [x] Seed: super admin, plans
- [x] Frontend: layout, axios + refresh interceptor, login/signup, route guard (`proxy.js`) — [ ] i18n (বাংলা)
- [x] বর্তমান backend-এর ভুল code ঠিক করা
- [x] Tests: 20টি (auth, staff, tenant isolation, read-only)

### Phase 1 — Core ISP (সপ্তাহ ৩–৬)
- [x] Zone, Router (public mode), Package CRUD
- [x] MikroTik service — নিজস্ব RouterOS API client (`node-routeros` discontinued), test, profile, secret CRUD, active, kick
- [x] Customer CRUD + MikroTik sync + live status + PPPoE credential দেখা + zone scoping (collector/technician)
- [x] Recharge (transaction, due/advance) + printable receipt (browser → PDF) + payment history — [ ] server-side PDF
- [x] node-cron: `expireCustomers` (১৫ মিনিট) + `retryFailedSyncs` (১০ মিনিট) — BullMQ/Redis পরে
- [x] Dashboard (collection, due, expiring, status count)
- [x] Staff/user management UI + plan limit (customers/routers/staff)
- [x] Billing settings (grace days, auto-disable, receipt text)
- [x] Tests: মোট ৫৬টি

### Phase 2 — Communication & Reports (সপ্তাহ ৭–৯)
- [x] SMS service (log / generic HTTP gateway) + বাংলা templates + auto events (welcome, payment, reminder, expired, ticket) + bulk + log + segment count
- [x] Platform SMS wallet (credit reserve/refund) + super admin credit add — [ ] online credit purchase (Phase 3)
- [x] Ticket system (assign, status, comments, technician scope, SMS on solve)
- [x] Reports: collection (day/collector/method/zone), due, expiring, expired, new, left, package-wise + Excel — [ ] server-side PDF
- [x] Excel import (dry-run + commit) / export, MikroTik import (router অপরিবর্তিত)
- [x] Activity log (`audit()` middleware), in-app notifications
- [x] Tests: মোট ৭৪টি
- [x] Forgot/reset password (OTP SMS) — Phase 3-এ হয়েছে

**🎯 Milestone: Internal Beta — ২-৩টা ISP-কে ফ্রিতে দিয়ে test**

**Beta-র প্রস্তুতি (deployment):**
- [x] PM2 config: API ×2 (cluster) + আলাদা worker ×1 (cron) + web — `deploy/ecosystem.config.js`
- [x] Nginx config (app/www/root → Next.js, api → Express) + certbot — `deploy/nginx/`
- [x] Zero-downtime deploy script, MongoDB backup script (১৪ দিন), mongod replica set + auth config
- [x] Production config guard (example secret, http URL, localhost CORS থাকলে server চালু হয় না)
- [x] Health check-এ DB status (503 when down)
- [x] ধাপে ধাপে বাংলা guide — `DEPLOY.md`
- [ ] আসল VPS-এ deploy + আসল MikroTik/SMS/gateway দিয়ে test
- [x] Off-site backup (rclone, `RCLONE_REMOTE`), uptime monitor (`/health` + backup ping) — DEPLOY.md §৮

### Phase 3 — SaaS Billing (সপ্তাহ ১০–১২)
- [x] Plan/Subscription/Invoice module (invoice-based renew, সব gateway-তে একই নিয়ম)
- [x] **Stripe** Checkout (one-time, USD) + signed webhook — [ ] auto-recurring Stripe Billing + customer portal
- [x] **SSLCommerz** payment + IPN + validation API
- [x] **bKash** Tokenized Checkout (grant/create/execute/status)
- [x] **Manual** (Send Money + TrxID) — super admin / ISP staff approve
- [x] Gateway on/off + credentials (encrypted): platform-এর জন্য super admin, কাস্টমার বিলের জন্য ISP admin
- [x] SMS credit online purchase
- [x] কাস্টমারের public bill-pay page `/pay/<slug>` (Phase 5-এর অংশ এগিয়ে আনা) + auto recharge + reconnect
- [x] Plan limit (customers/routers/staff) — [ ] feature-flag middleware
- [x] Trial → active → past_due → suspended lifecycle job + renewal reminder
- [x] Subscription page (usage, upgrade/renew, invoices, SMS credits)
- [x] Super admin: login, gateways, payment review, settings (বাকি Phase 4-এ)
- [x] Coupon (percent/fixed, plan/interval, max uses, once per ISP) — super admin UI + checkout-এ apply
- [x] Onboarding checklist (dashboard-এ ৫ ধাপ)
- [x] Company profile settings (নাম, ঠিকানা, BTRC licence, লোগো URL, brand colour)
- [x] Forgot/reset password (SMS OTP, hashed, 5 বার ভুল হলে lock)
- [x] Marketing site: landing, pricing (live plans), terms, privacy, refund, contact — ⚠️ আইনি লেখা template, আইনজীবী দিয়ে দেখিয়ে নিতে হবে
- [x] Tests: মোট ৯৯টি
- [x] Logo file upload (PNG/JPG/WebP, magic-byte যাচাই, SVG বন্ধ)
- [ ] Nagad direct API — ⏸ Nagad merchant account + তাদের API document ছাড়া বানানো ঝুঁকিপূর্ণ (RSA sign/encrypt); এখন SSLCommerz-এর মাধ্যমে Nagad চলে

### Phase 4 — Super Admin (সপ্তাহ ১৩–১৪)
- [x] Super admin dashboard (MRR/ARR, tenant status, revenue 30 দিন, end customers, recent signups)
- [x] Tenant management: list/search, detail, suspend/activate, trial বাড়ানো, plan assign (offline/contract), SMS credit
- [x] Impersonate (owner হিসেবে ১ ঘণ্টা, প্রতিটা কাজ "[by platform admin]" চিহ্নিত, password/logout-all বন্ধ)
- [x] Plan management (create/edit) — ⚠️ PATCH-এ default reset হওয়ার bug ধরা ও ঠিক করা হয়েছে (plan, announcement, ticket)
- [x] Announcements (plan অনুযায়ী target, ISP dashboard-এ banner)
- [x] Platform audit log, platform admin users (role), 2FA (TOTP, RFC 6238 test vector সহ), admin password change
- [x] Platform support ticket (ISP → platform; suspended ISP-ও পাঠাতে পারে; reply দিলে notification)
- [x] System health page (DB/replica set, worker job run record, offline router, sync fail, SMS fail, pending payment)
- [x] Plan feature-flag enforcement (ticket, online payment; sidebar-এ 🔒; trial = Growth features)
- [x] Tenant archive/restore/delete + data export (super admin ও owner নিজে; password কখনো export হয় না)
- [x] ⚠️ ঠিক করা হয়েছে: `seed` প্রতি deploy-এ admin-এর edit করা plan মুছে দিত; `support` role admin panel-এ ঢুকতেই পারত না
- [x] Tests: মোট ১১৪টি

**🚀 Milestone: Public Launch (v1.0)**

### Phase 5 — Online Payment & Portal (সপ্তাহ ১৫–১৭)
- [x] TenantGateway settings (SSLCommerz, bKash, Stripe, Manual — Phase 3-এই হয়েছে)
- [x] Customer portal: SMS OTP login (ISP-এর SMS balance থেকে), এক নম্বরে একাধিক connection, package/মেয়াদ/due, payment history, bill pay, অভিযোগ (ticket) + reply; plan feature `customer_portal`
- [x] Subdomain routing (`<slug>.<NEXT_PUBLIC_ROOT_DOMAIN>` → portal; wildcard DNS + TLS লাগবে)
- [x] Payment link in SMS (reminder/expired SMS-এ `{pay_link}`, plan-এ online payment থাকলেই), `{portal_link}` variable
- [x] Manual bKash TrxID verify (Phase 3-এই হয়েছে)
- [x] Tests: মোট ১১৯টি
- [x] Portal-এ live status (online/IP/uptime/এই session-এর download-upload, MikroTik থেকে)
- [x] Portal থেকে package change request → staff approve করলে package, bill ও router profile বদলায়

### Phase 6 — Advanced ISP (সপ্তাহ ১৮–২১)
- [x] Reseller + balance + ledger (নিজের login, শুধু নিজের কাস্টমার, recharge-এ rate অনুযায়ী balance কাটে, credit limit, plan limit)
- [x] Postpaid invoice billing (১ তারিখে invoice, পুরোনোটা আগে শোধ, overdue হলে cut-off, শোধ হলে reconnect)
- [x] Employee/salary (advance/bonus/deduction, salary sheet), cash handover (collector → office, receiver confirm করে)
- [x] Expense/income/P&L (salary, মাল কেনা, reseller deposit নিজে থেকে হিসাবে যায়; ১২ মাসের trend)
- [x] Inventory (serial/MAC, purchase → expense, customer/staff-কে issue, low stock)
- [x] WireGuard VPN router mode (key তৈরি, tunnel IP, RouterOS script, server peer sync)
- [x] IP log (BTRC) — প্রতি ৫ মিনিটে PPPoE session, IP/MAC, Excel export
- [x] Tests: মোট ১৩৬টি

### Phase 7 — Growth (সপ্তাহ ২২+)
- [x] Custom domain (TXT verify, Caddy on-demand TLS hook), white label flag
- [x] Own SMS gateway option (credit লাগে না; test SMS)
- [x] Public API + API key (Enterprise; scope, hashed key, revoke, rate limit)
- [ ] Mobile app (collector + customer) — ⏸ আলাদা React Native project; এখন web + portal মোবাইলে চলে
- [ ] RADIUS (FreeRADIUS) support — ⏸ আলাদা RADIUS server ও আসল NAS দিয়ে test লাগবে
- [ ] OLT integration (ONU signal) — ⏸ vendor (BDCOM/VSOL/Huawei) অনুযায়ী আলাদা, আসল OLT ছাড়া বানানো যাবে না
- [x] WhatsApp notification (WhatsApp Cloud API, approved template; plan feature `whatsapp`)
- [x] Analytics (নিয়মভিত্তিক churn risk, collection forecast, renewal rate)

---

## 19. Testing Strategy

| ধরন | কী | Tool |
|---|---|---|
| Unit | service logic (expiry calc, segment count, price) | Vitest/Jest |
| Integration | API + DB (in-memory Mongo replica set) | Supertest + mongodb-memory-server |
| **Tenant isolation** | Tenant A দিয়ে Tenant B-র data access → 404 | Integration |
| Payment | Stripe CLI webhook, SSLCommerz sandbox | Manual + automated |
| MikroTik | Mock client + CHR (MikroTik Cloud Hosted Router) VM-এ real test | — |
| E2E | signup → router → customer → recharge → expire | Playwright |
| Load | ১০,০০০ কাস্টমার tenant-এ expire job | k6 |

---

## 20. শুরুর আগে যে সিদ্ধান্ত নিতে হবে

1. **Product/Domain নাম** — subdomain ও branding-এর জন্য
2. **Trade license + SSLCommerz merchant account** (website-এ terms/privacy/refund লাগবে)
3. **Stripe account** — বাংলাদেশে Stripe সরাসরি নেই; Stripe Atlas (US company) বা অন্য দেশের entity লাগবে। না হলে international-এর জন্য **Paddle / Lemon Squeezy** বিকল্প ভাবা যায়
4. **SMS gateway provider** বাছাই (দাম, masking, Unicode)
5. **Frontend JS না TypeScript** — SaaS-এর আকার বিবেচনায় **TypeScript সুপারিশ**
6. **UI kit** — shadcn/ui নাকি নিজস্ব
7. **VPN server location** (BD VPS vs Singapore)
8. **Pricing চূড়ান্ত** — ৫-১০টা ISP মালিকের সাথে কথা বলে

---

*Last updated: 2026-11-06*
