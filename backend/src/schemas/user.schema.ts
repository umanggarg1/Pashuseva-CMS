import { z } from 'zod';
import { passwordSchema } from './auth.schema';
import { permissionSchema, dataScopeSchema } from './permission.schema';

export const roleSchema = z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']);
export const accountStatusSchema = z.enum(['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REJECTED']);

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Phase 18 item 3: the Employees page's "add/remove from a Manager's team" action.
export const userManagerParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  managerId: z.coerce.number().int().positive(),
});

export const addManagerSchema = z.object({
  managerId: z.coerce.number().int().positive(),
});

// Admin creates Managers; Admin or Manager creates Employees — the existing
// role-only, no-approval-needed flow. Separate from public signup (auth.schema.ts's
// signupSchema), which always starts PENDING/role-less regardless of who fills it in.
export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  role: z.enum(['MANAGER', 'EMPLOYEE']),
  managerId: z.coerce.number().int().positive().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

export const userListQuerySchema = z.object({
  search: z.string().optional(),
  status: accountStatusSchema.optional(),
});

// Deliberately just the original Deactivate/Activate toggle — PENDING/SUSPENDED/
// REJECTED all have their own dedicated endpoints (approve/reject/suspend/
// reactivate) with their own transition rules, not this generic setter.
export const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const updateRoleSchema = z.object({
  role: roleSchema,
});

export const approveUserSchema = z.object({
  role: z.enum(['MANAGER', 'EMPLOYEE']),
  permissions: z.array(permissionSchema),
  customerDataScope: dataScopeSchema.optional(),
  orderDataScope: dataScopeSchema.optional(),
});

// Trash (Phase 3 addendum) — reassignToUserId is required only when the target has
// active dependents (assigned customers/orders for an Employee, reporting Employees
// for a Manager); the service returns a 400 naming the exact counts if it's missing
// and needed, rather than this schema guessing when it's required.
export const deleteUserSchema = z.object({
  reassignToUserId: z.coerce.number().int().positive().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type ApproveUserInput = z.infer<typeof approveUserSchema>;
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;
