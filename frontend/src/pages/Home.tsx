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

// Phase 20 Step 5C: split from one DashboardSummary into essential (first paint —
// counts, status breakdowns, recent activity) and analytics (heavier, secondary —
// sales aggregation, top products, low/out-of-stock), fetched as two separate
// requests instead of one ~19-22-query one. See dashboard.service.ts and
// PHASE19_TODO.md's... — PHASE20_TODO.md's Step 5C for why.
interface DashboardEssential {
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
  totalProducts: number;
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
}

interface DashboardAnalytics {
  sales: { allTime: number; today: number; thisWeek: number; thisMonth: number };
  outstanding: number;
  paymentsToday: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockProducts: { id: number; name: string; unit: string | null; availableQty: number }[];
  topProducts: { productId: number; name: string; unit: string | null; quantitySold: number }[];
}

const ORDER_STATUS_ORDER = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];
const DELIVERY_STATUS_ORDER = [
  'NOT_DISPATCHED',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURN_PENDING',
  'RETURN_IN_TRANSIT',
  'RETURNED',
  'LOST',
  'DAMAGED',
];
const DELIVERY_ICON: Record<string, string> = {
  NOT_DISPATCHED: '📦',
  DISPATCHED: '🚚',
  IN_TRANSIT: '🟠',
  OUT_FOR_DELIVERY: '🛵',
  DELIVERED: '🟢',
  RETURN_PENDING: '↩️',
  RETURN_IN_TRANSIT: '🔄',
  RETURNED: '📪',
  LOST: '❓',
  DAMAGED: '⚠️',
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

function StatCardSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-20" />
      </CardContent>
    </Card>
  );
}

// Phase 20 Step 5C: essential is always present by the time this renders (Home
// only mounts it once summaryQuery has data); analytics is undefined until its
// own, separately-fetched query resolves — every analytics-dependent section
// below renders a skeleton in that gap rather than waiting to render anything.
function AdminManagerDashboard({
  essential,
  analytics,
}: {
  essential: DashboardEssential;
  analytics: DashboardAnalytics | undefined;
}) {
  const hasOrders = essential.orders.total > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {analytics ? (
          <StatCard title="Total Sales" value={`₹${analytics.sales.allTime.toLocaleString()}`} />
        ) : (
          <StatCardSkeleton title="Total Sales" />
        )}
        <StatCard
          title="Total Orders"
          value={essential.orders.total.toLocaleString()}
          hint={`+${essential.orders.today} today`}
        />
        <StatCard title="Paid Orders" value={String(essential.orders.paidOrders)} />
        <StatCard title="Unpaid / COD Orders" value={String(essential.orders.unpaidOrCodOrders)} />
        {analytics ? (
          <StatCard title="Outstanding Amount" value={`₹${analytics.outstanding.toLocaleString()}`} />
        ) : (
          <StatCardSkeleton title="Outstanding Amount" />
        )}
        <StatCard
          title="Total Customers"
          value={essential.customers.total.toLocaleString()}
          hint={`+${essential.customers.newToday} today`}
        />
        <StatCard title="Total Products" value={essential.totalProducts.toLocaleString()} />
        {analytics ? (
          <StatCard title="Low Stock Products" value={String(analytics.lowStockCount)} />
        ) : (
          <StatCardSkeleton title="Low Stock Products" />
        )}
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
                <p className="text-lg font-semibold">{essential.customers.newToday}</p>
              </div>
              <div>
                <p className="text-muted-foreground">New Orders</p>
                <p className="text-lg font-semibold">{essential.orders.today}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Dispatched</p>
                <p className="text-lg font-semibold">
                  {essential.orders.todayDeliveryStatusCounts.DISPATCHED ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">In Transit</p>
                <p className="text-lg font-semibold">
                  {essential.orders.todayDeliveryStatusCounts.IN_TRANSIT ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Delivered</p>
                <p className="text-lg font-semibold">
                  {essential.orders.todayDeliveryStatusCounts.DELIVERED ?? 0}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sales Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics ? (
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
                  <div>
                    <p className="text-muted-foreground">Today</p>
                    <p className="text-lg font-semibold">₹{analytics.sales.today.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">This Week</p>
                    <p className="text-lg font-semibold">₹{analytics.sales.thisWeek.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">This Month</p>
                    <p className="text-lg font-semibold">₹{analytics.sales.thisMonth.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Outstanding</p>
                    <p className="text-lg font-semibold">₹{analytics.outstanding.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Today's Payments</p>
                    <p className="text-lg font-semibold">₹{analytics.paymentsToday.toLocaleString()}</p>
                  </div>
                </div>
              ) : (
                <Skeleton className="h-12 w-full" />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <StatusList
              title="Orders"
              counts={essential.orders.byStatus}
              order={ORDER_STATUS_ORDER}
              filterKey="orderStatus"
            />
            <StatusList
              title="Delivery"
              counts={essential.orders.byDeliveryStatus}
              order={DELIVERY_STATUS_ORDER}
              filterKey="deliveryStatus"
              icons={DELIVERY_ICON}
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {analytics ? (
          <>
            <LowStockCard
              icon="⚠️"
              title="Low Stock"
              count={analytics.lowStockCount}
              filterValue="low"
              products={analytics.lowStockProducts}
            />
            <LowStockCard
              icon="🔴"
              title="Out of Stock"
              count={analytics.outOfStockCount}
              filterValue="out"
            />
          </>
        ) : (
          <>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {essential.recentOrders.map((o) => (
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
          {essential.recentOrders.length === 0 && (
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
            {essential.recentCustomers.map((c) => (
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
            {essential.recentCustomers.length === 0 && (
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
            {analytics ? (
              <>
                {analytics.topProducts.map((p, i) => (
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
                {analytics.topProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No sales yet. Best sellers will show up here once orders come in.
                  </p>
                )}
              </>
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmployeeDashboard({ essential }: { essential: DashboardEssential }) {
  if (essential.customers.total === 0 && essential.orders.total === 0) {
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
        <StatCard title="My Customers" value={String(essential.customers.total)} />
        <StatCard title="My Orders" value={String(essential.orders.total)} />
        <StatCard
          title="Orders In Transit"
          value={String(essential.orders.byDeliveryStatus.IN_TRANSIT ?? 0)}
        />
        <StatCard
          title="Orders Delivered"
          value={String(essential.orders.byDeliveryStatus.DELIVERED ?? 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Customers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {essential.recentCustomers.map((c) => (
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
          {essential.recentCustomers.length === 0 && (
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
    queryFn: () => apiFetch<DashboardEssential>('/dashboard/summary'),
  });
  // Phase 20 Step 5C: deliberately gated on summaryQuery succeeding first rather
  // than fired alongside it — firing both at once would still be ~19-22 concurrent
  // DB queries split across 2 HTTP requests instead of 1, which doesn't reduce peak
  // pool pressure. Employees never see analytics data, so skip the request entirely.
  const isEmployee = currentUser?.role === 'EMPLOYEE';
  const analyticsQuery = useQuery({
    queryKey: ['dashboard', 'analytics'],
    queryFn: () => apiFetch<DashboardAnalytics>('/dashboard/analytics'),
    enabled: summaryQuery.isSuccess && !isEmployee,
  });

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
          <EmployeeDashboard essential={summaryQuery.data} />
        ) : (
          <AdminManagerDashboard essential={summaryQuery.data} analytics={analyticsQuery.data} />
        ))}
    </div>
  );
}
