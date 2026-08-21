// Phase 15 addendum: Role + Permissions + Data Scope. Grouped the same way the
// backend's PERMISSIONS list is organized (schemas/permission.schema.ts) — keep
// these in sync if that list changes.
export interface PermissionModule {
  label: string;
  // Customers/Orders get a Data Scope radio (All vs. Assigned); Products/Delivery/
  // Payments/Reports don't — Products isn't per-employee, and the others have no
  // concept of "assigned to me" at all.
  scopeKey?: 'customerDataScope' | 'orderDataScope';
  permissions: { value: string; label: string }[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    label: 'Customers',
    scopeKey: 'customerDataScope',
    permissions: [
      { value: 'customer:view', label: 'View' },
      { value: 'customer:create', label: 'Create' },
      { value: 'customer:update', label: 'Edit' },
      { value: 'customer:delete', label: 'Delete' },
    ],
  },
  {
    label: 'Orders',
    scopeKey: 'orderDataScope',
    permissions: [
      { value: 'order:view', label: 'View' },
      { value: 'order:create', label: 'Create' },
      { value: 'order:update', label: 'Edit' },
      { value: 'order:cancel', label: 'Cancel' },
    ],
  },
  {
    label: 'Products',
    permissions: [
      { value: 'product:view', label: 'View' },
      { value: 'product:create', label: 'Create' },
      { value: 'product:update', label: 'Edit' },
      { value: 'product:deactivate', label: 'Deactivate' },
    ],
  },
  {
    label: 'Stock',
    permissions: [
      { value: 'stock:add', label: 'Add Stock' },
      { value: 'stock:adjust', label: 'Adjust Stock' },
    ],
  },
  {
    label: 'Delivery',
    permissions: [{ value: 'delivery:view', label: 'View' }, { value: 'delivery:update', label: 'Update Delivery Status' }],
  },
  {
    label: 'Payments',
    permissions: [
      { value: 'payment:view', label: 'View' },
      { value: 'payment:create', label: 'Add Payment' },
      { value: 'payment:edit', label: 'Reverse/Correct Payment' },
    ],
  },
  {
    label: 'Reports',
    permissions: [{ value: 'report:view', label: 'View' }],
  },
];

// Every business permission — everything in PERMISSION_MODULES, flattened. Does NOT
// include employee:manage-permissions, which is administrative authority, not a
// business-data permission, and is never bundled into a preset (see
// EMPLOYEE_MANAGE_PERMISSIONS_GRANT below).
export const ALL_BUSINESS_PERMISSIONS = PERMISSION_MODULES.flatMap((m) =>
  m.permissions.map((p) => p.value)
);

export const EMPLOYEE_MANAGE_PERMISSIONS_GRANT = 'employee:manage-permissions';

export type DataScope = 'ALL' | 'ASSIGNED';

export interface PermissionState {
  permissions: string[];
  customerDataScope: DataScope;
  orderDataScope: DataScope;
}

// Mirrors the backend's DEFAULT_EMPLOYEE_PERMISSIONS (schemas/permission.schema.ts)
// — keep these two lists in sync if either changes.
const DEFAULT_EMPLOYEE_PERMISSIONS = [
  'customer:view',
  'customer:create',
  'customer:update',
  'order:view',
  'order:create',
  'product:view',
];

export const PERMISSION_PRESETS: {
  value: 'STANDARD_EMPLOYEE' | 'STANDARD_MANAGER' | 'FULL_ACCESS';
  label: string;
  state: PermissionState;
}[] = [
  {
    value: 'STANDARD_EMPLOYEE',
    label: 'Standard Employee',
    state: {
      permissions: DEFAULT_EMPLOYEE_PERMISSIONS,
      customerDataScope: 'ASSIGNED',
      orderDataScope: 'ASSIGNED',
    },
  },
  {
    value: 'STANDARD_MANAGER',
    label: 'Standard Manager',
    state: {
      permissions: ALL_BUSINESS_PERMISSIONS,
      customerDataScope: 'ASSIGNED',
      orderDataScope: 'ASSIGNED',
    },
  },
  {
    value: 'FULL_ACCESS',
    label: 'Full Access',
    state: {
      permissions: ALL_BUSINESS_PERMISSIONS,
      customerDataScope: 'ALL',
      orderDataScope: 'ALL',
    },
  },
];
