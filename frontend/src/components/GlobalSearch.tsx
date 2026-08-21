import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, User, Package, ShoppingCart, Users } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

interface SearchCustomer {
  id: number;
  name: string;
  phones: { phone: string; isPrimary: boolean }[];
}
interface SearchOrder {
  id: number;
  orderNumber: string;
  total: number;
  customer: { name: string };
}
interface SearchProduct {
  id: number;
  name: string;
  sku: string;
  price: number;
}
interface SearchEmployee {
  id: number;
  name: string | null;
  email: string;
  role: string;
}

interface GlobalSearchResponse {
  customers: { data: SearchCustomer[]; total: number };
  orders: { data: SearchOrder[]; total: number };
  products: { data: SearchProduct[]; total: number };
  employees: { data: SearchEmployee[]; total: number };
}

interface NavigableItem {
  key: string;
  path: string;
}

export default function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ['global-search', debouncedQ],
    queryFn: () => apiFetch<GlobalSearchResponse>(`/search?q=${encodeURIComponent(debouncedQ)}`),
    enabled: debouncedQ.trim().length >= 2,
  });

  // Reset search/selection state during render (React's recommended pattern for
  // "adjusting state when a prop changes") rather than in an effect, which would
  // cause an extra cascading render for what's really a single state transition.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQ('');
      setActiveIndex(0);
    }
  }

  const [prevDebouncedQ, setPrevDebouncedQ] = useState(debouncedQ);
  if (debouncedQ !== prevDebouncedQ) {
    setPrevDebouncedQ(debouncedQ);
    setActiveIndex(0);
  }

  // Focusing the input is an imperative DOM action (not a state update), so it
  // legitimately belongs in an effect.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  const items: NavigableItem[] = useMemo(() => {
    if (!query.data) return [];
    return [
      ...query.data.customers.data.map((c) => ({ key: `c${c.id}`, path: `/customers/${c.id}` })),
      ...query.data.orders.data.map((o) => ({ key: `o${o.id}`, path: `/orders/${o.id}` })),
      ...query.data.products.data.map((p) => ({ key: `p${p.id}`, path: `/products/${p.id}` })),
      ...query.data.employees.data.map((e) => ({ key: `e${e.id}`, path: `/employees` })),
    ];
  }, [query.data]);

  function go(path: string) {
    onOpenChange(false);
    navigate(path);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) go(item.path);
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  }

  const showEmpty = query.data && items.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-24 max-w-xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search customers, orders, products…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {debouncedQ.trim().length < 2 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </p>
          )}

          {query.isFetching && debouncedQ.trim().length >= 2 && (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {query.isError && (
            <p className="p-4 text-center text-sm text-destructive">Search failed. Try again.</p>
          )}

          {showEmpty && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No results for "{debouncedQ}".
            </p>
          )}

          {query.data && (
            <>
              <ResultGroup
                label="Customers"
                icon={<User className="h-3.5 w-3.5" />}
                total={query.data.customers.total}
                viewAllPath={`/customers?search=${encodeURIComponent(debouncedQ)}`}
                onViewAll={go}
              >
                {query.data.customers.data.map((c) => {
                  const item = items.find((i) => i.key === `c${c.id}`)!;
                  const index = items.indexOf(item);
                  return (
                    <ResultRow
                      key={c.id}
                      active={index === activeIndex}
                      onClick={() => go(item.path)}
                      onMouseEnter={() => setActiveIndex(index)}
                      title={c.name}
                      subtitle={c.phones.find((p) => p.isPrimary)?.phone ?? c.phones[0]?.phone}
                    />
                  );
                })}
              </ResultGroup>

              <ResultGroup
                label="Orders"
                icon={<ShoppingCart className="h-3.5 w-3.5" />}
                total={query.data.orders.total}
                viewAllPath={`/orders?search=${encodeURIComponent(debouncedQ)}`}
                onViewAll={go}
              >
                {query.data.orders.data.map((o) => {
                  const item = items.find((i) => i.key === `o${o.id}`)!;
                  const index = items.indexOf(item);
                  return (
                    <ResultRow
                      key={o.id}
                      active={index === activeIndex}
                      onClick={() => go(item.path)}
                      onMouseEnter={() => setActiveIndex(index)}
                      title={o.orderNumber}
                      subtitle={`${o.customer.name} · ₹${o.total.toLocaleString()}`}
                    />
                  );
                })}
              </ResultGroup>

              <ResultGroup
                label="Products"
                icon={<Package className="h-3.5 w-3.5" />}
                total={query.data.products.total}
                viewAllPath={`/products?search=${encodeURIComponent(debouncedQ)}`}
                onViewAll={go}
              >
                {query.data.products.data.map((p) => {
                  const item = items.find((i) => i.key === `p${p.id}`)!;
                  const index = items.indexOf(item);
                  return (
                    <ResultRow
                      key={p.id}
                      active={index === activeIndex}
                      onClick={() => go(item.path)}
                      onMouseEnter={() => setActiveIndex(index)}
                      title={p.name}
                      subtitle={`${p.sku} · ₹${p.price.toLocaleString()}`}
                    />
                  );
                })}
              </ResultGroup>

              <ResultGroup
                label="Employees"
                icon={<Users className="h-3.5 w-3.5" />}
                total={query.data.employees.total}
                viewAllPath="/employees"
                onViewAll={go}
              >
                {query.data.employees.data.map((e) => {
                  const item = items.find((i) => i.key === `e${e.id}`)!;
                  const index = items.indexOf(item);
                  return (
                    <ResultRow
                      key={e.id}
                      active={index === activeIndex}
                      onClick={() => go(item.path)}
                      onMouseEnter={() => setActiveIndex(index)}
                      title={e.name ?? e.email}
                      subtitle={`${e.role} · ${e.email}`}
                    />
                  );
                })}
              </ResultGroup>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultGroup({
  label,
  icon,
  total,
  viewAllPath,
  onViewAll,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  total: number;
  viewAllPath: string;
  onViewAll: (path: string) => void;
  children: React.ReactNode;
}) {
  if (total === 0) return null;
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
        {icon} {label}
      </div>
      {children}
      {total > 5 && (
        <button
          type="button"
          onClick={() => onViewAll(viewAllPath)}
          className="w-full rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-accent"
        >
          View all {total} results →
        </button>
      )}
    </div>
  );
}

function ResultRow({
  active,
  onClick,
  onMouseEnter,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm ${
        active ? 'bg-accent' : ''
      }`}
    >
      <span className="min-w-0 truncate font-medium">{title}</span>
      {subtitle && <span className="shrink-0 text-xs text-muted-foreground">{subtitle}</span>}
    </button>
  );
}
