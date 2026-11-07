import Link from "next/link";
import { getPlans, PlanCards } from "@/components/marketing/PlanCards";
import { PageHero, SitePage } from "@/components/marketing/SiteLayout";

export const metadata = { title: "Pricing" };
export const revalidate = 300;

const NOTES = [
  ["Free trial", "Every plan starts with 14 days free. No card required."],
  ["Yearly billing", "Pay for a year and get 2 months free."],
  ["SMS", "SMS credits are bought separately, or use your own gateway on Pro."],
  ["Change any time", "Upgrade or downgrade from My subscription inside the panel."],
];

export default async function PricingPage() {
  const plans = await getPlans();
  return (
    <SitePage>
      <PageHero eyebrow="Pricing" title="Pick the plan that fits your network">
        Prices are in Taka and include every feature listed on the plan.
      </PageHero>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <PlanCards plans={plans} />
        <dl className="mt-16 grid gap-8 border-t border-line pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {NOTES.map(([k, v]) => (
            <div key={k}>
              <dt className="font-semibold text-ink">{k}</dt>
              <dd className="mt-1 text-sm text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-sm text-muted">
          Questions about billing? See the{" "}
          <Link href="/refund-policy" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            refund policy
          </Link>{" "}
          or{" "}
          <Link href="/contact" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            contact us
          </Link>
          .
        </p>
      </section>
    </SitePage>
  );
}
