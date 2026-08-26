import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PermissionPicker from '@/components/PermissionPicker';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentUser, hasPermission } from '@/lib/auth';
import {
  PERMISSION_PRESETS,
  EMPLOYEE_MANAGE_PERMISSIONS_GRANT,
  type DataScope,
  type PermissionState,
} from '@/lib/permissions';

interface EmployeeUser {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | null;
  requestedRole: 'MANAGER' | 'EMPLOYEE' | null;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'REJECTED';
  // Phase 18: an Employee can report to several Managers at once (replaces the old
  // single managerId).
  managerIds: number[];
  customerDataScope: DataScope | null;
  orderDataScope: DataScope | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface CustomerRow {
  id: number;
  name: string;
  // Phase 19: several employees can share a customer now.
  assignedEmployees: { employeeId: number; employee: { id: number; name: string | null } }[];
  assignedManagerId: number | null;
}

// Admin manages everyone; a Manager manages only their own directly-reporting
// Employees — mirrors the backend's assertManagesUser exactly (frontend checks are
// UX only, the backend independently enforces this).
function canManageAccount(currentUser: { id: number; role: string | null } | undefined, target: EmployeeUser) {
  if (!currentUser) return false;
  if (currentUser.role === 'ADMIN') return true;
  return currentUser.role === 'MANAGER' && target.managerIds.includes(currentUser.id);
}

export default function Employees() {
  const { data: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<EmployeeUser[]>('/users'),
  });
  const pendingQuery = useQuery({
    queryKey: ['users', 'pending'],
    queryFn: () => apiFetch<EmployeeUser[]>('/users?status=PENDING'),
  });
  const canAssignCustomers = hasPermission(currentUser, 'customer:assign');
  const customersQuery = useQuery({
    queryKey: ['customers'],
    // pageSize=100 (the API's max) rather than true pagination — this table is for
    // bulk-assigning across the whole customer list, not browsing it page by page.
    queryFn: () => apiFetch<{ data: CustomerRow[] }>('/customers?pageSize=100'),
    enabled: canAssignCustomers,
  });

  const [permissionsUser, setPermissionsUser] = useState<EmployeeUser | null>(null);
  const [reviewUser, setReviewUser] = useState<EmployeeUser | null>(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);

  const employees = useMemo(
    () => usersQuery.data?.filter((u) => u.role === 'EMPLOYEE') ?? [],
    [usersQuery.data]
  );
  const managers = useMemo(
    () => usersQuery.data?.filter((u) => u.role === 'MANAGER') ?? [],
    [usersQuery.data]
  );

  function invalidateUsers() {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      apiFetch(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      invalidateUsers();
      toast.success('Status updated');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status'),
  });

