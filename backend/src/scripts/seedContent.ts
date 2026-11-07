/**
 * Starter Help Center + Blog articles for the public website.
 * Idempotent: only inserts slugs that do not exist yet, never overwrites edits made in the admin panel.
 * Usage: pnpm seed:content
 */
import { connectDB, disconnectDB } from "../app/config/db";
import { Post } from "../app/modules/content/content";

type Seed = { type: "blog" | "help"; title: string; slug: string; category?: string; excerpt?: string; body: string; daysAgo?: number };

const POSTS: Seed[] = [
  // ── Help Center ───────────────────────────────────────────────
  {
    type: "help",
    category: "Getting started",
    title: "Set up your ISP account in 10 minutes",
    slug: "getting-started",
    body: `After you sign up you land on the dashboard with a 1-year free trial. Work through these steps once and the system runs by itself.

1. Settings → General: add your logo, phone and address. They appear on receipts and the customer portal.
2. Network → Routers: add your MikroTik (see "Connect a MikroTik router").
3. Network → Packages: create the internet packages you sell, with speed and monthly price.
4. Customers: import your existing customers from Excel or directly from MikroTik.
5. SMS → Templates: choose which SMS go out automatically (welcome, payment, expiry reminder).

## Add your staff
Go to Staff and invite people with the role they need — manager, accountant, collector or technician. Each role sees only what it is allowed to.`,
  },
  {
    type: "help",
    category: "Network",
    title: "Connect a MikroTik router",
    slug: "connect-mikrotik",
    body: `The panel talks to your router over the RouterOS API. RouterOS 6 and 7 are supported.

1. On the router, enable the API service: IP → Services → api (port 8728) or api-ssl (port 8729).
2. Create a dedicated user with the "full" group, or a group with read, write, api and policy rights.
3. In the panel open Network → Routers → Add router and enter the IP, port, user and password.
4. Press Test connection. A green tick means the panel can read and create PPPoE secrets.

## Router without a public IP
Choose VPN when adding the router. The panel shows a ready script — WireGuard for RouterOS 7, SSTP for RouterOS 6. Paste it into the router terminal and the router connects to us by itself.`,
  },
  {
    type: "help",
    category: "Customers",
    title: "Import customers from Excel or MikroTik",
    slug: "import-customers",
    body: `You do not need to type customers one by one.

## From MikroTik
Customers → Import → From router. The panel reads every PPPoE secret, matches the profile to your packages and shows a preview before anything is saved.

## From Excel
Customers → Import → Excel. Download the template, fill in name, mobile, PPPoE username, package and expiry date, then upload it. Rows with errors are listed so you can fix them and upload again.`,
  },
  {
    type: "help",
    category: "Billing",
    title: "How automatic billing and line cut-off work",
    slug: "automatic-billing",
    body: `Every prepaid customer has an expiry date.

- A few days before expiry (3 by default) the customer gets a reminder SMS.
- After the expiry date plus your grace days, the PPPoE secret is disabled on the router.
- The moment a payment is recorded — at the counter, by a collector or online — the expiry moves forward and the line is enabled again.

Postpaid customers receive a monthly invoice instead and are only disabled when an invoice is overdue. You can change the grace days and reminder days in Settings → General.`,
  },
  {
    type: "help",
    category: "Payments",
    title: "Accept online payments with bKash, SSLCommerz or Stripe",
    slug: "online-payments",
    body: `Online payments go straight into your own merchant account — we never hold your money.

1. Get merchant credentials from bKash (PGW), SSLCommerz or Stripe.
2. Open Settings → Payment gateways and fill in the one you use. Start in sandbox mode to test.
3. Share your payment link (shown on the same page) with customers, or let them pay from the customer portal.

When a payment succeeds the customer is renewed, the line is re-enabled and an SMS receipt is sent automatically.`,
  },
  {
    type: "help",
    category: "SMS",
    title: "Use your own SMS gateway",
    slug: "own-sms-gateway",
    body: `On the Pro plan you can send SMS through your own provider instead of buying credits from us.

1. Open Settings → Integrations → SMS gateway.
2. Choose the provider: PutulHost, Twilio, Vonage, Plivo or a custom HTTP API.
3. Enter the API key and sender ID from your provider and press Send test SMS.

For PutulHost, remember to whitelist the server IP in your PutulHost panel, otherwise messages are rejected.`,
  },

  // ── Blog ──────────────────────────────────────────────────────
  {
    type: "blog",
    title: "5 ways to reduce unpaid bills at your ISP",
    slug: "reduce-unpaid-bills",
    excerpt: "Most dues are not bad customers — they are forgotten payments. Small habits that bring collection up every month.",
    daysAgo: 6,
    body: `Most unpaid bills are not bad customers. They are payments people forgot, or could not make easily.

## 1. Remind before the date, not after
A short SMS three days before expiry works better than a call after the line is cut.

## 2. Make paying easy
Give customers a payment link for bKash and cards. Many will pay at night, when no collector is around.

## 3. Cut off on time, every time
An automatic cut-off after the grace period is fair to everyone and stops dues from growing.

## 4. Send a receipt for every payment
A receipt SMS builds trust and ends "I already paid" arguments.

## 5. Watch the due report weekly
Check the due list by zone every week and send collectors where it matters.`,
  },
  {
    type: "blog",
    title: "PPPoE or Hotspot: which is right for your network?",
    slug: "pppoe-vs-hotspot",
    excerpt: "Both work on MikroTik, but they suit different businesses. A practical comparison for home broadband ISPs.",
    daysAgo: 18,
    body: `Both PPPoE and Hotspot run well on MikroTik, but they solve different problems.

## PPPoE
Each customer has a fixed username and password on their router. It is the standard for home broadband: stable, easy to bill monthly and easy to cut off when a bill is unpaid.

## Hotspot
Users log in through a web page, often with vouchers. It suits cafés, hostels and short-term users.

## Our advice
For monthly home and office connections, use PPPoE. Add Hotspot only for public Wi-Fi spots.`,
  },
  {
    type: "blog",
    title: "Keeping the BTRC IP log without the headache",
    slug: "btrc-ip-log",
    excerpt: "What an IP log needs to contain, how long to keep it and how to export it quickly when asked.",
    daysAgo: 35,
    body: `ISPs are expected to know which customer used which IP address at a given time.

## What to record
- PPPoE username and customer
- Assigned IP address and MAC address
- Login and logout time

## How we do it
On Pro and Enterprise plans the panel reads active PPPoE sessions every five minutes and stores them. Open IP Log, choose a date range and export to Excel in one click.`,
  },
];

export async function seedContent() {
  let added = 0;
  for (const p of POSTS) {
    const publishedAt = new Date(Date.now() - (p.daysAgo ?? 40) * 86_400_000);
    const { daysAgo: _d, ...doc } = p;
    const r = await Post.updateOne({ slug: p.slug }, { $setOnInsert: { ...doc, published: true, publishedAt } }, { upsert: true });
    if (r.upsertedCount) added++;
  }
  console.log(`✅ Content: ${added} new article(s), ${POSTS.length - added} already existed`);
}

if (require.main === module) {
  connectDB()
    .then(seedContent)
    .then(disconnectDB)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
