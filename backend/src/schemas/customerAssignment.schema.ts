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

// Phase 19: a customer can have several assigned Employees now — unassign removes
// one specific Employee's row, so it needs to say which one (there's no longer a
// single slot to just clear).
export const unassignCustomerSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
});

export type AssignCustomerInput = z.infer<typeof assignCustomerSchema>;
export type ReassignCustomerInput = z.infer<typeof reassignCustomerSchema>;
export type BulkAssignCustomerInput = z.infer<typeof bulkAssignCustomerSchema>;
export type UnassignCustomerInput = z.infer<typeof unassignCustomerSchema>;
