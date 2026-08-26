import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Search, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ErrorState from '@/components/ErrorState';
import CustomerPicker, { type CustomerOption } from '@/components/CustomerPicker';
import EmployeeMultiSelect from '@/components/EmployeeMultiSelect';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { packagingUnitLabel } from '@/lib/productUnits';

interface EmployeeOption {
  id: number;
  name: string | null;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  status: string;
}

interface ProductOption {
  id: number;
  name: string;
  sku: string;
  price: number;
  unit: string | null;
  availableQty: number;
  active: boolean;
}

interface LineItem {
  productId: number;
  name: string;
  sku: string;
  price: number;
  unit: string | null;
  availableQty: number;
  quantity: number;
}

// Passed via router navigation state by OrderDetail's "Duplicate Order" (Phase 11
// §18) — unlike Reorder (immediate create), this lands the user back on this page
// with everything prefilled but still editable, for review before submitting.
// Quantities come from the source order; price/stock are always re-resolved live
// below (never reused from the source order's snapshot), matching Reorder's own
// "always current prices" rule.
export interface DuplicateOrderState {
  customerId: number;
  items: { productId: number; quantity: number }[];
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  // Phase 18: only Admin/Manager decide who's assigned at creation time — an
  // Employee's own order simply has no employees assigned yet (surfaces to
  // Admin/Manager via the customer's assignment chain instead, same as before).
  const canAssignEmployees = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';

  // Two independent prefill sources (Phase 11): a customerId in the URL (Customer
  // Detail's "+ Create Order", §3) and/or router state from "Duplicate Order" (§18,
  // which also carries a customerId). Applied once on mount via the ref guard below —
  // after that, the user is free to change the customer/items normally.
  const duplicateState = (location.state as DuplicateOrderState | null) ?? null;
  const prefillCustomerIdParam = searchParams.get('customerId');
  const prefillCustomerId = duplicateState?.customerId ?? (prefillCustomerIdParam ? Number(prefillCustomerIdParam) : null);
  const prefillApplied = useRef(false);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  const [items, setItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch);

  const [discount, setDiscount] = useState(0);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<
    'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'ONLINE' | 'OTHER'
  >(
    'CASH'
  );
  // UI-only choice — Order.paymentStatus itself is always derived server-side from
  // the payment ledger (never set directly), same as adding a payment after creation.
  // This just decides what `amountPaid` gets submitted alongside the order.
  const [paymentStatusChoice, setPaymentStatusChoice] = useState<'UNPAID' | 'PARTIAL' | 'PAID'>(
    'UNPAID'
  );
  const [partialAmount, setPartialAmount] = useState('');
  const [notes, setNotes] = useState('');
  // Both optional, may not be known yet — courier reference number and an
  // informational-only shipping estimate that never affects the order total below.
  const [articleNumber, setArticleNumber] = useState('');
  const [estimatedDeliveryCharges, setEstimatedDeliveryCharges] = useState('');
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<number[]>([]);
  const defaultAssigneeApplied = useRef(false);

