import { LegalPage } from "@/components/marketing/SiteLayout";
import { site } from "@/lib/site";

export const metadata = { title: "Terms & Conditions" };

// TEMPLATE — have a lawyer review before going live.
export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" updated="6 November 2026">
      <p>
        These terms govern your use of {site.name} (&quot;the Service&quot;), operated by {site.legalName} (&quot;we&quot;, &quot;us&quot;). By creating an
        account you agree to them.
      </p>

      <h2>1. The Service</h2>
      <p>
        {site.name} is cloud software for internet service providers (ISPs) to manage customers, billing, MikroTik routers, SMS and payments.
        You (the ISP) remain responsible for your internet service, your licences (including BTRC), and your relationship with your customers.
      </p>

      <h2>2. Account</h2>
      <ul>
        <li>You must give accurate company and contact information and keep your login details secret.</li>
        <li>You are responsible for everything done through your account, including by staff you add.</li>
        <li>You must be legally allowed to operate as an ISP in Bangladesh.</li>
      </ul>

      <h2>3. Subscription and payment</h2>
      <ul>
        <li>New accounts get a free trial. After it ends, a paid plan is needed to keep making changes.</li>
        <li>Plans are paid in advance, monthly or yearly, in BDT (or USD by international card). Prices are shown on the pricing page.</li>
        <li>If a payment is not made by the end of a period, the account becomes read-only after a grace period. Your data is kept.</li>
        <li>SMS credits are prepaid and are used when messages are sent.</li>
        <li>Payments are processed by SSLCommerz, bKash or Stripe. We do not store card details.</li>
      </ul>

      <h2>4. Your customers&apos; payments</h2>
      <p>
        If you enable online bill payment, your customers pay into <strong>your own</strong> merchant account with the gateway you configure.
        We do not hold or settle those funds and are not a party to those transactions.
      </p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>Do not use the Service for unlawful activity, spam SMS, or to send messages without your customers&apos; consent.</li>
        <li>Do not attempt to access other ISPs&apos; data or disrupt the Service.</li>
      </ul>

      <h2>6. Data</h2>
      <p>
        You own your data. We process it to provide the Service as described in our Privacy Policy. You can export your customer data at any
        time.
      </p>

      <h2>7. Availability and liability</h2>
      <p>
        We aim for high availability but do not guarantee uninterrupted service. To the extent allowed by law, our total liability is limited to
        the fees you paid in the last three months. We are not liable for losses caused by your router configuration, gateway or SMS provider
        outages, or internet connectivity.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend accounts that break these terms or remain unpaid. See the Refund &
        Cancellation Policy for refunds.
      </p>

      <h2>9. Changes and law</h2>
      <p>
        We may update these terms and will notify account owners of significant changes. These terms are governed by the laws of Bangladesh.
      </p>

      <h2>10. Contact</h2>
      <p>
        {site.legalName}, {site.address}. Phone {site.phone}, email {site.email}.
      </p>
    </LegalPage>
  );
}
