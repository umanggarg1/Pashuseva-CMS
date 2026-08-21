import { z } from 'zod';

export const globalSearchQuerySchema = z.object({
  q: z.string().min(2, 'Enter at least 2 characters'),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;
