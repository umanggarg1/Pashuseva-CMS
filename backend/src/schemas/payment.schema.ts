import { z } from 'zod';
import { paymentMethodSchema } from './order.schema';

export const paymentIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  paymentId: z.coerce.number().int().positive(),
});

// Maximum payment is validated against the order's remaining balance in the service
// layer (needs the live order total + existing payments, not just this input) —
// §5 "The backend must prevent" overpayment.
export const createPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: paymentMethodSchema,
  referenceNumber: z.string().trim().optional(),
  paymentDate: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
});

// Correction, not edit-in-place (§14) — a reason is required so the reversal's own
// activity/ledger entry explains why, same as order cancellation already requires one.
export const reversePaymentSchema = z.object({
  reason: z.string().min(1),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
