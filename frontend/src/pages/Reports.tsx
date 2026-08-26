import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import Sparkline from '@/components/Sparkline';
import { apiFetch } from '@/lib/api';
import { exportToCsv } from '@/lib/exportCsv';
import { useCurrentUser } from '@/lib/auth';
import { packagingUnitLabel } from '@/lib/productUnits';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
] as const;

const TABS = ['Sales', 'Orders', 'Customers', 'Products', 'Payments'] as const;
type Tab = (typeof TABS)[number];

function RangePicker({
  range,
  setRange,
  from,
  setFrom,
  to,
  setTo,
}: {
  range: string;
  setRange: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={range} onValueChange={setRange}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {range === 'custom' && (
        <>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: string; href?: string }) {
  const card = (
    <Card className={href ? 'transition-colors hover:bg-accent' : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
  return href ? <Link to={href}>{card}</Link> : card;
}

interface SalesReportData {
  totalOrders: number;
  totalSales: number;
  averageOrder: number;
  dailyBreakdown: { date: string; total: number }[];
  orders: { id: number; orderNumber: string; customerName: string; total: number; orderDate: string }[];
}

function SalesReportTab() {
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = useQuery({
    queryKey: ['reports', 'sales', { range, from, to }],
    queryFn: () => {
      const params = new URLSearchParams({ range });
      if (range === 'custom') {
        if (from) params.set('from', from);
        if (to) params.set('to', to);
      }
      return apiFetch<SalesReportData>(`/reports/sales?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker range={range} setRange={setRange} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        <Button
          variant="outline"
          disabled={!query.data || query.data.orders.length === 0}
          onClick={() =>
            query.data &&
            exportToCsv(
              'sales-report',
              query.data.orders.map((o) => ({
                Order: o.orderNumber,
                Customer: o.customerName,
                Amount: o.total,
                Date: new Date(o.orderDate).toLocaleDateString(),
              }))
            )
          }
        >
          Export CSV
        </Button>
      </div>

      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && <ErrorState message="Could not load sales report." onRetry={() => query.refetch()} />}

      {query.data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Orders" value={String(query.data.totalOrders)} />
            <StatCard label="Total Sales" value={`₹${query.data.totalSales.toLocaleString()}`} />
            <StatCard label="Average Order" value={`₹${Math.round(query.data.averageOrder).toLocaleString()}`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sales Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline data={query.data.dailyBreakdown} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link to={`/orders/${o.orderNumber}`} className="hover:underline">
                          {o.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{o.customerName}</TableCell>
                      <TableCell>₹{o.total.toLocaleString()}</TableCell>
                      <TableCell>{new Date(o.orderDate).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                  {query.data.orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No orders in this range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

interface OrdersReportData {
  totalOrders: number;
  byStatus: Record<string, number>;
  byDeliveryStatus: Record<string, number>;
}

interface EmployeeOption {
  id: number;
  name: string | null;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
}

function OrdersReportTab() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('all');
  const [employeeId, setEmployeeId] = useState('all');

  const employeesQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<EmployeeOption[]>('/users'),
    enabled: isAdmin,
  });

  const query = useQuery({
    queryKey: ['reports', 'orders', { range, from, to, status, employeeId }],
    queryFn: () => {
      const params = new URLSearchParams({ range });
      if (range === 'custom') {
        if (from) params.set('from', from);
        if (to) params.set('to', to);
      }
      if (status !== 'all') params.set('status', status);
      if (isAdmin && employeeId !== 'all') params.set('employeeId', employeeId);
      return apiFetch<OrdersReportData>(`/reports/orders?${params.toString()}`);
    },
  });

  const employees = employeesQuery.data?.filter((u) => u.role === 'EMPLOYEE') ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <RangePicker range={range} setRange={setRange} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="CONFIRMED">Confirmed</SelectItem>
            <SelectItem value="PROCESSING">Processing</SelectItem>
            <SelectItem value="OUT_FOR_DELIVERY">Out for Delivery</SelectItem>
            <SelectItem value="DELIVERED">Delivered</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Employee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && <ErrorState message="Could not load orders report." onRetry={() => query.refetch()} />}

      {query.data && (
        <>
          <StatCard label="Total Orders" value={String(query.data.totalOrders)} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Order Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(query.data.byStatus).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Delivery Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(query.data.byDeliveryStatus).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k.replace(/_/g, ' ')}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

interface CustomersReportData {
  totalCustomers: number;
  newCustomers: number;
  activeCustomers: number;
  topCustomers: { customerId: number; name: string; totalSpend: number }[];
}

function CustomersReportTab() {
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = useQuery({
    queryKey: ['reports', 'customers', { range, from, to }],
    queryFn: () => {
      const params = new URLSearchParams({ range });
      if (range === 'custom') {
        if (from) params.set('from', from);
        if (to) params.set('to', to);
      }
      return apiFetch<CustomersReportData>(`/reports/customers?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker range={range} setRange={setRange} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        <Button
          variant="outline"
          disabled={!query.data || query.data.topCustomers.length === 0}
          onClick={() =>
            query.data &&
            exportToCsv(
              'customers-report',
              query.data.topCustomers.map((c) => ({ Customer: c.name, 'Total Spend': c.totalSpend }))
            )
          }
        >
          Export CSV
        </Button>
      </div>

      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && <ErrorState message="Could not load customer report." onRetry={() => query.refetch()} />}

      {query.data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Customers" value={String(query.data.totalCustomers)} />
            <StatCard label="New Customers" value={String(query.data.newCustomers)} />
            <StatCard label="Active Customers" value={String(query.data.activeCustomers)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Customers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {query.data.topCustomers.map((c) => (
                <div key={c.customerId} className="flex justify-between gap-3 text-sm">
                  <Link to={`/customers/${c.customerId}`} className="min-w-0 truncate hover:underline">
                    {c.name}
                  </Link>
                  <span className="shrink-0 font-medium">₹{c.totalSpend.toLocaleString()}</span>
                </div>
              ))}
              {query.data.topCustomers.length === 0 && (
                <p className="text-sm text-muted-foreground">No orders in this range yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

interface ProductsReportData {
  totalProducts: number;
  activeProducts: number;
  lowStock: number;
  outOfStock: number;
  stockValue: number;
  bestSelling: { productId: number; name: string; unit: string | null; quantitySold: number }[];
}

function ProductsReportTab() {
  const query = useQuery({
    queryKey: ['reports', 'products'],
    queryFn: () => apiFetch<ProductsReportData>('/reports/products'),
  });

  return (
    <div className="space-y-4">
      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && <ErrorState message="Could not load product report." onRetry={() => query.refetch()} />}

      {query.data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total Products" value={String(query.data.totalProducts)} />
            <StatCard label="Active Products" value={String(query.data.activeProducts)} />
            <StatCard label="Low Stock" value={String(query.data.lowStock)} href="/products?stock=low" />
            <StatCard label="Out of Stock" value={String(query.data.outOfStock)} href="/products?stock=out" />
            <StatCard label="Stock Value" value={`₹${query.data.stockValue.toLocaleString()}`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Best Selling Products</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {query.data.bestSelling.map((p, i) => (
                <div key={p.productId} className="flex justify-between gap-3 text-sm">
                  <Link to={`/products/${p.productId}`} className="min-w-0 truncate hover:underline">
                    {i + 1}. {p.name}
                  </Link>
                  <span className="shrink-0 text-muted-foreground">
                    {p.quantitySold} sold
                    {packagingUnitLabel(p.unit) ? ` (${packagingUnitLabel(p.unit)})` : ''}
                  </span>
                </div>
              ))}
              {query.data.bestSelling.length === 0 && (
                <p className="text-sm text-muted-foreground">No sales yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

interface PaymentsReportData {
  totalCollected: number;
  byMethod: Record<string, number>;
  payments: {
    id: number;
    amount: number;
    method: string;
    referenceNumber: string | null;
    createdAt: string;
    orderNumber: string;
    customerName: string;
    createdByName: string | null;
  }[];
}

function PaymentsReportTab() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState('all');
  const [employeeId, setEmployeeId] = useState('all');

  const employeesQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<EmployeeOption[]>('/users'),
    enabled: isAdmin,
  });

  const query = useQuery({
    queryKey: ['reports', 'payments', { range, from, to, method, employeeId }],
    queryFn: () => {
      const params = new URLSearchParams({ range });
      if (range === 'custom') {
        if (from) params.set('from', from);
        if (to) params.set('to', to);
      }
      if (method !== 'all') params.set('method', method);
      if (isAdmin && employeeId !== 'all') params.set('employeeId', employeeId);
      return apiFetch<PaymentsReportData>(`/reports/payments?${params.toString()}`);
    },
  });

  const employees = employeesQuery.data?.filter((u) => u.role === 'EMPLOYEE') ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <RangePicker range={range} setRange={setRange} from={from} setFrom={setFrom} to={to} setTo={setTo} />
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
              <SelectItem value="CARD">Card</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button
          variant="outline"
          disabled={!query.data || query.data.payments.length === 0}
          onClick={() =>
            query.data &&
            exportToCsv(
              'payments-report',
              query.data.payments.map((p) => ({
                Order: p.orderNumber,
                Customer: p.customerName,
                Amount: p.amount,
                Method: p.method,
                Reference: p.referenceNumber ?? '',
                Date: new Date(p.createdAt).toLocaleDateString(),
                'Recorded By': p.createdByName ?? '',
              }))
            )
          }
        >
          Export CSV
        </Button>
      </div>

      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && <ErrorState message="Could not load payments report." onRetry={() => query.refetch()} />}

      {query.data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Total Collected" value={`₹${query.data.totalCollected.toLocaleString()}`} />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">By Method</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(query.data.byMethod).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k.replace(/_/g, ' ')}</span>
                    <span className="font-medium">₹{v.toLocaleString()}</span>
                  </div>
                ))}
                {Object.keys(query.data.byMethod).length === 0 && (
                  <p className="text-muted-foreground">No payments in this range.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link to={`/orders/${p.orderNumber}`} className="hover:underline">
                          {p.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{p.customerName}</TableCell>
                      <TableCell className={p.amount < 0 ? 'text-destructive' : ''}>
                        ₹{p.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>{p.method.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                  {query.data.payments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No payments in this range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>('Sales');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Sales' && <SalesReportTab />}
      {tab === 'Orders' && <OrdersReportTab />}
      {tab === 'Customers' && <CustomersReportTab />}
      {tab === 'Products' && <ProductsReportTab />}
      {tab === 'Payments' && <PaymentsReportTab />}
    </div>
  );
}
