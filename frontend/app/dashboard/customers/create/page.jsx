"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CustomerForm from "@/components/customer/CustomerForm";
import { Button, Modal, PageHeader } from "@/components/ui";

export default function CreateCustomerPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [created, setCreated] = useState(null);

  const onSaved = (data) => {
    qc.invalidateQueries({ queryKey: ["customers"] });
    // Show a generated password once; otherwise go straight to the profile.
    if (data.generatedPassword) setCreated(data);
    else router.push(`/dashboard/customers/${data.customer._id}`);
  };

  return (
    <div>
      <PageHeader title="Add customer" subtitle="The PPPoE account is created on the MikroTik automatically" />
      <CustomerForm onSaved={onSaved} />
      <Modal
        open={Boolean(created)}
        onClose={() => router.push(`/dashboard/customers/${created.customer._id}`)}
        title="Customer created"
        footer={
          <>
            {created?.customer.status === "expired" && (
              <Link href={`/dashboard/billing/recharge?customer=${created?.customer._id}`}>
                <Button variant="success">Recharge now</Button>
              </Link>
            )}
            <Link href={`/dashboard/customers/${created?.customer._id}`}>
              <Button>Open profile</Button>
            </Link>
          </>
        }
      >
        {created && (
          <div className="space-y-2">
            <p>Give these PPPoE credentials to the customer:</p>
            <div className="rounded-md bg-zinc-100 p-4 font-mono">
              <p>Username: {created.customer.pppoe.username}</p>
              <p>Password: {created.generatedPassword}</p>
            </div>
            {created.customer.status === "expired" && (
              <p className="text-sm text-amber-700">The connection stays off until the first recharge.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
