"use client";

import { useState } from "react";
import { PageHero, SitePage } from "@/components/marketing/SiteLayout";
import { Button, ErrorBox, Input, Textarea } from "@/components/ui";
import { api, getErrorMessage } from "@/lib/api";

export default function DemoPage() {
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", customers: "", district: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/public/content/demo-request", { ...f, customers: f.customers ? Number(f.customers) : undefined });
      setDone(r.data.message);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SitePage>
      <PageHero eyebrow="Demo" title="Book a free demo">
        We will call you, show the software with your own routers in mind and help you move your customers.
      </PageHero>
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 [&>*]:max-w-2xl">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        {done ? (
          <p className="rounded-lg bg-emerald-50 p-4 font-medium text-emerald-900">{done}</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Input label="Your name" required value={f.name} onChange={set("name")} />
            <Input label="ISP / company name" required value={f.company} onChange={set("company")} />
            <Input label="Mobile" required placeholder="01XXXXXXXXX" value={f.phone} onChange={set("phone")} />
            <Input label="Email (optional)" type="email" value={f.email} onChange={set("email")} />
            <Input label="How many customers?" type="number" value={f.customers} onChange={set("customers")} />
            <Input label="District" value={f.district} onChange={set("district")} />
            <Textarea label="Anything else?" className="sm:col-span-2" rows={4} value={f.message} onChange={set("message")} />
            {error && (
              <div className="sm:col-span-2">
                <ErrorBox>{error}</ErrorBox>
              </div>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" size="lg" loading={busy}>
                Request demo
              </Button>
            </div>
          </form>
        )}
        </div>
      </section>
    </SitePage>
  );
}
