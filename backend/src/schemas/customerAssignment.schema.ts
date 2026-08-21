import { z } from 'zod';

export const assignCustomerSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
});

export const reassignCustomerSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
});

export const bulkAssignCustomerSchema = z.object({
  customerIds: z.array(z.coerce.number().int().positive()).min(1),
  employeeId: z.coerce.number().int().positive(),
});

export type AssignCustomerInput = z.infer<typeof assignCustomerSchema>;
export type ReassignCustomerInput = z.infer<typeof reassignCustomerSchema>;
export type BulkAssignCustomerInput = z.infer<typeof bulkAssignCustomerSchema>;
