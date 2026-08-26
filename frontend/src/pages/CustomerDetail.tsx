import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import ConfirmDialog from '@/components/ConfirmDialog';
import EmployeeMultiSelect from '@/components/EmployeeMultiSelect';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentUser, hasPermission } from '@/lib/auth';

interface Phone {
  id: number;
  phone: string;
  label: string | null;
  isPrimary: boolean;
}

interface Address {
  id: number;
  line1: string;
  line2: string | null;
  city: string;
  district: string | null;
  state: string;
  pincode: string;
  landmark: string | null;
  country: string;
}

interface OrderRow {
  id: number;
  orderNumber: string;
  total: number;
  orderStatus: string;
  deliveryStatus: string;
  orderDate: string;
  payments: { amount: number }[];
}

interface CustomerDetailData {
  id: number;
  name: string;
  email: string | null;
  notes: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  phones: Phone[];
  addresses: Address[];
  orders: OrderRow[];
  // Phase 19: several employees can share a customer now (replaces the old single
  // assignedEmployee).
  assignedEmployees: { employeeId: number; employee: { id: number; name: string | null } }[];
  assignedManager: { id: number; name: string | null } | null;
  createdAt: string;
}

interface NoteRow {
  id: number;
  note: string;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
}

interface ActivityRow {
  id: number;
  activity: string;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
}

interface EmployeeOption {
  id: number;
  name: string | null;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  status: string;
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canCreateOrder = hasPermission(currentUser, 'order:create');
  // Phase 19: split out of the old role-only check — manual (re)assignment is its
  // own grant now, not implied by being a Manager/Admin.
  const canManageAssignment = hasPermission(currentUser, 'customer:assign');

