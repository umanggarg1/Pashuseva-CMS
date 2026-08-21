import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Users, ShoppingCart, Package, UserCog, BarChart3, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCurrentUser, hasPermission, type Role } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

const navItems: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
  permission?: string;
}[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/employees', label: 'Employees', icon: UserCog, roles: ['ADMIN', 'MANAGER'] },
  // Reports became a real permission (report:view) in the Phase 15 addendum, not a
  // blanket Admin/Manager role gate — a Manager only sees this once granted.
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'report:view' },
];

export function NavLinks({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === 'ADMIN';

  // Trash is Admin-only, no exceptions (Phase 3 addendum) — the badge count gives a
  // passive, ambient nudge to notice an accidental delete before its 10-day recovery
  // window runs out, without the Admin having to think to check.
  const trashCountQuery = useQuery({
    queryKey: ['trash', 'count'],
    queryFn: () => apiFetch<{ total: number }>('/trash'),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  // The sidebar only shows modules the current user can access — this is UX only,
  // the backend independently enforces every rule (phases.md Phase 3 §30-31).
  const visibleItems = navItems.filter((item) => {
    if (item.permission) return hasPermission(user, item.permission);
    if (item.roles) return !!user?.role && item.roles.includes(user.role);
    return true;
  });

  return (
    <nav className={cn('flex flex-col gap-1', className)}>
      {visibleItems.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
      {isAdmin && (
        <>
          <div className="my-1 border-t" />
          <Link
            to="/trash"
            onClick={onNavigate}
            className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <span className="flex items-center gap-3">
              <Trash2 className="h-4 w-4" />
              Trash
            </span>
            {!!trashCountQuery.data?.total && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                {trashCountQuery.data.total}
              </span>
            )}
          </Link>
        </>
      )}
    </nav>
  );
}

export default function Sidebar() {
  return (
    <aside className="print-hide hidden w-64 shrink-0 border-r bg-card p-4 md:block">
      <NavLinks />
    </aside>
  );
}