  const employeesQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<EmployeeOption[]>('/users'),
    enabled: canAssignEmployees,
  });
  const employeeOptions = (employeesQuery.data ?? []).filter(
    (e) => e.role === 'EMPLOYEE' && e.status === 'ACTIVE'
  );

  // Default selection is a one-time UI convenience (see PHASE18_TODO.md §2) — applied
  // once the employee list loads, never re-applied after that, so unselecting Jitender
  // Rajput or picking others sticks.
  useEffect(() => {
    if (defaultAssigneeApplied.current || !canAssignEmployees || !employeesQuery.data) return;
    defaultAssigneeApplied.current = true;
    const jitender = employeeOptions.find((e) => e.name?.trim().toLowerCase() === 'jitender rajput');
    if (jitender) setAssignedEmployeeIds([jitender.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeesQuery.data, canAssignEmployees]);

  const productsQuery = useQuery({
    queryKey: ['order-product-search', debouncedProductSearch],
    queryFn: () =>
      apiFetch<{ data: ProductOption[] }>(
        `/products?search=${encodeURIComponent(debouncedProductSearch)}&active=true&pageSize=10`
      ),
    enabled: debouncedProductSearch.length > 1,
  });

  useEffect(() => {
    if (prefillApplied.current) return;
    if (!prefillCustomerId && !duplicateState) return;
    prefillApplied.current = true;

    if (prefillCustomerId) {
      apiFetch<CustomerOption>(`/customers/${prefillCustomerId}`)
        .then(setSelectedCustomer)
        .catch(() => toast.error('Could not load that customer — pick one manually'));
    }

    if (duplicateState) {
      Promise.all(
        duplicateState.items.map((i) => apiFetch<ProductOption>(`/products/${i.productId}`))
      )
        .then((products) => {
          setItems(
            products.map((p, idx) => ({
              productId: p.id,
              name: p.name,
              sku: p.sku,
              price: p.price,
              unit: p.unit,
              availableQty: p.availableQty,
              quantity: duplicateState.items[idx].quantity,
            }))
          );
        })
        .catch(() => toast.error('Could not load one or more products for duplication'));
    }
  }, [prefillCustomerId, duplicateState]);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const total = subtotal - discount + deliveryCharge;

  const amountPaid =
    paymentStatusChoice === 'PAID'
      ? total
      : paymentStatusChoice === 'PARTIAL'
        ? Number(partialAmount) || 0
        : 0;
  const amountDue = Math.max(total - amountPaid, 0);
  const partialAmountValid =
    paymentStatusChoice !== 'PARTIAL' || (amountPaid > 0 && amountPaid <= total);

  function addProduct(product: ProductOption) {
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
        availableQty: product.availableQty,
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

  const createOrder = useMutation({
    mutationFn: () =>
      apiFetch<{ id: number; orderNumber: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId: selectedCustomer!.id,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          paymentMethod,
          discount,
          deliveryCharge,
          amountPaid,
          notes: notes || undefined,
          articleNumber: articleNumber || undefined,
          estimatedDeliveryCharges: estimatedDeliveryCharges || undefined,
          ...(canAssignEmployees && { assignedEmployeeIds }),
        }),
      }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      // A new order shifts dashboard/report totals — both are computed live from the
      // database, but the cached copies still need to be told to refetch rather than
      // keep showing pre-creation numbers.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Order created');
      navigate(`/orders/${order.orderNumber}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to create order'),
  });

  const canSubmit =
    selectedCustomer && items.length > 0 && items.every((i) => i.quantity > 0) && partialAmountValid;

  return (
    <div className="space-y-6">
      <Link
        to="/orders"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <h1 className="text-2xl font-semibold">Create New Order</h1>
      {duplicateState && (
        <p className="text-sm text-muted-foreground">
          Duplicated from a previous order — review the customer, products, and
          quantities below before creating.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerPicker value={selectedCustomer} onChange={setSelectedCustomer} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                    <TableCell>
                      {item.name}
                      {item.quantity > item.availableQty && (
                        <p className="text-xs text-destructive">
                          Only {item.availableQty} in stock
                        </p>
                      )}
                    </TableCell>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.productId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Article Number (Tracking No.)</label>
            <Input
              placeholder="Optional — add later if not known yet"
              value={articleNumber}
              onChange={(e) => setArticleNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Estimated Delivery Charges (₹)</label>
            <Input
              type="number"
              min={0}
              placeholder="Optional — reference only"
              value={estimatedDeliveryCharges}
              onChange={(e) => setEstimatedDeliveryCharges(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              For reference only — not included in the order total below.
            </p>
          </div>
        </CardContent>
      </Card>

      {canAssignEmployees && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assign to Employee(s)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Multiple employees can share this order. Defaults to Jitender Rajput — remove
              or add others as needed.
            </p>
            <EmployeeMultiSelect
              employees={employeeOptions}
              selectedIds={assignedEmployeeIds}
              onChange={setAssignedEmployeeIds}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Discount (₹)</label>
              <Input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Delivery Charge (₹)</label>
              <Input
                type="number"
                min={0}
                value={deliveryCharge}
                onChange={(e) => setDeliveryCharge(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal (estimated)</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-₹{discount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Delivery Charge</span>
              <span>₹{deliveryCharge.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total (estimated)</span>
              <span>₹{total.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Final pricing is calculated by the server from current product prices when the order
              is created.
            </p>
          </div>

          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Payment</h3>

            <div>
              <label className="text-sm font-medium">Payment Status</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(['UNPAID', 'PARTIAL', 'PAID'] as const).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={paymentStatusChoice === status ? 'default' : 'outline'}
                    onClick={() => setPaymentStatusChoice(status)}
                  >
                    {status === 'UNPAID' ? 'Unpaid' : status === 'PARTIAL' ? 'Partially Paid' : 'Paid'}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Payment Method</label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="ONLINE">Online Payment</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentStatusChoice === 'PARTIAL' && (
              <div>
                <label className="text-sm font-medium">Amount Paid (₹)</label>
                <Input
                  type="number"
                  min={0}
                  max={total}
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                />
                {!partialAmountValid && (
                  <p className="mt-1 text-xs text-destructive">
                    Enter an amount greater than ₹0 and no more than the total (₹
                    {total.toLocaleString()}).
                  </p>
                )}
              </div>
            )}

            {paymentStatusChoice !== 'UNPAID' && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Order Amount</p>
                  <p className="font-medium">₹{total.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount Due</p>
                  <p className="font-medium">₹{amountDue.toLocaleString()}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {createOrder.isError && (
            <ErrorState
              message={
                createOrder.error instanceof ApiError
                  ? createOrder.error.message
                  : 'Failed to create order.'
              }
            />
          )}

          <Button
            className="w-full"
            disabled={!canSubmit || createOrder.isPending}
            onClick={() => createOrder.mutate()}
          >
            {createOrder.isPending ? 'Creating…' : 'Create Order'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
