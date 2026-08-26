import { z } from 'zod';

export const reportRangeSchema = z.enum([
  'today',
  'yesterday',
  'week',
  'month',
  'lastMonth',
  'custom',
]);

const baseReportQuerySchema = z.object({
  range: reportRangeSchema.default('month'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const salesReportQuerySchema = baseReportQuerySchema;

export const ordersReportQuerySchema = baseReportQuerySchema.extend({
  status: z
    .enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'])
    .optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
});

export const customersReportQuerySchema = baseReportQuerySchema;

export const paymentsReportQuerySchema = baseReportQuerySchema.extend({
  method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER']).optional(),
  employeeId: z.coerce.number().int().positive().optional(),
});

export type ReportRange = z.infer<typeof reportRangeSchema>;
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;
export type OrdersReportQuery = z.infer<typeof ordersReportQuerySchema>;
export type CustomersReportQuery = z.infer<typeof customersReportQuerySchema>;
export type PaymentsReportQuery = z.infer<typeof paymentsReportQuerySchema>;
