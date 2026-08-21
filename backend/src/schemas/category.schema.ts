import { z } from 'zod';

export const categoryIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const createCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  slug: z.string().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const updateCategoryStatusSchema = z.object({
  active: z.boolean(),
});

export const categoryListQuerySchema = z.object({
  search: z.string().optional(),
});

export { slugify };
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
