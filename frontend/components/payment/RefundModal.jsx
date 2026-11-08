"use client";

import { useState } from "react";
import { Button, Modal, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { taka } from "@/lib/format";
import { useApiMutation } from "@/lib/hooks";

/** Refund (reverse) a payment: validity, due and advance go back to what they were before it. */
export default function RefundModal({ payment, onClose }) {
  const [reason, setReason] = useState("");
  const refund = useApiMutation(() => api.post(`/payments/${payment._id}/refund`, { reason }), {
    invalidate: ["payments", "payment", "customer", "customers", "dashboard", "pnl", "ledger"],
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Refund ${payment.receiptNo}`}
      description={`${taka(payment.amount)} from ${payment.customer?.name ?? "this customer"}. Their validity and due go back to what they were before this payment. Only the customer's latest payment can be refunded.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={refund.isPending} disabled={reason.trim().length < 3} onClick={() => refund.mutate()}>
            Refund payment
          </Button>
        </>
      }
    >
      <Textarea label="Reason" required rows={3} placeholder="e.g. Taken twice by mistake" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
