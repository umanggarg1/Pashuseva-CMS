import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { apiFetch } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

interface OrderListItem {
  id: number;
  orderNumber: string;
  total: number;
  orderStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
  orderDate: string;
  articleNumber: string | null;
  customer: { id: number; name: string; phones: { phone: string }[] };
}

interface OrderListResponse {
  data: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'orderDate:desc', label: 'Newest first' },
  { value: 'orderDate:asc', label: 'Oldest first' },
  { value: 'total:desc', label: 'Amount: high to low' },
  { value: 'total:asc', label: 'Amount: low to high' },
] as const;

function StatusBadge({
  value,
  tone,
}: {
  value: string;
  tone: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const toneClass = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-primary/10 text-primary',
    warning: 'text-amber-600 bg-amber-50',
    destructive: 'text-destructive bg-destructive/10',
  }[tone];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function orderStatusTone(status: string) {
  if (status === 'DELIVERED') return 'success' as const;
  if (status === 'CANCELLED') return 'destructive' as const;
  if (status === 'OUT_FOR_DELIVERY') return 'warning' as const;
  return 'default' as const;
}

// Phase 13: PENDING/PARTIAL/PAID/REFUNDED are the stored enum values (unchanged, now
// computed from the payment ledger instead of set manually) — displayed with the
// friendlier labels used everywhere else payment status shows up.
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Unpaid',
  PARTIAL: 'Partially Paid',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

function paymentStatusTone(status: string) {
  if (status === 'PAID') return 'success' as const;
  if (status === 'REFUNDED') return 'destructive' as const;
  return 'warning' as const;
}

function deliveryStatusTone(status: string) {
  if (status === 'DELIVERED') return 'success' as const;
  if (status === 'NOT_DISPATCHED') return 'default' as const;
  if (status === 'RETURNED' || status === 'LOST' || status === 'DAMAGED') {
    return 'destructive' as const;
  }
  return 'warning' as const;
}

export default function Orders() {
  // A dashboard link like /orders?deliveryStatus=IN_TRANSIT should land pre-filtered —
  // read the initial filter values from the URL once, on mount (Phase 9 §4-5).
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [orderStatus, setOrderStatus] = useState(searchParams.get('orderStatus') ?? 'all');
  const [paymentStatus, setPaymentStatus] = useState(searchParams.get('paymentStatus') ?? 'all');
  const [deliveryStatus, setDeliveryStatus] = useState(searchParams.get('deliveryStatus') ?? 'all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('orderDate:desc');
  const [page, setPage] = useState(1);
  // Customer Detail's "View All Orders" link (Phase 11 §1) — a customerId in the URL
  // filters this list without any dedicated UI control for it.
  const customerId = searchParams.get('customerId');

  const customerQuery = useQuery({
    queryKey: ['customer-name', customerId],
    queryFn: () => apiFetch<{ id: number; name: string }>(`/customers/${customerId}`),
    enabled: !!customerId,
  });

  const query = useQuery({
    queryKey: [
      'orders',
      { search: debouncedSearch, orderStatus, paymentStatus, deliveryStatus, dateFrom, dateTo, sort, page, customerId },
    ],
    queryFn: () => {
      const [sortBy, sortDir] = sort.split(':');
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (orderStatus !== 'all') params.set('orderStatus', orderStatus);
      if (paymentStatus !== 'all') params.set('paymentStatus', paymentStatus);
      if (deliveryStatus !== 'all') params.set('deliveryStatus', deliveryStatus);
      if (customerId) params.set('customerId', customerId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      // End-of-day, not midnight — a bare date string parses as 00:00:00, which would
      // exclude every order placed later that same day from an inclusive "to" filter.
      if (dateTo) params.set('dateTo', `${dateTo}T23:59:59.999`);
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      return apiFetch<OrderListResponse>(`/orders?${params.toString()}`);
    },
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        action={
          <Button asChild>
            <Link to="/orders/new">+ Create Order</Link>
          </Button>
        }
      />

      {customerId && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Filtered to customer: <span className="font-medium">{customerQuery.data?.name ?? '…'}</span>
          <Link to="/orders" className="text-primary hover:underline">
            Clear
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search order, customer, phone, SKU…"
          value={search}
          onChange={(e) => resetPage(setSearch)(e.target.value)}
          className="max-w-xs"
        />
        <Select value={orderStatus} onValueChange={resetPage(setOrderStatus)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Order Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All order statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="CONFIRMED">Confirmed</SelectItem>
            <SelectItem value="PROCESSING">Processing</SelectItem>
            <SelectItem value="OUT_FOR_DELIVERY">Out for Delivery</SelectItem>
            <SelectItem value="DELIVERED">Delivered</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentStatus} onValueChange={resetPage(setPaymentStatus)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="PENDING">Unpaid</SelectItem>
            <SelectItem value="PARTIAL">Partially Paid</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="REFUNDED">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deliveryStatus} onValueChange={resetPage(setDeliveryStatus)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Delivery" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All delivery</SelectItem>
            <SelectItem value="NOT_DISPATCHED">Not Dispatched</SelectItem>
            <SelectItem value="DISPATCHED">Dispatched</SelectItem>
            <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
            <SelectItem value="OUT_FOR_DELIVERY">Out for Delivery</SelectItem>
            <SelectItem value="DELIVERED">Delivered</SelectItem>
            <SelectItem value="RETURN_PENDING">Return Pending</SelectItem>
            <SelectItem value="RETURN_IN_TRANSIT">Return In Transit</SelectItem>
            <SelectItem value="RETURNED">Returned</SelectItem>
            <SelectItem value="LOST">Lost</SelectItem>
            <SelectItem value="DAMAGED">Damaged</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => resetPage(setDateFrom)(e.target.value)}
            max={dateTo || undefined}
            className="w-40"
            aria-label="From date"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => resetPage(setDateTo)(e.target.value)}
            min={dateFrom || undefined}
            className="w-40"
            aria-label="To date"
          />
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetPage(setDateFrom)('');
                setDateTo('');
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && (
        <ErrorState message="Could not load orders." onRetry={() => query.refetch()} />
      )}

      {query.data && (
        <>
          {/* Desktop table */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Article Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Delivery</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    <Link to={`/orders/${order.orderNumber}`} className="hover:underline">
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.articleNumber ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{order.customer.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.orderDate).toLocaleDateString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>₹{order.total.toLocaleString()}</TableCell>
                  <TableCell>
                    <StatusBadge
                      value={order.orderStatus}
                      tone={orderStatusTone(order.orderStatus)}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      value={PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}
                      tone={paymentStatusTone(order.paymentStatus)}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      value={order.deliveryStatus}
                      tone={deliveryStatusTone(order.deliveryStatus)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {query.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState message="No orders found." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Mobile cards — don't force a wide desktop table onto small screens (phases.md §40) */}
          <div className="space-y-3 md:hidden">
            {query.data.data.map((order) => (
              <Link
                key={order.id}
                to={`/orders/${order.orderNumber}`}
                className="block rounded-lg border p-4 hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{order.orderNumber}</span>
                  <span className="font-medium">₹{order.total.toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {order.customer.name} ·{' '}
                  <span className="text-xs">{new Date(order.orderDate).toLocaleDateString()}</span>
                </p>
                {order.customer.phones[0] && (
                  <p className="text-sm text-muted-foreground">
                    📞 {order.customer.phones[0].phone}
                  </p>
                )}
                {order.articleNumber && (
                  <p className="text-sm text-muted-foreground">
                    Article No: {order.articleNumber}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge
                    value={order.orderStatus}
                    tone={orderStatusTone(order.orderStatus)}
                  />
                  <StatusBadge
                    value={order.deliveryStatus}
                    tone={deliveryStatusTone(order.deliveryStatus)}
                  />
                </div>
              </Link>
            ))}
            {query.data.data.length === 0 && <EmptyState message="No orders found." />}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {query.data.page} of {totalPages} · {query.data.total} orders
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
