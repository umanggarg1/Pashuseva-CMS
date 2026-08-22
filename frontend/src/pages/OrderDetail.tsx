import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, MapPin, Pencil, Printer, Search, Trash2 } from 'lucide-react';
import type { DuplicateOrderState } from './CreateOrder';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

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
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { apiFetch, apiUrl, ApiError } from '@/lib/api';
import { useCurrentUser, hasPermission } from '@/lib/auth';
import { packagingUnitLabel } from '@/lib/productUnits';

const ORDER_STEPS = ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED'];
const DELIVERY_STEPS = ['NOT_DISPATCHED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED'] as const;

interface OrderItemRow {
  id: number;
  productId: number | null;
  productName: string;
  productSKU: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
}

interface OrderAddressRow {
  addressLine: string;
  landmark: string | null;
  city: string;
  district: string | null;
  state: string;
  pincode: string;
  country: string;
}

interface OrderDetailData {
  id: number;
  orderNumber: string;
  invoiceNumber: string | null;
  orderDate: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  deliveryStatus: string;
  expectedDelivery: string | null;
  articleNumber: string | null;
  estimatedDeliveryCharges: number | null;
  notes: string | null;
  cancellationReason: string | null;
  items: OrderItemRow[];
  address: OrderAddressRow | null;
  customer: {
    id: number;
    name: string;
    phones: { phone: string; isPrimary: boolean }[];
    notes: string | null;
  };
  assignedEmployee: { id: number; name: string | null } | null;
  createdBy: { id: number; name: string | null } | null;
}

interface NoteRow {
  id: number;
  note: string;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
}

interface ActivityRow {
  id: number;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
}

interface TrackingRow {
  id: number;
  status: string;
  location: string | null;
  note: string | null;
  receivedBy: string | null;
  createdAt: string;
  updatedBy: { id: number; name: string | null } | null;
}

interface PaymentRow {
  id: number;
  amount: number;
  method: string;
  referenceNumber: string | null;
  paymentDate: string;
  notes: string | null;
  reversesPaymentId: number | null;
  reversesPayment: { id: number; amount: number } | null;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
}

interface PaymentsResponse {
  payments: PaymentRow[];
  paid: number;
  remaining: number;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Unpaid',
  PARTIAL: 'Partially Paid',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

interface EmployeeOption {
  id: number;
  name: string | null;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  status: string;
}

async function fetchParcelSummaryPdf(orderId: number): Promise<Blob> {
  const res = await fetch(apiUrl(`/orders/${orderId}/parcel-summary`), {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to generate parcel summary');
  return res.blob();
}

// Opens the PDF in a new tab rather than trying to auto-trigger a print dialog via
// a hidden iframe — that trick only works on desktop. Mobile browsers (iOS Safari,
// Chrome on Android) have no PDF plugin to drive print() on, so a hidden iframe
// silently does nothing there. Opening the blob directly works everywhere: desktop
// gets the browser's PDF viewer (Ctrl+P from there), mobile gets its native PDF
// viewer with the OS share/print sheet.
function openPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canEditOrder = hasPermission(currentUser, 'order:update');
  const canEditDelivery = hasPermission(currentUser, 'delivery:update');
  const canViewPayments = hasPermission(currentUser, 'payment:view');
  const canAddPayment = hasPermission(currentUser, 'payment:create');
  const canReversePayment = hasPermission(currentUser, 'payment:edit');
  const canDeleteOrder = hasPermission(currentUser, 'order:delete');
  const canManageAssignment = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';
  // Phase 11 §8: forward-only status transitions are enforced backend-side for
  // everyone except Admin/Manager, who get a full override for corrections — mirror
  // that here so the picker doesn't offer options the backend will just reject.
  const canOverrideStatus = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';

  const orderQuery = useQuery({
    queryKey: ['order', orderNumber],
    queryFn: () => apiFetch<OrderDetailData>(`/orders/number/${orderNumber}`),
  });
  const order = orderQuery.data;
  const id = order?.id;

  const notesQuery = useQuery({
    queryKey: ['order', id, 'notes'],
    queryFn: () => apiFetch<NoteRow[]>(`/orders/${id}/notes`),
    enabled: !!id,
  });
  const activityQuery = useQuery({
    queryKey: ['order', id, 'activity'],
    queryFn: () => apiFetch<ActivityRow[]>(`/orders/${id}/activity`),
    enabled: !!id,
  });
  const trackingQuery = useQuery({
    queryKey: ['order', id, 'tracking'],
    queryFn: () => apiFetch<TrackingRow[]>(`/orders/${id}/tracking`),
    enabled: !!id,
  });
  const paymentsQuery = useQuery({
    queryKey: ['order', id, 'payments'],
    queryFn: () => apiFetch<PaymentsResponse>(`/orders/${id}/payments`),
    enabled: !!id && canViewPayments,
  });
  const employeesQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<EmployeeOption[]>('/users'),
    enabled: canManageAssignment,
  });

