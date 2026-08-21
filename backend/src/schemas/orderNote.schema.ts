import { z } from 'zod';

export const createOrderNoteSchema = z.object({
  note: z.string().min(1),
});

export type CreateOrderNoteInput = z.infer<typeof createOrderNoteSchema>;
