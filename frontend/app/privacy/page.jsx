import { LegalPage } from "@/components/marketing/SiteLayout";
import { site } from "@/lib/site";

export const metadata = { title: "Privacy Policy" };

// TEMPLATE — have a lawyer review before going live.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="6 November 2026">
      <p>This policy explains what information {site.legalName} collects through {site.name} and how it is used.</p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> company name, owner and staff names, mobile numbers, email addresses and passwords (stored
          encrypted/hashed).
        </li>
        <li>
          <strong>Data you store about your customers:</strong> names, mobile numbers, addresses, NID numbers, connection and billing details.
          You (the ISP) control this data; we process it on your behalf.
        </li>
        <li>
          <strong>Router and gateway credentials:</strong> stored encrypted and used only to perform actions you request.
        </li>
        <li>
          <strong>Payment information:</strong> transaction IDs and amounts. Card and wallet details are handled by SSLCommerz, bKash or Stripe
          and never reach our servers.
        </li>
        <li>
          <strong>Usage data:</strong> activity logs (who did what, IP address) for security and auditing.
        </li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To provide the Service: billing, router automation, SMS, reports, payments.</li>
        <li>To send account messages such as password-reset codes and payment reminders.</li>
        <li>To keep the Service secure and to meet legal obligations.</li>
      </ul>
      <p>We do not sell personal information and do not use your customers&apos; data for our own marketing.</p>

      <h2>3. Sharing</h2>
      <p>
        We share data only with providers needed to run the Service (hosting, SMS gateways, payment gateways) and when required by Bangladeshi
        law or a lawful request from authorities.
      </p>

      <h2>4. Security</h2>
      <p>
        Data is transmitted over HTTPS. Passwords are hashed; secrets are encrypted at rest. Each ISP&apos;s data is isolated from other ISPs.
      </p>

      <h2>5. Retention</h2>
      <p>
        We keep data while your account is active. After an account is closed, data may be kept for a limited period for legal and backup
        reasons and then deleted.
      </p>

      <h2>6. Your choices</h2>
      <p>Account owners can export or correct their data from the panel, or contact us to request deletion.</p>

      <h2>7. Contact</h2>
      <p>
        Questions about privacy: {site.email}, {site.phone}, {site.address}.
      </p>
    </LegalPage>
  );
}