  const suspend = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}/suspend`, { method: 'POST' }),
    onSuccess: () => {
      invalidateUsers();
      toast.success('Access suspended');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to suspend'),
  });

  const reactivate = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}/reactivate`, { method: 'POST' }),
    onSuccess: () => {
      invalidateUsers();
      toast.success('Access reactivated');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to reactivate'),
  });

  if (usersQuery.isPending) return <Skeleton className="h-64 w-full" />;
  if (usersQuery.isError) {
    return <ErrorState message="Could not load employees." onRetry={() => usersQuery.refetch()} />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Employees"
        action={
          <CreateEmployeeDialog managers={managers} isAdmin={currentUser?.role === 'ADMIN'} />
        }
      />

      {currentUser?.role === 'ADMIN' && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            Pending Approval
            {pendingQuery.data && pendingQuery.data.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {pendingQuery.data.length}
              </span>
            )}
          </h2>
          {pendingQuery.isPending && <Skeleton className="h-16 w-full" />}
          {pendingQuery.data && pendingQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No accounts waiting for approval.</p>
          )}
          {pendingQuery.data && pendingQuery.data.length > 0 && (
            <div className="divide-y rounded-md border">
              {pendingQuery.data.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setReviewUser(user)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-accent"
                >
                  <span className="font-medium">{user.name}</span>
                  <span className="text-muted-foreground">{user.phone}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Pending
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Manager(s)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...managers, ...employees].map((user) => {
            const manageable = canManageAccount(currentUser, user);
            const canEditPermissions =
              manageable &&
              (currentUser?.role === 'ADMIN' || hasPermission(currentUser, EMPLOYEE_MANAGE_PERMISSIONS_GRANT));
            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
                  {user.role === 'EMPLOYEE'
                    ? user.managerIds.length > 0
                      ? user.managerIds
                          .map((id) => managers.find((m) => m.id === id)?.name ?? `#${id}`)
                          .join(', ')
                      : '—'
                    : ''}
                </TableCell>
                <TableCell>{user.status}</TableCell>
                <TableCell>
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
                </TableCell>
                <TableCell className="flex flex-wrap justify-end gap-2">
                  <EditEmployeeDialog user={user} isAdmin={currentUser?.role === 'ADMIN'} />
                  {currentUser?.role === 'ADMIN' && user.role === 'EMPLOYEE' && (
                    <ManageTeamsDialog employee={user} managers={managers} />
                  )}
                  {canEditPermissions && (
                    <Button variant="outline" size="sm" onClick={() => setPermissionsUser(user)}>
                      Permissions
                    </Button>
                  )}
                  {manageable && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        toggleStatus.mutate({
                          id: user.id,
                          status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                        })
                      }
                    >
                      {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                  {manageable && user.status === 'ACTIVE' && (
                    <Button variant="outline" size="sm" onClick={() => suspend.mutate(user.id)}>
                      Suspend Access
                    </Button>
                  )}
                  {manageable && user.status === 'SUSPENDED' && (
                    <Button variant="outline" size="sm" onClick={() => reactivate.mutate(user.id)}>
                      Reactivate
                    </Button>
                  )}
                  {currentUser?.role === 'ADMIN' && (
                    <DeleteEmployeeDialog
                      user={user}
                      candidates={user.role === 'MANAGER' ? managers : employees}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {managers.length + employees.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <EmptyState message="No employees yet." />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {reviewUser && (
        <ApprovalDialog user={reviewUser} onClose={() => setReviewUser(null)} />
      )}

      {permissionsUser && (
        <PermissionsDialog user={permissionsUser} onClose={() => setPermissionsUser(null)} />
      )}

      {/* Phase 19: manual (re)assignment is its own customer:assign grant now, not
          implied by reaching this Admin/Manager-only page. */}
      {canAssignCustomers && (
        <div>
          <h2 className="mb-4 text-xl font-semibold">Customer Assignment</h2>
          {customersQuery.isPending && <Skeleton className="h-48 w-full" />}
          {customersQuery.isError && (
            <ErrorState
              message="Could not load customers."
              onRetry={() => customersQuery.refetch()}
            />
          )}
          {customersQuery.data && (
            <CustomerAssignmentTable
              customers={customersQuery.data.data}
              employees={employees}
              selectedIds={selectedCustomerIds}
              onSelectionChange={setSelectedCustomerIds}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CreateEmployeeDialog({
  managers,
  isAdmin,
}: {
  managers: EmployeeUser[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email(),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Needs a letter')
      .regex(/[0-9]/, 'Needs a number'),
    role: z.enum(['MANAGER', 'EMPLOYEE']),
    managerId: z.string().optional(),
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', role: 'EMPLOYEE', managerId: undefined },
  });

  const role = form.watch('role');

  const createUser = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          managerId: values.managerId ? Number(values.managerId) : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Employee created');
      setOpen(false);
      form.reset();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to create employee'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Add Employee</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => createUser.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Temporary password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isAdmin && (
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                        <SelectItem value="EMPLOYEE">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {isAdmin && role === 'EMPLOYEE' && (
              <FormField
                control={form.control}
                name="managerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manager</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a manager" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {managers.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Role changes are Admin-only on the backend (userService.updateRole), and only
// MANAGER/EMPLOYEE are offered here — same constraint as CreateEmployeeDialog's role
// Select, since promoting someone to ADMIN isn't a workflow this app exposes casually.
const editEmployeeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email(),
  role: z.enum(['MANAGER', 'EMPLOYEE']),
});

function EditEmployeeDialog({ user, isAdmin }: { user: EmployeeUser; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof editEmployeeSchema>>({
    resolver: zodResolver(editEmployeeSchema),
    defaultValues: {
      name: user.name ?? '',
      email: user.email,
      role: user.role as 'MANAGER' | 'EMPLOYEE',
    },
  });

  const updateUser = useMutation({
    mutationFn: async (values: z.infer<typeof editEmployeeSchema>) => {
      await apiFetch(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: values.name, email: values.email }),
      });
      if (isAdmin && values.role !== user.role) {
        await apiFetch(`/users/${user.id}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ role: values.role }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Employee updated');
      setOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update employee'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit employee</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => updateUser.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isAdmin && (
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                        <SelectItem value="EMPLOYEE">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Phase 18 item 3: Admin-only add/remove of an Employee from a Manager's team — a
// separate action from CreateEmployeeDialog's initial single-manager pick, since an
// Employee can belong to more than one team now.
function ManageTeamsDialog({
  employee,
  managers,
}: {
  employee: EmployeeUser;
  managers: EmployeeUser[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>(employee.managerIds);
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: async () => {
      const toAdd = selectedIds.filter((id) => !employee.managerIds.includes(id));
      const toRemove = employee.managerIds.filter((id) => !selectedIds.includes(id));
      await Promise.all([
        ...toAdd.map((managerId) =>
          apiFetch(`/users/${employee.id}/managers`, {
            method: 'POST',
            body: JSON.stringify({ managerId }),
          })
        ),
        ...toRemove.map((managerId) =>
          apiFetch(`/users/${employee.id}/managers/${managerId}`, { method: 'DELETE' })
        ),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Teams updated');
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update teams'),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSelectedIds(employee.managerIds);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Teams
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employee.name}'s Teams</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          An Employee can report to more than one Manager — check every team this Employee
          belongs to.
        </p>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
          {managers.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedIds.includes(m.id)}
                onCheckedChange={(checked) =>
                  setSelectedIds((prev) =>
                    checked === true ? [...prev, m.id] : prev.filter((id) => id !== m.id)
                  )
                }
              />
              {m.name}
            </label>
          ))}
          {managers.length === 0 && (
            <p className="text-sm text-muted-foreground">No managers yet.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({ user, onClose }: { user: EmployeeUser; onClose: () => void }) {
  const { data: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const permissionsQuery = useQuery({
    queryKey: ['permissions', user.id],
    queryFn: () => apiFetch<{ permissions: string[] }>(`/users/${user.id}/permissions`),
  });

  // Data Scope isn't returned by GET /:id/permissions (it's a User column, not a
  // permission grant) — the row already has it from the /users list, so it's just
  // seeded as the picker's initial state, no extra fetch needed.
  const [state, setState] = useState<PermissionState | null>(null);
  const current: PermissionState = state ?? {
    permissions: permissionsQuery.data?.permissions ?? [],
    customerDataScope: user.customerDataScope ?? 'ASSIGNED',
    orderDataScope: user.orderDataScope ?? 'ASSIGNED',
  };

  const savePermissions = useMutation({
    mutationFn: (value: PermissionState) =>
      apiFetch(`/users/${user.id}/permissions`, { method: 'PUT', body: JSON.stringify(value) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', user.id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Permissions saved');
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to save permissions'),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user.role === 'MANAGER' ? 'Manager' : 'Employee'} Permissions</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{user.name} · {user.role}</p>
        {permissionsQuery.isPending && <Skeleton className="h-48 w-full" />}
        {permissionsQuery.data && (
          <PermissionPicker
            value={current}
            onChange={setState}
            showDelegatedGrant={currentUser?.role === 'ADMIN' && user.role === 'MANAGER'}
          />
        )}
        <DialogFooter>
          <Button
            onClick={() => savePermissions.mutate(current)}
            disabled={savePermissions.isPending}
          >
            {savePermissions.isPending ? 'Saving…' : 'Save Permissions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalDialog({ user, onClose }: { user: EmployeeUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<'MANAGER' | 'EMPLOYEE'>(user.requestedRole ?? 'EMPLOYEE');
  const [state, setState] = useState<PermissionState>(() => {
    const preset = PERMISSION_PRESETS.find(
      (p) => p.value === (role === 'MANAGER' ? 'STANDARD_MANAGER' : 'STANDARD_EMPLOYEE')
    )!;
    return preset.state;
  });

  function selectRole(next: 'MANAGER' | 'EMPLOYEE') {
    setRole(next);
    const preset = PERMISSION_PRESETS.find(
      (p) => p.value === (next === 'MANAGER' ? 'STANDARD_MANAGER' : 'STANDARD_EMPLOYEE')
    )!;
    setState(preset.state);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['users', 'pending'] });
  }

  const approve = useMutation({
    mutationFn: () =>
      apiFetch(`/users/${user.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ role, ...state }),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Account approved');
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to approve'),
  });

  const reject = useMutation({
    mutationFn: () => apiFetch(`/users/${user.id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      toast.success('Account rejected');
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to reject'),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p className="font-medium">{user.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phone</p>
            <p className="font-medium">{user.phone}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
          {user.requestedRole && (
            <div>
              <p className="text-xs text-muted-foreground">Applied as</p>
              <p className="font-medium">{user.requestedRole}</p>
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Role</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={role === 'MANAGER' ? 'default' : 'outline'}
              onClick={() => selectRole('MANAGER')}
            >
              Manager
            </Button>
            <Button
              type="button"
              variant={role === 'EMPLOYEE' ? 'default' : 'outline'}
              onClick={() => selectRole('EMPLOYEE')}
            >
              Employee
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Permissions
          </p>
          <PermissionPicker value={state} onChange={setState} showDelegatedGrant={role === 'MANAGER'} />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            onClick={() => reject.mutate()}
            disabled={reject.isPending || approve.isPending}
          >
            Reject
          </Button>
          <Button onClick={() => approve.mutate()} disabled={approve.isPending || reject.isPending}>
            {approve.isPending ? 'Approving…' : 'Approve Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteImpact {
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  assignedCustomerCount: number;
  activeOrderCount: number;
  reportingEmployeeCount: number;
}

// Trash (Phase 3 addendum), Admin-only. If the target has active dependents
// (an Employee's assigned customers/orders, or Employees still reporting to a
// Manager), reassignment to another account of the same role is required before
// the delete can proceed — matches the spec's own mockup exactly.
function DeleteEmployeeDialog({
  user,
  candidates,
}: {
  user: EmployeeUser;
  candidates: EmployeeUser[];
}) {
  const [open, setOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>('');
  const queryClient = useQueryClient();

  const impactQuery = useQuery({
    queryKey: ['users', user.id, 'delete-impact'],
    queryFn: () => apiFetch<DeleteImpact>(`/users/${user.id}/delete-impact`),
    enabled: open,
  });

  const needsReassignment =
    !!impactQuery.data &&
    (impactQuery.data.assignedCustomerCount > 0 ||
      impactQuery.data.activeOrderCount > 0 ||
      impactQuery.data.reportingEmployeeCount > 0);

  const deleteUser = useMutation({
    mutationFn: () =>
      apiFetch(`/users/${user.id}`, {
        method: 'DELETE',
        body: JSON.stringify(reassignTo ? { reassignToUserId: Number(reassignTo) } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`${user.name} moved to Trash`);
      setOpen(false);
      setReassignTo('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to delete'),
  });

  const otherCandidates = candidates.filter((c) => c.id !== user.id);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReassignTo('');
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {user.role === 'MANAGER' ? 'Manager' : 'Employee'}?</DialogTitle>
        </DialogHeader>
        {impactQuery.isPending && <Skeleton className="h-16 w-full" />}
        {impactQuery.data && (
          <div className="space-y-4">
            {needsReassignment ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {user.name} currently has:
                  {impactQuery.data.assignedCustomerCount > 0 && (
                    <span className="mt-1 block">
                      {impactQuery.data.assignedCustomerCount} assigned customers
                    </span>
                  )}
                  {impactQuery.data.activeOrderCount > 0 && (
                    <span className="block">{impactQuery.data.activeOrderCount} active orders</span>
                  )}
                  {impactQuery.data.reportingEmployeeCount > 0 && (
                    <span className="block">
                      {impactQuery.data.reportingEmployeeCount} employees reporting to them
                    </span>
                  )}
                </p>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Reassign to another {user.role === 'MANAGER' ? 'Manager' : 'Employee'}
                  </p>
                  <Select value={reassignTo} onValueChange={setReassignTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {otherCandidates.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {user.name} will be moved to Trash. You can restore it within 10 days.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={(needsReassignment && !reassignTo) || deleteUser.isPending}
            onClick={() => deleteUser.mutate()}
          >
            {needsReassignment ? 'Reassign & Move to Trash' : 'Move to Trash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerAssignmentTable({
  customers,
  employees,
  selectedIds,
  onSelectionChange,
}: {
  customers: CustomerRow[];
  employees: EmployeeUser[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
}) {
  const queryClient = useQueryClient();

  // Phase 19: assign is additive now (adds one more employee alongside whoever's
  // already there) — /reassign behaves identically now that there's no single slot
  // to swap, so this just always calls /assign.
  const assign = useMutation({
    mutationFn: ({ customerId, employeeId }: { customerId: number; employeeId: number }) =>
      apiFetch(`/customers/${customerId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ employeeId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer assigned');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to assign customer'),
  });

  // Removes one specific employee's assignment, leaving any others untouched.
  const unassign = useMutation({
    mutationFn: ({ customerId, employeeId }: { customerId: number; employeeId: number }) =>
      apiFetch(`/customers/${customerId}/unassign`, {
        method: 'POST',
        body: JSON.stringify({ employeeId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer unassigned');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to unassign customer'),
  });

  const bulkAssign = useMutation({
    mutationFn: ({ customerIds, employeeId }: { customerIds: number[]; employeeId: number }) =>
      apiFetch('/customers/bulk-assign', {
        method: 'POST',
        body: JSON.stringify({ customerIds, employeeId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customers assigned');
      onSelectionChange([]);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to assign customers'),
  });

  function toggleSelected(id: number, checked: boolean) {
    onSelectionChange(checked ? [...selectedIds, id] : selectedIds.filter((i) => i !== id));
  }

  return (
    <div className="space-y-3">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/50 p-3">
          <span className="text-sm">{selectedIds.length} selected</span>
          <Select
            onValueChange={(employeeId) =>
              bulkAssign.mutate({ customerIds: selectedIds, employeeId: Number(employeeId) })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Assign selected to…" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Customer</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead className="w-56">Add Employee</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => {
            const assignedIds = customer.assignedEmployees.map((a) => a.employeeId);
            // The select only offers employees not already assigned — picking one
            // always means "add," never "swap," now that assignment is multi-value.
            const availableEmployees = employees.filter((e) => !assignedIds.includes(e.id));
            return (
              <TableRow key={customer.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(customer.id)}
                    onCheckedChange={(checked) => toggleSelected(customer.id, checked === true)}
                  />
                </TableCell>
                <TableCell className="font-medium">{customer.name}</TableCell>
                <TableCell>
                  {customer.assignedEmployees.length === 0 ? (
                    'Unassigned'
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {customer.assignedEmployees.map((a) => (
                        <span
                          key={a.employeeId}
                          className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                          {a.employee.name ?? `#${a.employeeId}`}
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            disabled={unassign.isPending}
                            onClick={() =>
                              unassign.mutate({ customerId: customer.id, employeeId: a.employeeId })
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value=""
                    onValueChange={(employeeId) =>
                      assign.mutate({ customerId: customer.id, employeeId: Number(employeeId) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add employee…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEmployees.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            );
          })}
          {customers.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No customers yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
