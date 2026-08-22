import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import { apiFetch } from '@/lib/api';
import { useCurrentUser, hasPermission } from '@/lib/auth';
import { packagingUnitLabel } from '@/lib/productUnits';
import { PARCEL_CONTRACT_ID, PARCEL_BILLER_ID } from '@/lib/parcelSettings';

interface DashboardSummary {
  customers: { total: number; newToday: number };
  orders: {
    total: number;
    today: number;
    pending: number;
    byStatus: Record<string, number>;
    byDeliveryStatus: Record<string, number>;
    todayDeliveryStatusCounts: Record<string, number>;
    paidOrders: number;
    unpaidOrCodOrders: number;
    partiallyPaidOrders: number;
  };
  sales: { allTime: number; today: number; thisWeek: number; thisMonth: number };
  outstanding: number;
  paymentsToday: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockProducts: { id: number; name: string; unit: string | null; availableQty: number }[];
  recentOrders: {
    id: number;
    orderNumber: string;
    total: number;
    orderStatus: string;
    deliveryStatus: string;
    orderDate: string;
    customerName: string;
  }[];
  recentCustomers: { id: number; name: string; createdAt: string }[];
  topProducts: { productId: number; name: string; unit: string | null; quantitySold: number }[];
}

const ORDER_STATUS_ORDER = ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'];
const DELIVERY_STATUS_ORDER = ['NOT_DISPATCHED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED'];
const DELIVERY_ICON: Record<string, string> = {
  NOT_DISPATCHED: '📦',
  DISPATCHED: '🚚',
  IN_TRANSIT: '🟠',
  DELIVERED: '🟢',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  const { data: currentUser } = useCurrentUser();
  const actions = [
    { to: '/customers?add=1', label: '+ Add Customer', permission: 'customer:create' },
    { to: '/orders/new', label: '+ Create Order', permission: 'order:create' },
    { to: '/products?add=1', label: '+ Add Product', permission: 'product:view' },
  ].filter((a) => hasPermission(currentUser, a.permission));

  if (actions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.to} variant="outline" asChild>
            <Link to={a.to}>{a.label}</Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function StatusList({
  title,
  counts,
  order,
  filterKey,
  icons,
}: {
  title: string;
  counts: Record<string, number>;
  order: string[];
  filterKey: 'orderStatus' | 'deliveryStatus';
  icons?: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {order.map((status) => (
          <Link
            key={status}
            to={`/orders?${filterKey}=${status}`}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <span>
              {icons?.[status] && `${icons[status]} `}
              {status.replace(/_/g, ' ')}
            </span>
            <span className="font-medium">{counts[status] ?? 0}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function LowStockCard({
  icon,
  title,
  count,
  filterValue,
  products,
}: {
  icon: string;
  title: string;
  count: number;
  filterValue: 'low' | 'out';
  products?: { id: number; name: string; unit: string | null; availableQty: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {icon} {title} — {count} products
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {products ? (
          <>
            {products.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No low-stock products right now — everything is above its minimum.
              </p>
            )}
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <Link to={`/products/${p.id}`} className="min-w-0 truncate hover:underline">
                  {p.name}
                </Link>
                <span className="shrink-0 text-muted-foreground">
                  {p.availableQty} {packagingUnitLabel(p.unit) ?? ''}
                </span>
              </div>
            ))}
          </>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is out of stock right now.</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {count} product{count === 1 ? ' is' : 's are'} out of stock.
          </p>
        )}
        <Button variant="outline" size="sm" asChild className="mt-1">
          <Link to={`/products?stock=${filterValue}`}>View Products →</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ParcelBookingCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Parcel Booking Details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Contract ID</p>
          <p className="text-lg font-semibold">{PARCEL_CONTRACT_ID}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Biller ID</p>
          <p className="text-lg font-semibold">{PARCEL_BILLER_ID}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminManagerDashboard({ summary }: { summary: DashboardSummary }) {
  const hasOrders = summary.orders.total > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Total Sales" value={`₹${summary.sales.allTime.toLocaleString()}`} />
        <StatCard
          title="Total Orders"
          value={summary.orders.total.toLocaleString()}
          hint={`+${summary.orders.today} today`}
        />
        <StatCard title="Paid Orders" value={String(summary.orders.paidOrders)} />
        <StatCard title="Unpaid / COD Orders" value={String(summary.orders.unpaidOrCodOrders)} />
        <StatCard title="Outstanding Amount" value={`₹${summary.outstanding.toLocaleString()}`} />
        <StatCard
          title="Total Customers"
          value={summary.customers.total.toLocaleString()}
          hint={`+${summary.customers.newToday} today`}
        />
        <StatCard title="Total Products" value={summary.totalProducts.toLocaleString()} />
        <StatCard title="Low Stock Products" value={String(summary.lowStockCount)} />
      </div>

      <ParcelBookingCard />

      {!hasOrders ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No orders yet. Once orders start coming in, you'll see today's activity, sales
            totals, and order/delivery breakdowns here.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Today</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <div>
                <p className="text-muted-foreground">New Customers</p>
                <p className="text-lg font-semibold">{summary.customers.newToday}</p>
              </div>
              <div>
                <p className="text-muted-foreground">New Orders</p>
                <p className="text-lg font-semibold">{summary.orders.today}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Dispatched</p>
                <p className="text-lg font-semibold">
                  {summary.orders.todayDeliveryStatusCounts.DISPATCHED ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">In Transit</p>
                <p className="text-lg font-semibold">
                  {summary.orders.todayDeliveryStatusCounts.IN_TRANSIT ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Delivered</p>
                <p className="text-lg font-semibold">
                  {summary.orders.todayDeliveryStatusCounts.DELIVERED ?? 0}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sales Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
              <div>
                <p className="text-muted-foreground">Today</p>
                <p className="text-lg font-semibold">₹{summary.sales.today.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">This Week</p>
                <p className="text-lg font-semibold">₹{summary.sales.thisWeek.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">This Month</p>
                <p className="text-lg font-semibold">₹{summary.sales.thisMonth.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Outstanding</p>
                <p className="text-lg font-semibold">₹{summary.outstanding.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Today's Payments</p>
                <p className="text-lg font-semibold">₹{summary.paymentsToday.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <StatusList
              title="Orders"
              counts={summary.orders.byStatus}
              order={ORDER_STATUS_ORDER}
              filterKey="orderStatus"
            />
            <StatusList
              title="Delivery"
              counts={summary.orders.byDeliveryStatus}
              order={DELIVERY_STATUS_ORDER}
              filterKey="deliveryStatus"
              icons={DELIVERY_ICON}
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LowStockCard
          icon="⚠️"
          title="Low Stock"
          count={summary.lowStockCount}
          filterValue="low"
          products={summary.lowStockProducts}
        />
        <LowStockCard
          icon="🔴"
          title="Out of Stock"
          count={summary.outOfStockCount}
          filterValue="out"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.recentOrders.map((o) => (
            <Link
              key={o.id}
              to={`/orders/${o.orderNumber}`}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span className="min-w-0 truncate">
                {o.orderNumber} · {o.customerName}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span>₹{o.total.toLocaleString()}</span>
                <span className="text-muted-foreground">{o.deliveryStatus.replace(/_/g, ' ')}</span>
              </span>
            </Link>
          ))}
          {summary.recentOrders.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No orders yet. Orders will appear here when customers place them.
            </p>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/orders">View All Orders →</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Customers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.recentCustomers.map((c) => (
              <Link
                key={c.id}
                to={`/customers/${c.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
            {summary.recentCustomers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No customers yet. New customers will show up here as they're added.
              </p>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/customers">View All Customers →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.topProducts.map((p, i) => (
              <Link
                key={p.productId}
                to={`/products/${p.productId}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="min-w-0 truncate">
                  {i + 1}. {p.name}
                </span>
                <span className="shrink-0 text-muted-foreground">{p.quantitySold} sold</span>
              </Link>
            ))}
            {summary.topProducts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No sales yet. Best sellers will show up here once orders come in.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmployeeDashboard({ summary }: { summary: DashboardSummary }) {
  if (summary.customers.total === 0 && summary.orders.total === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Nothing assigned to you yet. Once a manager assigns you customers or orders,
          they'll show up here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="My Customers" value={String(summary.customers.total)} />
        <StatCard title="My Orders" value={String(summary.orders.total)} />
        <StatCard
          title="Orders In Transit"
          value={String(summary.orders.byDeliveryStatus.IN_TRANSIT ?? 0)}
        />
        <StatCard
          title="Orders Delivered"
          value={String(summary.orders.byDeliveryStatus.DELIVERED ?? 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Customers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.recentCustomers.map((c) => (
            <Link
              key={c.id}
              to={`/customers/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span className="min-w-0 truncate">{c.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {new Date(c.createdAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
          {summary.recentCustomers.length === 0 && (
            <p className="text-sm text-muted-foreground">No assigned customers yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
      <Skeleton className="h-40 w-full sm:col-span-2 lg:col-span-4" />
      <Skeleton className="h-64 w-full sm:col-span-2 lg:col-span-4" />
    </div>
  );
}

export default function Home() {
  const { data: currentUser } = useCurrentUser();
  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiFetch<DashboardSummary>('/dashboard/summary'),
  });

  const isEmployee = currentUser?.role === 'EMPLOYEE';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            {greeting()}, {currentUser?.name ?? currentUser?.email} 👋
          </h1>
          <p className="text-sm text-muted-foreground">Here's what's happening today.</p>
        </div>
        {summaryQuery.dataUpdatedAt > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Last updated: {new Date(summaryQuery.dataUpdatedAt).toLocaleTimeString()}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => summaryQuery.refetch()}
              disabled={summaryQuery.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${summaryQuery.isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}
      </div>

      <QuickActions />

      {summaryQuery.isPending && <DashboardSkeleton />}
      {summaryQuery.isError && (
        <ErrorState message="Could not load dashboard." onRetry={() => summaryQuery.refetch()} />
      )}
      {summaryQuery.data &&
        (isEmployee ? (
          <EmployeeDashboard summary={summaryQuery.data} />
        ) : (
          <AdminManagerDashboard summary={summaryQuery.data} />
        ))}
    </div>
  );
}
