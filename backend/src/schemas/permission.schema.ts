import { z } from 'zod';

export const PERMISSIONS = [
  'customer:view',
  'customer:create',
  'customer:update',
  // Phase 15 addendum: split out from customer:update — deactivate/reactivate is
  // its own checkbox in the permission picker, distinct from editing a record.
  'customer:delete',
  // Phase 19: split out of customer:update — manual assign/reassign/unassign/
  // bulk-assign is its own grant now, not something every Employee with edit
  // access already gets by default.
  'customer:assign',
  'order:view',
  'order:create',
  'order:update',
  'order:cancel',
  // Phase 19 §A: lets the Create Order customer search look across every active
  // customer, not just the caller's own Data Scope — independent of
  // customer:view/customerDataScope, and never granted just by having this.
  'order:customerSearchAll',
  // Trash (Phase 3 addendum) — Order never had a deactivate-equivalent permission
  // to reuse the way Customer/Product did, so this is genuinely new.
  'order:delete',
  'product:view',
  // Phase 15: product create/update and reports viewing used to be Admin/Manager
  // role-gated only (no permission existed for them). Now that Manager access is
  // configurable, they're real grantable permissions like everything else here.
  'product:create',
  'product:update',
  // Phase 15 addendum: split out from product:update, same reasoning as customer:delete.
  'product:deactivate',
  'delivery:view',
  'delivery:update',
  'stock:add',
  'stock:adjust',
  'payment:view',
  'payment:create',
  'payment:edit',
  'report:view',
  // Phase 15 addendum: administrative authority, not a business-data permission —
  // lets a specific Manager configure their own Employees' permissions, a
  // capability that's otherwise Admin-only. Deliberately excluded from
  // DEFAULT_MANAGER_PERMISSIONS below and from the picker's business-data grid;
  // it's granted explicitly, never bundled into "Full Access."
  'employee:manage-permissions',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const permissionSchema = z.enum(PERMISSIONS);

// Phase 15 addendum — Products has no Data Scope (not per-employee), so only
// Customers and Orders get one. Omitted/undefined leaves the stored value
// untouched; explicitly not part of the enum is "no value" — that's cleared by
// omitting these fields entirely, matching every other optional-field convention
// in this codebase (undefined = don't touch, not a settable "null" state here).
export const dataScopeSchema = z.enum(['ALL', 'ASSIGNED']);

export const updatePermissionsSchema = z.object({
  permissions: z.array(permissionSchema),
  customerDataScope: dataScopeSchema.optional(),
  orderDataScope: dataScopeSchema.optional(),
});

// Safe defaults applied when a Manager creates a new Employee — see phases.md Phase 3 §15.
export const DEFAULT_EMPLOYEE_PERMISSIONS: Permission[] = [
  'customer:view',
  'customer:create',
  'customer:update',
  'order:view',
  'order:create',
  'product:view',
];

// Not auto-applied anywhere — purely the pre-checked starting point the Admin sees
// in the Approve-as-Manager UI (Phase 15), matching what every pre-existing Manager
// was backfilled with when Manager access became configurable. The Admin can
// uncheck any of these before approving. Every *business* permission, but not
// employee:manage-permissions — that stays an explicit, separate grant.
export const DEFAULT_MANAGER_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) => p !== 'employee:manage-permissions'
);

export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;