  function invalidateOrder() {
    queryClient.invalidateQueries({ queryKey: ['order', orderNumber] });
    queryClient.invalidateQueries({ queryKey: ['order', id, 'activity'] });
    // Every status/field/payment change here can shift dashboard and report numbers
    // (order counts, sales, outstanding, paid/unpaid totals) — both are computed live
    // from the database, but the cached copies still need to be told to refetch.
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  }

  function invalidatePayments() {
    invalidateOrder();
    queryClient.invalidateQueries({ queryKey: ['order', id, 'payments'] });
  }

  const advanceStatus = useMutation({
    mutationFn: (orderStatus: string) =>
      apiFetch(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ orderStatus }) }),
    onSuccess: () => {
      invalidateOrder();
      toast.success('Order status updated');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status'),
  });

  const updateOrderFields = useMutation({
    mutationFn: (body: {
      assignedEmployeeId?: number;
      expectedDelivery?: string;
      articleNumber?: string;
      estimatedDeliveryCharges?: string;
    }) => apiFetch(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateOrder();
      toast.success('Order updated');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update order'),
  });

  // Trash (Phase 3 addendum) — distinct from Cancel: this hides the order entirely,
  // recoverable from Trash for 10 days. Its own Payment ledger/line items are
  // untouched, same as everything else about the order.
  const deleteOrder = useMutation({
    mutationFn: () => apiFetch(`/orders/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Order moved to Trash');
      navigate('/orders');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to delete'),
  });

  // Print Parcel Summary / Print Again are the same action — the PDF is regenerated
  // fresh from the current Order/Customer/Product data every time, so re-printing
  // later always reflects whatever has changed since the first print.
  const parcelSummary = useMutation({
    mutationFn: () => fetchParcelSummaryPdf(id!),
    onSuccess: (blob) => openPdfBlob(blob),
    onError: () => toast.error('Failed to generate parcel summary'),
  });

  const reorder = useMutation({
    mutationFn: () =>
      apiFetch<{ id: number; orderNumber: string }>(`/orders/${id}/reorder`, { method: 'POST' }),
    onSuccess: (newOrder) => {
      toast.success('New order created from this one');
      navigate(`/orders/${newOrder.orderNumber}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to reorder'),
  });

  if (orderQuery.isPending) return <Skeleton className="h-96 w-full" />;
  if (orderQuery.isError || !order || !id) {
    return <ErrorState message="Could not load order." onRetry={() => orderQuery.refetch()} />;
  }

  const canEditOrCancel =
    order.deliveryStatus === 'NOT_DISPATCHED' &&
    order.orderStatus !== 'CANCELLED' &&
    order.orderStatus !== 'COMPLETED';
  // Order status (workflow stage) is manually selectable and independent of dispatch
  // status, by explicit request — e.g. marking an order COMPLETED naturally happens
  // after delivery, which is well after NOT_DISPATCHED. Edit/Cancel Order stay gated
  // by canEditOrCancel above, since those protect item/pricing integrity once
  // fulfillment has started, a different concern from the status label itself.
  const canChangeOrderStatus = canEditOrder && order.orderStatus !== 'CANCELLED';

  return (
    <div className="space-y-6">
      <Link
        to="/orders"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">#{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {order.customer.name} · Created {new Date(order.orderDate).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canChangeOrderStatus ? (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Order Status:</span>
              <Select
                value={order.orderStatus}
                onValueChange={(v) => advanceStatus.mutate(v)}
                disabled={advanceStatus.isPending}
              >
                <SelectTrigger className="h-8 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STEPS.filter(
                    (s) => canOverrideStatus || ORDER_STEPS.indexOf(s) >= ORDER_STEPS.indexOf(order.orderStatus)
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Order Status: {order.orderStatus}</span>
          )}
          <Button variant="outline" onClick={() => reorder.mutate()} disabled={reorder.isPending}>
            Reorder
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              navigate('/orders/new', {
                state: {
                  customerId: order.customer.id,
                  items: order.items
                    .filter((i): i is OrderItemRow & { productId: number } => i.productId !== null)
                    .map((i) => ({ productId: i.productId, quantity: i.quantity })),
                } satisfies DuplicateOrderState,
              })
            }
          >
            Duplicate Order
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
          <Button
            variant="outline"
            disabled={parcelSummary.isPending}
            onClick={() => parcelSummary.mutate()}
          >
            <Printer className="mr-1.5 h-4 w-4" /> Print Parcel Summary
          </Button>
          {canEditOrder && canEditOrCancel && (
            <CancelOrderDialog orderId={id} onCancelled={invalidateOrder} />
          )}
          {canDeleteOrder && (
            <ConfirmDialog
              trigger={<Button variant="destructive">Delete</Button>}
              title="Delete Order?"
              description="This order will be moved to Trash. You can restore it within 10 days."
              confirmLabel="Move to Trash"
              isPending={deleteOrder.isPending}
              onConfirm={() => deleteOrder.mutate()}
            />
          )}
        </div>
      </div>

      <PrintableOrder order={order} paid={paymentsQuery.data?.paid} remaining={paymentsQuery.data?.remaining} />

      {order.orderStatus === 'CANCELLED' && order.cancellationReason && (
        <ErrorState message={`Order cancelled: ${order.cancellationReason}`} />
      )}

      {/* Order status strip */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-lg border p-4">
        {ORDER_STEPS.map((step, index) => {
          const currentIndex = ORDER_STEPS.indexOf(order.orderStatus);
          return (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                  index <= currentIndex
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {index < currentIndex ? <Check className="h-3.5 w-3.5" /> : index === currentIndex ? '●' : '○'}
              </div>
              <span
                className={`whitespace-nowrap text-xs ${index <= currentIndex ? '' : 'text-muted-foreground'}`}
              >
                {step}
              </span>
              {index < ORDER_STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{order.customer.name}</p>
            {order.customer.phones.map((p) => (
              <p key={p.phone} className="text-muted-foreground">
                📞 {p.phone}
              </p>
            ))}
            {order.address && (
              <p className="pt-2 text-muted-foreground">
                {order.address.addressLine}
                {order.address.landmark && `, ${order.address.landmark}`}
                <br />
                {order.address.city}
                {order.address.district && `, ${order.address.district}`}
                <br />
                {order.address.state} {order.address.pincode}
              </p>
            )}
            {order.customer.notes && (
              <p className="pt-2 text-xs text-muted-foreground">
                Customer notes: "{order.customer.notes}"
              </p>
            )}
            <Link
              to={`/customers/${order.customer.id}`}
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              View Full Customer Profile →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Items: {order.items.length}</p>
            <p>Subtotal: ₹{order.subtotal.toLocaleString()}</p>
            <p>Discount: ₹{order.discount.toLocaleString()}</p>
            <p>Delivery: ₹{order.shipping.toLocaleString()}</p>
            <p className="text-base font-semibold">Total: ₹{order.total.toLocaleString()}</p>

            <div className="border-t pt-2 text-muted-foreground">
              <AssignedEmployeeRow
                order={order}
                employees={employeesQuery.data}
                canEdit={canManageAssignment}
                onSave={(assignedEmployeeId) => updateOrderFields.mutate({ assignedEmployeeId })}
                isSaving={updateOrderFields.isPending}
              />
              <p>Created By: {order.createdBy?.name ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Order Items</CardTitle>
          {canEditOrder && canEditOrCancel && (
            <EditOrderItemsDialog orderId={id} currentItems={order.items} onSuccess={invalidateOrder} />
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.productName}{' '}
                    {packagingUnitLabel(item.unit) && (
                      <span className="text-xs text-muted-foreground">
                        ({packagingUnitLabel(item.unit)})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>₹{item.unitPrice.toLocaleString()}</TableCell>
                  <TableCell>₹{item.discount.toLocaleString()}</TableCell>
                  <TableCell className="font-medium">₹{item.totalPrice.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 space-y-1 border-t pt-3 text-right text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>₹{order.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-₹{order.discount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Delivery</span>
              <span>₹{order.shipping.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>₹{order.total.toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <DeliveryCard
        order={order}
        tracking={trackingQuery.data}
        isTrackingPending={trackingQuery.isPending}
        canEdit={canEditDelivery}
        canOverrideStatus={canOverrideStatus}
        onSaveExpectedDelivery={(expectedDelivery) =>
          updateOrderFields.mutate({ expectedDelivery })
        }
        onSaveArticleNumber={(articleNumber) => updateOrderFields.mutate({ articleNumber })}
        onSaveEstimatedDeliveryCharges={(estimatedDeliveryCharges) =>
          updateOrderFields.mutate({ estimatedDeliveryCharges })
        }
        isSavingOrder={updateOrderFields.isPending}
        onStatusChanged={invalidateOrder}
      />

      {canViewPayments && (
        <PaymentCard
          order={order}
          data={paymentsQuery.data}
          isPending={paymentsQuery.isPending}
          canAdd={canAddPayment && order.orderStatus !== 'CANCELLED'}
          canReverse={canReversePayment}
          onChanged={invalidatePayments}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NotesPanel orderId={id} notes={notesQuery.data} isPending={notesQuery.isPending} />
        <ActivityPanel activity={activityQuery.data} isPending={activityQuery.isPending} />
      </div>
    </div>
  );
}

// Phase 11 §19 — a simple printable order view, not an accounting/invoice system.
// Hidden on screen (`.print-only`), shown (and everything else hidden) only when
// printing — see tailwind.css's `@media print` block.
function PrintableOrder({
  order,
  paid,
  remaining,
}: {
  order: OrderDetailData;
  paid: number | undefined;
  remaining: number | undefined;
}) {
  return (
    <div className="print-only">
      <h1 className="text-xl font-bold">Pashuseva</h1>
      <h2 className="text-lg">Invoice: {order.invoiceNumber ?? order.orderNumber}</h2>
      <p className="text-sm text-muted-foreground">
        Date: {new Date(order.orderDate).toLocaleDateString()}
      </p>

      <div className="mt-4">
        <p className="font-medium">{order.customer.name}</p>
        {order.customer.phones.map((p) => (
          <p key={p.phone}>{p.phone}</p>
        ))}
        {order.address && (
          <p>
            {order.address.addressLine}
            {order.address.landmark && `, ${order.address.landmark}`}, {order.address.city}
            {order.address.district && `, ${order.address.district}`}, {order.address.state}{' '}
            {order.address.pincode}
          </p>
        )}
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-1 text-left">Product</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Price</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-1">
                {item.productName}
                {packagingUnitLabel(item.unit) && ` (${packagingUnitLabel(item.unit)})`}
              </td>
              <td className="py-1 text-right">×{item.quantity}</td>
              <td className="py-1 text-right">₹{item.unitPrice.toLocaleString()}</td>
              <td className="py-1 text-right">₹{item.totalPrice.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 space-y-1 text-right">
        <p className="font-semibold">TOTAL: ₹{order.total.toLocaleString()}</p>
        {paid !== undefined && <p>PAID: ₹{paid.toLocaleString()}</p>}
        {remaining !== undefined && (
          <p className="font-semibold">BALANCE: ₹{remaining.toLocaleString()}</p>
        )}
      </div>
      <p className="mt-2">Delivery Status: {order.deliveryStatus.replace(/_/g, ' ')}</p>
      {order.articleNumber && <p>Article Number (Tracking No.): {order.articleNumber}</p>}
    </div>
  );
}

function AssignedEmployeeRow({
  order,
  employees,
  canEdit,
  onSave,
  isSaving,
}: {
  order: OrderDetailData;
  employees: EmployeeOption[] | undefined;
  canEdit: boolean;
  onSave: (employeeId: number) => void;
  isSaving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(order.assignedEmployee?.id.toString() ?? '');

  if (!editing) {
    return (
      <p className="flex items-center gap-2">
        Assigned Employee: {order.assignedEmployee?.name ?? 'Unassigned'}
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setValue(order.assignedEmployee?.id.toString() ?? '');
              setEditing(true);
            }}
            className="text-primary hover:underline"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </p>
    );
  }

  const employeeOptions = employees?.filter((e) => e.role === 'EMPLOYEE' && e.status === 'ACTIVE');

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="h-8 w-48">
          <SelectValue placeholder="Select employee" />
        </SelectTrigger>
        <SelectContent>
          {employeeOptions?.map((e) => (
            <SelectItem key={e.id} value={String(e.id)}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      <Button
        size="sm"
        disabled={!value || isSaving}
        onClick={() => {
          onSave(Number(value));
          setEditing(false);
        }}
      >
        Save
      </Button>
    </div>
  );
}

function DeliveryCard({
  order,
  tracking,
  isTrackingPending,
  canEdit,
  canOverrideStatus,
  onSaveExpectedDelivery,
  onSaveArticleNumber,
  onSaveEstimatedDeliveryCharges,
  isSavingOrder,
  onStatusChanged,
}: {
  order: OrderDetailData;
  tracking: TrackingRow[] | undefined;
  isTrackingPending: boolean;
  canEdit: boolean;
  canOverrideStatus: boolean;
  onSaveExpectedDelivery: (date: string) => void;
  onSaveArticleNumber: (value: string) => void;
  onSaveEstimatedDeliveryCharges: (value: string) => void;
  isSavingOrder: boolean;
  onStatusChanged: () => void;
}) {
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState(order.expectedDelivery?.slice(0, 10) ?? '');
  const [editingArticleNumber, setEditingArticleNumber] = useState(false);
  const [articleNumberValue, setArticleNumberValue] = useState(order.articleNumber ?? '');
  const [editingCharges, setEditingCharges] = useState(false);
  const [chargesValue, setChargesValue] = useState(
    order.estimatedDeliveryCharges?.toString() ?? ''
  );

  const currentIndex = DELIVERY_STEPS.indexOf(
    order.deliveryStatus as (typeof DELIVERY_STEPS)[number]
  );
  const nextStatus = DELIVERY_STEPS[currentIndex + 1];
  const latestTracking = tracking && tracking.length > 0 ? tracking[tracking.length - 1] : null;
  // Delivery status is manually selectable — any stage, any direction — so this is no
  // longer gated on "is there a next stage." Only a cancelled order blocks it.
  const canChangeStatus = canEdit && order.orderStatus !== 'CANCELLED';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Delivery</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{order.deliveryStatus.replace(/_/g, ' ')}</p>
            {latestTracking?.location && (
              <p className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {latestTracking.location}
              </p>
            )}
            {latestTracking && (
              <p className="text-xs text-muted-foreground">
                Last updated {new Date(latestTracking.createdAt).toLocaleString()}
                {latestTracking.updatedBy?.name && ` by ${latestTracking.updatedBy.name}`}
              </p>
            )}
          </div>
          {canChangeStatus && (
            <div className="flex items-center gap-2">
              {order.deliveryStatus === 'IN_TRANSIT' && (
                <AddLocationUpdateDialog orderId={order.id} onSuccess={onStatusChanged} />
              )}
              <ChangeDeliveryStatusDialog
                orderId={order.id}
                currentStatus={order.deliveryStatus}
                canOverrideStatus={canOverrideStatus}
                onSuccess={onStatusChanged}
              />
            </div>
          )}
        </div>

        <div className="border-t pt-3">
          {!editingDate ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              Expected Delivery:{' '}
              {order.expectedDelivery
                ? new Date(order.expectedDelivery).toLocaleDateString()
                : 'Not set'}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setDateValue(order.expectedDelivery?.slice(0, 10) ?? '');
                    setEditingDate(true);
                  }}
                  className="text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="h-8 w-40"
              />
              <Button size="sm" variant="ghost" onClick={() => setEditingDate(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!dateValue || isSavingOrder}
                onClick={() => {
                  onSaveExpectedDelivery(dateValue);
                  setEditingDate(false);
                }}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        <div className="border-t pt-3">
          {!editingArticleNumber ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              Article Number (Tracking No.): {order.articleNumber ?? 'Not set'}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setArticleNumberValue(order.articleNumber ?? '');
                    setEditingArticleNumber(true);
                  }}
                  className="text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={articleNumberValue}
                onChange={(e) => setArticleNumberValue(e.target.value)}
                placeholder="e.g. DTDC123456789"
                className="h-8 w-48"
              />
              <Button size="sm" variant="ghost" onClick={() => setEditingArticleNumber(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSavingOrder}
                onClick={() => {
                  onSaveArticleNumber(articleNumberValue);
                  setEditingArticleNumber(false);
                }}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        <div className="border-t pt-3">
          {!editingCharges ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              Estimated Delivery Charges:{' '}
              {order.estimatedDeliveryCharges != null
                ? `₹${order.estimatedDeliveryCharges.toLocaleString()}`
                : 'Not set'}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setChargesValue(order.estimatedDeliveryCharges?.toString() ?? '');
                    setEditingCharges(true);
                  }}
                  className="text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={chargesValue}
                onChange={(e) => setChargesValue(e.target.value)}
                placeholder="e.g. 180"
                className="h-8 w-32"
              />
              <Button size="sm" variant="ghost" onClick={() => setEditingCharges(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSavingOrder}
                onClick={() => {
                  onSaveEstimatedDeliveryCharges(chargesValue);
                  setEditingCharges(false);
                }}
              >
                Save
              </Button>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Reference only — not included in the order total.
          </p>
        </div>

        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Delivery Timeline
          </p>
          {isTrackingPending && <Skeleton className="h-16 w-full" />}
          {tracking && tracking.length === 0 && (
            <p className="text-sm text-muted-foreground">Not dispatched yet.</p>
          )}
          <div className="space-y-3">
            {tracking?.map((entry, index) => (
              <div key={entry.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </div>
                  {index < tracking.length - 1 && <div className="w-px flex-1 bg-border" />}
                </div>
                <div className="pb-3">
                  <p className="font-medium">{entry.status.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                  {entry.location && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {entry.location}
                    </p>
                  )}
                  {entry.receivedBy && (
                    <p className="text-xs text-muted-foreground">Received by: {entry.receivedBy}</p>
                  )}
                  {entry.note && <p className="text-xs italic text-muted-foreground">"{entry.note}"</p>}
                  {entry.updatedBy?.name && (
                    <p className="text-xs text-muted-foreground">Updated by {entry.updatedBy.name}</p>
                  )}
                </div>
              </div>
            ))}
            {nextStatus && (
              <div className="flex gap-3 opacity-50">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                  ○
                </div>
                <p>{nextStatus.replace(/_/g, ' ')}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const PAYMENT_METHOD_OPTIONS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'ONLINE', 'OTHER'] as const;
const PAYMENT_METHOD_LABEL: Record<(typeof PAYMENT_METHOD_OPTIONS)[number], string> = {
  CASH: 'CASH',
  UPI: 'UPI',
  BANK_TRANSFER: 'BANK TRANSFER',
  CARD: 'CARD',
  ONLINE: 'ONLINE PAYMENT',
  OTHER: 'OTHER',
};

// Phase 13 §1-6/§19-20 — replaces the old bare manual Payment Status dropdown with a
// real ledger: Payment Status/Paid/Remaining are all computed by the backend from
// SUM(payments), never set directly here. Includes the Invoice section (§8-10) since
// both live in the same "money" area of Order Details.
function PaymentCard({
  order,
  data,
  isPending,
  canAdd,
  canReverse,
  onChanged,
}: {
  order: OrderDetailData;
  data: PaymentsResponse | undefined;
  isPending: boolean;
  canAdd: boolean;
  canReverse: boolean;
  onChanged: () => void;
}) {
  const mostRecentMethod = data?.payments.length
    ? [...data.payments].reverse().find((p) => p.reversesPaymentId === null)?.method
    : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Payment</CardTitle>
        {canAdd && <AddPaymentDialog orderId={order.id} remaining={data?.remaining} onSuccess={onChanged} />}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isPending && <Skeleton className="h-16 w-full" />}
        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}
                </p>
                <p className="text-muted-foreground">
                  Paid ₹{data.paid.toLocaleString()} · Remaining ₹{data.remaining.toLocaleString()}
                </p>
                {(mostRecentMethod ?? order.paymentMethod) && (
                  <p className="text-xs text-muted-foreground">
                    Payment Method: {mostRecentMethod ?? order.paymentMethod}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Payment History
              </p>
              {data.payments.length === 0 && (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              )}
              <div className="space-y-2">
                {data.payments.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-3 rounded-md border p-2">
                    <div className="min-w-0">
                      <p className={p.amount < 0 ? 'text-destructive' : ''}>
                        {p.amount < 0 ? '-' : ''}₹{Math.abs(p.amount).toLocaleString()} · {p.method}
                        {p.reversesPaymentId && ' (reversal)'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.paymentDate).toLocaleDateString()}
                        {p.referenceNumber && ` · Ref: ${p.referenceNumber}`}
                      </p>
                      {p.notes && <p className="text-xs italic text-muted-foreground">"{p.notes}"</p>}
                      {p.createdBy?.name && (
                        <p className="text-xs text-muted-foreground">By {p.createdBy.name}</p>
                      )}
                    </div>
                    {canReverse && p.amount > 0 && !p.reversesPaymentId && (
                      <ReversePaymentDialog
                        orderId={order.id}
                        paymentId={p.id}
                        amount={p.amount}
                        alreadyReversed={data.payments.some((r) => r.reversesPaymentId === p.id)}
                        onSuccess={onChanged}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Invoice</p>
          <p>Invoice No.: {order.invoiceNumber ?? '—'}</p>
          <p className="text-muted-foreground">
            Invoice Date: {new Date(order.orderDate).toLocaleDateString()}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print Invoice
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddPaymentDialog({
  orderId,
  remaining,
  onSuccess,
}: {
  orderId: number;
  remaining: number | undefined;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof PAYMENT_METHOD_OPTIONS)[number]>('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Full Paid pays off exactly what's left; Partial is the only case that needs a
  // manually-entered amount.
  const amountNumber = paymentType === 'FULL' ? (remaining ?? 0) : Number(amount);

  const addPayment = useMutation({
    mutationFn: () =>
      apiFetch(`/orders/${orderId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amountNumber,
          method,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success('Payment recorded');
      onSuccess();
      setOpen(false);
      setPaymentType('FULL');
      setAmount('');
      setReferenceNumber('');
      setNotes('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to add payment'),
  });

  const exceedsRemaining = remaining !== undefined && amountNumber > remaining;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPaymentType('FULL');
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">+ Add Payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {remaining !== undefined && (
            <p className="text-muted-foreground">
              Remaining: <span className="font-medium">₹{remaining.toLocaleString()}</span>
            </p>
          )}
          <div>
            <label className="text-sm font-medium">Payment *</label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={paymentType === 'FULL' ? 'default' : 'outline'}
                onClick={() => setPaymentType('FULL')}
              >
                Full Paid
              </Button>
              <Button
                type="button"
                size="sm"
                variant={paymentType === 'PARTIAL' ? 'default' : 'outline'}
                onClick={() => setPaymentType('PARTIAL')}
              >
                Partial
              </Button>
            </div>
          </div>
          {paymentType === 'FULL' ? (
            <p className="text-muted-foreground">
              Amount: <span className="font-medium text-foreground">₹{amountNumber.toLocaleString()}</span>
            </p>
          ) : (
            <div>
              <label className="text-sm font-medium">Amount *</label>
              <Input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {exceedsRemaining && (
                <p className="mt-1 text-xs text-destructive">Cannot exceed the remaining balance.</p>
              )}
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Payment Method *</label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Reference Number</label>
            <Input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              (paymentType === 'PARTIAL' && !amount) ||
              amountNumber <= 0 ||
              exceedsRemaining ||
              addPayment.isPending
            }
            onClick={() => addPayment.mutate()}
          >
            {addPayment.isPending ? 'Saving…' : 'Save Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Correction, not silent edit (Phase 13 §14) — reversing creates a new negative ledger
// entry referencing the original rather than changing/deleting it.
function ReversePaymentDialog({
  orderId,
  paymentId,
  amount,
  alreadyReversed,
  onSuccess,
}: {
  orderId: number;
  paymentId: number;
  amount: number;
  alreadyReversed: boolean;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const reversePayment = useMutation({
    mutationFn: () =>
      apiFetch(`/orders/${orderId}/payments/${paymentId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      toast.success('Payment reversed');
      onSuccess();
      setOpen(false);
      setReason('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to reverse payment'),
  });

  if (alreadyReversed) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Reverse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse Payment</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This records a correction of ₹{amount.toLocaleString()} — the original entry stays
          in the payment history, it isn't deleted.
        </p>
        <Textarea
          placeholder="Reason for reversal"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!reason.trim() || reversePayment.isPending}
            onClick={() => reversePayment.mutate()}
          >
            {reversePayment.isPending ? 'Reversing…' : 'Confirm Reversal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_FIELD_CONFIG: Record<string, { locationLabel: string; locationRequired: boolean }> = {
  DISPATCHED: { locationLabel: 'Dispatch Location', locationRequired: true },
  IN_TRANSIT: { locationLabel: 'Current Location', locationRequired: true },
  DELIVERED: { locationLabel: 'Delivered At', locationRequired: false },
};

// A separate, lighter dialog from ChangeDeliveryStatusDialog — only used while already
// IN_TRANSIT, to log a new checkpoint (location/note) without touching the status label
// itself. Posts to the same endpoint with deliveryStatus held equal to the current one.
function AddLocationUpdateDialog({
  orderId,
  onSuccess,
}: {
  orderId: number;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');

  const addLocation = useMutation({
    mutationFn: () =>
      apiFetch(`/orders/${orderId}/delivery-status`, {
        method: 'PATCH',
        body: JSON.stringify({
          deliveryStatus: 'IN_TRANSIT',
          location,
          note: note || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success('Location update added');
      onSuccess();
      setOpen(false);
      setLocation('');
      setNote('');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to add location update'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add Location Update</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Location Update</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-sm font-medium">Current Location *</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Note</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!location.trim() || addLocation.isPending}
            onClick={() => addLocation.mutate()}
          >
            {addLocation.isPending ? 'Adding…' : 'Add Update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeDeliveryStatusDialog({
  orderId,
  currentStatus,
  canOverrideStatus,
  onSuccess,
}: {
  orderId: number;
  currentStatus: string;
  canOverrideStatus: boolean;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [receivedBy, setReceivedBy] = useState('');

  const config = STATUS_FIELD_CONFIG[status] ?? { locationLabel: 'Location', locationRequired: false };

  const updateStatus = useMutation({
    mutationFn: () =>
      apiFetch(`/orders/${orderId}/delivery-status`, {
        method: 'PATCH',
        body: JSON.stringify({
          deliveryStatus: status,
          location: location || undefined,
          note: note || undefined,
          receivedBy: status === 'DELIVERED' ? receivedBy || undefined : undefined,
        }),
      }),
    onSuccess: () => {
      toast.success('Delivery status updated');
      onSuccess();
      setOpen(false);
      setLocation('');
      setNote('');
      setReceivedBy('');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update delivery status'),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setStatus(currentStatus);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Change Status</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Current: <span className="font-medium">{currentStatus.replace(/_/g, ' ')}</span>
          </p>
          <div>
            <label className="text-sm font-medium">New Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_STEPS.filter(
                  (s) =>
                    canOverrideStatus || DELIVERY_STEPS.indexOf(s) >= DELIVERY_STEPS.indexOf(currentStatus as (typeof DELIVERY_STEPS)[number])
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {canOverrideStatus
                ? 'You can pick any stage, including going back, or re-selecting "In Transit" again to log a new location.'
                : 'You can move forward, or re-select "In Transit" again to log a new location — a Manager/Admin can move a status backward if needed.'}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">
              {config.locationLabel}
              {config.locationRequired && ' *'}
            </label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          {status === 'DELIVERED' && (
            <div>
              <label className="text-sm font-medium">Received By</label>
              <Input
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Note</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={(config.locationRequired && !location.trim()) || updateStatus.isPending}
            onClick={() => updateStatus.mutate()}
          >
            {updateStatus.isPending
              ? 'Updating…'
              : status === 'DELIVERED'
                ? 'Mark as Delivered'
                : 'Update Status'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditableProductOption {
  id: number;
  name: string;
  sku: string;
  price: number;
  unit: string | null;
  availableQty: number;
  active: boolean;
}

interface EditableLineItem {
  productId: number;
  name: string;
  sku: string;
  price: number;
  unit: string | null;
  quantity: number;
}

// Phase 11 §7/§9 — the line-item edit UI that's been an open item since Phase 6:
// server-side support (PATCH /orders/:id re-resolving current prices/stock) has
// existed all along, this dialog is the missing frontend half. Only reachable
// pre-dispatch (same canEditOrCancel gate as Cancel Order), matching the existing
// "no changes once fulfillment has started" rule.
function EditOrderItemsDialog({
  orderId,
  currentItems,
  onSuccess,
}: {
  orderId: number;
  currentItems: OrderItemRow[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<EditableLineItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch);

  const productsQuery = useQuery({
    queryKey: ['order-edit-product-search', debouncedProductSearch],
    queryFn: () =>
      apiFetch<{ data: EditableProductOption[] }>(
        `/products?search=${encodeURIComponent(debouncedProductSearch)}&active=true&pageSize=10`
      ),
    enabled: debouncedProductSearch.length > 1,
  });

  function resetFromCurrent() {
    setItems(
      currentItems
        .filter((i): i is OrderItemRow & { productId: number } => i.productId !== null)
        .map((i) => ({
          productId: i.productId,
          name: i.productName,
          sku: i.productSKU,
          price: i.unitPrice,
          unit: i.unit,
          quantity: i.quantity,
        }))
    );
  }

  function addProduct(product: EditableProductOption) {
    if (items.some((i) => i.productId === product.id)) {
      toast.error('That product is already on this order');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        unit: product.unit,
        quantity: 1,
      },
    ]);
    setProductSearch('');
  }

  function updateQuantity(productId: number, quantity: number) {
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)));
  }

  function removeItem(productId: number) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  const saveItems = useMutation({
    mutationFn: () =>
      apiFetch(`/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      }),
    onSuccess: () => {
      toast.success('Order items updated');
      onSuccess();
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update items'),
  });

  const canSave = items.length > 0 && items.every((i) => i.quantity > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) resetFromCurrent();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit Items
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Order Items</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search product…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {productsQuery.data && debouncedProductSearch.length > 1 && (
            <div className="divide-y rounded-md border">
              {productsQuery.data.data.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center justify-between gap-3 p-2 text-left text-sm hover:bg-accent"
                >
                  <span className="min-w-0 truncate">
                    {p.name} <span className="text-xs text-muted-foreground">SKU: {p.sku}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    ₹{p.price}
                    {packagingUnitLabel(p.unit) && ` / ${packagingUnitLabel(p.unit)}`} · Stock:{' '}
                    {p.availableQty}
                  </span>
                </button>
              ))}
              {productsQuery.data.data.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">No products found.</p>
              )}
            </div>
          )}

          {items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>₹{item.price.toLocaleString()}</TableCell>
                    <TableCell>₹{(item.price * item.quantity).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeItem(item.productId)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-xs text-muted-foreground">
            Prices and stock are re-checked against current product data when you save —
            not the prices shown here if they've since changed.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || saveItems.isPending} onClick={() => saveItems.mutate()}>
            {saveItems.isPending ? 'Saving…' : 'Save Items'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelOrderDialog({ orderId, onCancelled }: { orderId: number; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const cancelOrder = useMutation({
    mutationFn: () =>
      apiFetch(`/orders/${orderId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      toast.success('Order cancelled');
      onCancelled();
      setOpen(false);
      setReason('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to cancel order'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Cancel Order</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel order</DialogTitle>
        </DialogHeader>
        <Textarea
          placeholder="Reason for cancellation"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!reason.trim() || cancelOrder.isPending}
            onClick={() => cancelOrder.mutate()}
          >
            {cancelOrder.isPending ? 'Cancelling…' : 'Confirm Cancellation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotesPanel({
  orderId,
  notes,
  isPending,
}: {
  orderId: number;
  notes: NoteRow[] | undefined;
  isPending: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const addNote = useMutation({
    mutationFn: (note: string) =>
      apiFetch(`/orders/${orderId}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId, 'notes'] });
      queryClient.invalidateQueries({ queryKey: ['order', orderId, 'activity'] });
      setText('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to add note'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order Notes</CardTitle>
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
            Add
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
            <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>{' '}
            — {a.action}
            {a.oldValue && a.newValue && (
              <span className="text-muted-foreground">
                {' '}
                ({a.oldValue} → {a.newValue})
              </span>
            )}
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
