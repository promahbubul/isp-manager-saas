import { LegalPage } from "@/components/marketing/SiteLayout";
import { site } from "@/lib/site";

export const metadata = { title: "Refund & Cancellation Policy" };

// TEMPLATE — adjust the numbers to your business and have it reviewed.
export default function RefundPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy" updated="6 November 2026">
      <p>
        {site.name} is a digital subscription service. No physical goods are delivered, so there is no shipping or return of items. This policy
        explains cancellations and refunds.
      </p>

      <h2>1. Free trial</h2>
      <p>Every new account gets a free trial so you can evaluate the Service before paying. No payment is taken during the trial.</p>

      <h2>2. Cancellation</h2>
      <ul>
        <li>You can stop renewing at any time. Your plan stays active until the end of the period you paid for.</li>
        <li>After that the account becomes read-only. Your data is kept and you can export it.</li>
      </ul>

      <h2>3. Refunds</h2>
      <ul>
        <li>
          If you are charged by mistake (for example a duplicate payment), we refund the duplicate amount in full.
        </li>
        <li>
          A first-time subscription payment can be refunded if you request it within <strong>7 days</strong> of payment and have not used the
          Service substantially after paying.
        </li>
        <li>Renewals and yearly plans after the first 7 days are not refundable for the remaining period.</li>
        <li>SMS credits that have already been used are not refundable. Unused credits can be refunded within 7 days of purchase.</li>
      </ul>

      <h2>4. How to request</h2>
      <p>
        Email {site.email} or call {site.phone} with your company name and transaction ID. We reply within 3 working days.
      </p>

      <h2>5. Processing time</h2>
      <p>
        Approved refunds are sent back through the original payment method (card, bKash, Nagad, bank). Depending on the bank or wallet, it can
        take 7–10 working days to reach you.
      </p>

      <h2>6. Payments to ISPs by their customers</h2>
      <p>
        Internet bills paid by an ISP&apos;s customers go directly to that ISP. Refund requests for those payments must be made to the ISP.
      </p>
    </LegalPage>
  );
}
