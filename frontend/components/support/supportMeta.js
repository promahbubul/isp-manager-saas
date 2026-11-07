/** Shared labels for ISP → platform support tickets (ISP dashboard and super admin). */
export const SUPPORT_CATEGORIES = [
  { value: "billing", label: "Billing / subscription" },
  { value: "technical", label: "Technical problem" },
  { value: "mikrotik", label: "MikroTik / router" },
  { value: "sms", label: "SMS" },
  { value: "payment_gateway", label: "Payment gateway" },
  { value: "feature_request", label: "Feature request" },
  { value: "other", label: "Other" },
];
export const SUPPORT_PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent — service is down" },
  { value: "low", label: "Low" },
];
export const supportCategoryLabel = Object.fromEntries(SUPPORT_CATEGORIES.map((c) => [c.value, c.label]));
export const SUPPORT_STATUS = {
  open: { label: "Waiting for support", color: "amber" },
  answered: { label: "Answered", color: "green" },
  closed: { label: "Closed", color: "slate" },
};
export const PRIORITY_COLOR = { urgent: "red", normal: "blue", low: "slate" };