  const customerQuery = useQuery({
    queryKey: ['customer', id],
    queryFn: () => apiFetch<CustomerDetailData>(`/customers/${id}`),
  });
  const notesQuery = useQuery({
    queryKey: ['customer', id, 'notes'],
    queryFn: () => apiFetch<NoteRow[]>(`/customers/${id}/notes`),
  });
  const activityQuery = useQuery({
    queryKey: ['customer', id, 'activity'],
    queryFn: () => apiFetch<ActivityRow[]>(`/customers/${id}/activity`),
  });
  const employeesQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<EmployeeOption[]>('/users'),
    enabled: canManageAssignment,
  });

  // Phase 19: manual status control is gone — Customer status is fully derived from
  // order history now (see the backend's recalculateCustomerState). No toggle here
  // anymore; the "Active Customer"/"Inactive Customer" line below just reflects it.

  // Trash (Phase 3 addendum) — distinct from Deactivate above: this hides the
  // customer entirely (not just flags it), recoverable from Trash for 10 days.
  const deleteCustomer = useMutation({
    mutationFn: () => apiFetch(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Customer moved to Trash');
      navigate('/customers');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to delete'),
  });

  if (customerQuery.isPending) return <Skeleton className="h-96 w-full" />;
  if (customerQuery.isError || !customerQuery.data) {
    return (
      <ErrorState message="Could not load customer." onRetry={() => customerQuery.refetch()} />
    );
  }

  const customer = customerQuery.data;
  // Fixed a real bug here: this used to compare against 'Delivered' (title case),
  // which never matches the real DELIVERED enum value, so these three cards always
  // showed 0/₹0/total regardless of actual order history (PHASE11_TODO.md).
  const deliveredOrders = customer.orders.filter((o) => o.deliveryStatus === 'DELIVERED');
  const cancelledOrders = customer.orders.filter((o) => o.orderStatus === 'CANCELLED');
  const pendingOrders = customer.orders.length - deliveredOrders.length - cancelledOrders.length;
  // Matches orderMetrics.ts's sales definition (Phase 9): cancelled orders never
  // contributed revenue, so they're excluded from Total Purchases.
  const nonCancelledOrders = customer.orders.filter((o) => o.orderStatus !== 'CANCELLED');
  const totalPurchases = nonCancelledOrders.reduce((sum, o) => sum + o.total, 0);
  // Phase 13 §15-16: paid/outstanding derived the same way an individual order's
  // payment status is — summed from the Payment ledger, never a separately-tracked
  // figure that could drift out of sync.
  const totalPaid = nonCancelledOrders.reduce(
    (sum, o) => sum + o.payments.reduce((s, p) => s + p.amount, 0),
    0
  );
  const outstanding = totalPurchases - totalPaid;
  const recentOrders = [...customer.orders]
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <Link
        to="/customers"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {customer.status === 'ACTIVE' ? 'Active Customer' : 'Inactive Customer'}
          </p>
        </div>
        <div className="flex gap-2">
          {canCreateOrder && (
            <Button onClick={() => navigate(`/orders/new?customerId=${customer.id}`)}>
              + Create Order
            </Button>
          )}
          <EditCustomerDialog customer={customer} />
          {hasPermission(currentUser, 'customer:delete') && (
            <ConfirmDialog
              trigger={<Button variant="destructive">Delete</Button>}
              title="Delete Customer?"
              description="This customer will be moved to Trash. You can restore it within 10 days."
              confirmLabel="Move to Trash"
              isPending={deleteCustomer.isPending}
              onConfirm={() => deleteCustomer.mutate()}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Total Orders" value={String(customer.orders.length)} />
        <StatCard title="Total Purchases" value={`₹${totalPurchases.toLocaleString()}`} />
        <StatCard title="Paid" value={`₹${totalPaid.toLocaleString()}`} />
        <StatCard title="Outstanding" value={`₹${outstanding.toLocaleString()}`} />
        <StatCard title="Delivered" value={String(deliveredOrders.length)} />
        <StatCard title="Pending" value={String(pendingOrders)} />
        <StatCard title="Cancelled" value={String(cancelledOrders.length)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {customer.phones.map((phone) => (
              <div key={phone.id} className="flex items-center justify-between text-sm">
                <span>📞 {phone.phone}</span>
                <span className="text-xs text-muted-foreground">
                  {phone.isPrimary ? 'Primary' : phone.label || 'Alternate'}
                </span>
              </div>
            ))}
            {customer.email && <div className="pt-2 text-sm">✉️ {customer.email}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Address</CardTitle>
          </CardHeader>
          <CardContent>
            {customer.addresses[0] ? (
              <p className="text-sm leading-relaxed">
                {customer.addresses[0].line1}
                {customer.addresses[0].landmark && `, ${customer.addresses[0].landmark}`}
                <br />
                {customer.addresses[0].city}
                {customer.addresses[0].district && `, ${customer.addresses[0].district}`}
                <br />
                {customer.addresses[0].state} {customer.addresses[0].pincode}
                <br />
                {customer.addresses[0].country}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No address on file.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Manager: {customer.assignedManager?.name ?? 'Unassigned'}</p>
            <AssignedEmployeesRow
              customerId={customer.id}
              currentEmployees={customer.assignedEmployees}
              employees={employeesQuery.data}
              canEdit={canManageAssignment}
            />
          </CardContent>
        </Card>

        <OrderHistoryCard customerId={customer.id} orders={recentOrders} total={customer.orders.length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NotesPanel
          customerId={Number(id)}
          notes={notesQuery.data}
          isPending={notesQuery.isPending}
        />
        <ActivityPanel activity={activityQuery.data} isPending={activityQuery.isPending} />
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

// Phase 11 §14 — assignment used to be read-only here ("manage from the Employees
// page"); this lets a Manager/Admin change it inline instead. Phase 19: a customer
// can have several assigned Employees now — this edits the whole set via checkboxes,
// diffing against the current set to call assign for newly-checked and unassign
// (with that specific employeeId) for newly-unchecked ones.
function AssignedEmployeesRow({
  customerId,
  currentEmployees,
  employees,
  canEdit,
}: {
  customerId: number;
  currentEmployees: { employeeId: number; employee: { id: number; name: string | null } }[];
  employees: EmployeeOption[] | undefined;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>(currentEmployees.map((a) => a.employeeId));
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: async () => {
      const currentIds = currentEmployees.map((a) => a.employeeId);
      const toAdd = selectedIds.filter((id) => !currentIds.includes(id));
      const toRemove = currentIds.filter((id) => !selectedIds.includes(id));
      await Promise.all([
        ...toAdd.map((employeeId) =>
          apiFetch(`/customers/${customerId}/assign`, {
            method: 'POST',
            body: JSON.stringify({ employeeId }),
          })
        ),
        ...toRemove.map((employeeId) =>
          apiFetch(`/customers/${customerId}/unassign`, {
            method: 'POST',
            body: JSON.stringify({ employeeId }),
          })
        ),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', String(customerId)] });
      queryClient.invalidateQueries({ queryKey: ['customer', String(customerId), 'activity'] });
      toast.success('Employee assignment updated');
      setEditing(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update assignment'),
  });

  const names = currentEmployees.map((a) => a.employee.name ?? 'Unknown').join(', ');

  if (!editing) {
    return (
      <p className="flex items-center gap-2">
        Employee{currentEmployees.length === 1 ? '' : 's'}: {names || 'Unassigned'}
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setSelectedIds(currentEmployees.map((a) => a.employeeId));
              setEditing(true);
            }}
            className="text-primary hover:underline"
          >
            [Change Employees]
          </button>
        )}
      </p>
    );
  }

  const employeeOptions = (employees ?? []).filter(
    (e) => e.role === 'EMPLOYEE' && e.status === 'ACTIVE'
  );

  return (
    <div className="space-y-2">
      <EmployeeMultiSelect
        employees={employeeOptions}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </div>
  );
}

// Phase 11 §1/§4 — a real order-history section (previously just an unlabelled list
// with no date and no way to act on a row) with a Reorder button per order and a link
// to the full filtered list.
function OrderHistoryCard({
  customerId,
  orders,
  total,
}: {
  customerId: number;
  orders: OrderRow[];
  total: number;
}) {
  const navigate = useNavigate();

  const reorder = useMutation({
    mutationFn: (orderId: number) =>
      apiFetch<{ orderNumber: string }>(`/orders/${orderId}/reorder`, { method: 'POST' }),
    onSuccess: (newOrder) => {
      toast.success('New order created from this one');
      navigate(`/orders/${newOrder.orderNumber}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to reorder'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {orders.length === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}
        {orders.map((order) => (
          <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <div className="min-w-0">
              <Link to={`/orders/${order.orderNumber}`} className="truncate font-medium hover:underline">
                {order.orderNumber}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {new Date(order.orderDate).toLocaleDateString()} · ₹{order.total.toLocaleString()} ·{' '}
                {order.deliveryStatus.replace(/_/g, ' ')}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={reorder.isPending}
              onClick={() => reorder.mutate(order.id)}
            >
              Reorder
            </Button>
          </div>
        ))}
        {total > orders.length && (
          <Button variant="outline" size="sm" asChild className="mt-1">
            <Link to={`/orders?customerId=${customerId}`}>View All Orders ({total}) →</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function NotesPanel({
  customerId,
  notes,
  isPending,
}: {
  customerId: number;
  notes: NoteRow[] | undefined;
  isPending: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const addNote = useMutation({
    mutationFn: (note: string) =>
      apiFetch(`/customers/${customerId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', String(customerId), 'notes'] });
      queryClient.invalidateQueries({ queryKey: ['customer', String(customerId), 'activity'] });
      setText('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to add note'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending && <Skeleton className="h-16 w-full" />}
        {notes?.map((n) => (
          <div key={n.id} className="rounded-md border p-2 text-sm">
            <p>"{n.note}"</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Added by {n.createdBy?.name ?? 'Unknown'} ·{' '}
              {new Date(n.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))}
        {notes?.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
        <div className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a note…"
            className="min-h-[40px]"
          />
          <Button disabled={!text.trim() || addNote.isPending} onClick={() => addNote.mutate(text)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityPanel({
  activity,
  isPending,
}: {
  activity: ActivityRow[] | undefined;
  isPending: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isPending && <Skeleton className="h-16 w-full" />}
        {activity?.map((a) => (
          <div key={a.id} className="text-sm">
            <span className="text-muted-foreground">
              {new Date(a.createdAt).toLocaleDateString()}
            </span>{' '}
            — {a.activity}
            {a.createdBy?.name && (
              <span className="text-muted-foreground"> by {a.createdBy.name}</span>
            )}
          </div>
        ))}
        {activity?.length === 0 && (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

const editSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  phones: z
    .array(
      z.object({
        phone: z.string().min(1),
        label: z.string().optional(),
        isPrimary: z.boolean(),
      })
    )
    .min(1),
  line1: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  district: z.string().optional(),
  state: z.string().min(1, 'State is required'),
  pincode: z.string().min(1, 'Pincode is required'),
  landmark: z.string().optional(),
});

function EditCustomerDialog({ customer }: { customer: CustomerDetailData }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const currentAddress = customer.addresses[0];

  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: customer.name,
      email: customer.email ?? '',
      notes: customer.notes ?? '',
      phones: customer.phones.map((p) => ({
        phone: p.phone,
        label: p.label ?? '',
        isPrimary: p.isPrimary,
      })),
      line1: currentAddress?.line1 ?? '',
      city: currentAddress?.city ?? '',
      district: currentAddress?.district ?? '',
      state: currentAddress?.state ?? '',
      pincode: currentAddress?.pincode ?? '',
      landmark: currentAddress?.landmark ?? '',
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'phones' });

  const updateCustomer = useMutation({
    mutationFn: (values: z.infer<typeof editSchema>) =>
      apiFetch(`/customers/${customer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: values.name,
          email: values.email || undefined,
          notes: values.notes || undefined,
          phones: values.phones,
          address: {
            line1: values.line1,
            city: values.city,
            district: values.district || undefined,
            state: values.state,
            pincode: values.pincode,
            landmark: values.landmark || undefined,
          },
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', String(customer.id)] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer updated');
      setOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update customer'),
  });

  function setPrimary(index: number) {
    form.setValue(
      'phones',
      form.getValues('phones').map((p, i) => ({ ...p, isPrimary: i === index }))
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Edit</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => updateCustomer.mutate(v))} className="space-y-4">
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Phone Numbers</FormLabel>
              <div className="mt-2 space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Input {...form.register(`phones.${index}.phone` as const)} />
                    <Input className="w-32" {...form.register(`phones.${index}.label` as const)} />
                    <Button
                      type="button"
                      variant={form.watch(`phones.${index}.isPrimary`) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPrimary(index)}
                    >
                      Primary
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => append({ phone: '', label: 'Alternate', isPrimary: false })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add Phone
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="line1"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Address *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="district"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>District (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pincode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pincode *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="landmark"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Landmark (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={updateCustomer.isPending}>
                {updateCustomer.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
