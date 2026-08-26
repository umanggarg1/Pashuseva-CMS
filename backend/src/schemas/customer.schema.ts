import { z } from 'zod';

export const customerIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const customerStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

const phoneSchema = z.object({
  phone: z.string().min(1),
  label: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

const phonesSchema = z
  .array(phoneSchema)
  .min(1, 'At least one phone number is required')
  .refine((phones) => phones.filter((p) => p.isPrimary).length === 1, {
    message: 'Exactly one phone number must be marked primary',
  });

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  district: z.string().optional(),
  state: z.string().min(1),
  pincode: z.string().min(1),
  landmark: z.string().optional(),
  country: z.string().optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  phones: phonesSchema,
  address: addressSchema.optional(),
});

// Same shape as createCustomerSchema — exported separately so other modules (e.g.
// inline customer creation from Create Order) can reuse it without importing the
// customer-specific name, and so the two can diverge later without a breaking rename.
export const customerInputSchema = createCustomerSchema;

export const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  phones: phonesSchema.optional(),
  address: addressSchema.optional(),
});

// Phase 19: manual status control is gone — customerStatusSchema is still used by
// customerListQuerySchema.status below (filtering the list by the now-derived
// status), just not for setting it.

export const customerListQuerySchema = z.object({
  search: z.string().optional(),
  status: customerStatusSchema.optional(),
  assignedEmployeeId: z.coerce.number().int().positive().optional(),
  assignedManagerId: z.coerce.number().int().positive().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type CustomerIdParam = z.infer<typeof customerIdParamSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
