// Phase 31: free (₹0) products and orders. Display-only — stored values stay 0 /
// PAID, so every calculation, filter and report keeps working on plain numbers.

export function formatPrice(amount: number): string {
  return amount === 0 ? 'FREE' : `₹${amount.toLocaleString()}`;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Unpaid',
  PARTIAL: 'Partially Paid',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

// A ₹0 order is stored as PAID (nothing is owed) but labelled Free.
export function paymentStatusLabel(status: string, total: number): string {
  if (total <= 0 && status === 'PAID') return 'Free';
  return PAYMENT_STATUS_LABEL[status] ?? status;
}
