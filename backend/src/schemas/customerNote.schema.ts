import { z } from 'zod';

export const createCustomerNoteSchema = z.object({
  note: z.string().min(1),
});

export type CreateCustomerNoteInput = z.infer<typeof createCustomerNoteSchema>;
