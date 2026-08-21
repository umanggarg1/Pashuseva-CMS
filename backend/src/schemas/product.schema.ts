import { z } from 'zod';

export const productIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const productStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const packagingUnitSchema = z.enum(['PIECE', 'PACKET', 'BOX', 'BAG', 'BOTTLE']);
export const weightUnitSchema = z.enum(['G', 'KG', 'ML', 'L']);

// weightValue/weightUnit are always set together — not every product has a
// meaningful net weight, but a value with no unit (or vice versa) is meaningless.
function requireWeightPairedTogether(
  data: { weightValue?: number | null; weightUnit?: string | null },
  ctx: z.RefinementCtx
) {
  const hasValue = data.weightValue !== undefined && data.weightValue !== null;
  const hasUnit = data.weightUnit !== undefined && data.weightUnit !== null;
  if (hasValue !== hasUnit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'weightValue and weightUnit must be provided together',
      path: ['weightValue'],
    });
  }
}

export const createProductSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    sku: z.string().min(1),
    price: z.coerce.number().positive(),
    weightValue: z.coerce.number().positive().optional(),
    weightUnit: weightUnitSchema.optional(),
    unit: packagingUnitSchema.optional(),
    availableQty: z.coerce.number().int().min(0).default(0),
    minimumStock: z.coerce.number().int().min(0).default(0),
    image: z.string().optional(),
  })
  .superRefine(requireWeightPairedTogether);

export const updateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    sku: z.string().min(1).optional(),
    price: z.coerce.number().positive().optional(),
    weightValue: z.coerce.number().positive().nullable().optional(),
    weightUnit: weightUnitSchema.nullable().optional(),
    unit: packagingUnitSchema.nullable().optional(),
    availableQty: z.coerce.number().int().min(0).optional(),
    minimumStock: z.coerce.number().int().min(0).optional(),
    image: z.string().optional(),
  })
  .superRefine(requireWeightPairedTogether);

export const suggestSkuQuerySchema = z.object({
  name: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  weightValue: z.coerce.number().positive().optional(),
  weightUnit: weightUnitSchema.optional(),
});

export const updateProductStatusSchema = z.object({
  active: z.boolean(),
});

export const productListQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  active: z.coerce.boolean().optional(),
  stock: z.enum(['low', 'out']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['name', 'price', 'availableQty', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

// A reason is always required for both — Phase 8 §6 ("A reason should always be
// required for manual adjustments").
export const addStockSchema = z.object({
  quantity: z.coerce.number().int().positive(),
  reason: z.string().min(1),
  note: z.string().optional(),
});

export const adjustStockSchema = z.object({
  adjustment: z.coerce.number().int().refine((n) => n !== 0, 'Adjustment cannot be zero'),
  reason: z.string().min(1),
  note: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type SuggestSkuQuery = z.infer<typeof suggestSkuQuerySchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type AddStockInput = z.infer<typeof addStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
