"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import CustomerForm from "@/components/customer/CustomerForm";
import { ErrorBox, Loading, PageHeader } from "@/components/ui";
import { useApi } from "@/lib/hooks";

export default function EditCustomerPage() {
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, error } = useApi(["customer", id], `/customers/${id}`);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const customer = data.data;
  return (
    <div>
      <PageHeader title={`Edit ${customer.name}`} subtitle={customer.customerId} />
      <CustomerForm
        customer={customer}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["customers"] });
          qc.invalidateQueries({ queryKey: ["customer", id] });
          router.push(`/dashboard/customers/${id}`);
        }}
      />
    </div>
  );
}
