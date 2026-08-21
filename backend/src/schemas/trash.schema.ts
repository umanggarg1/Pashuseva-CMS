import { z } from 'zod';

export const trashListQuerySchema = z.object({
  type: z.enum(['customer', 'order', 'product', 'employee']).optional(),
});

export const trashItemParamSchema = z.object({
  type: z.enum(['customer', 'order', 'product', 'employee']),
  id: z.coerce.number().int().positive(),
});

// Skips the 10-day recovery window entirely — the spec's own explicit ask for a
// stronger-than-usual confirmation than a normal Cancel/Confirm dialog.
export const permanentDeleteConfirmSchema = z.object({
  confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }),
});

export type TrashListQuery = z.infer<typeof trashListQuerySchema>;
export type TrashItemParam = z.infer<typeof trashItemParamSchema>;
