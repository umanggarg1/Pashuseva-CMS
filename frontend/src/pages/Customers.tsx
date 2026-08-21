import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
import AddCustomerDialog from '@/components/AddCustomerDialog';
import { apiFetch } from '@/lib/api';
import { useCurrentUser, hasPermission } from '@/lib/auth';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

interface EmployeeOption {
  id: number;
  name: string | null;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
}

interface CustomerPhone {
  id: number;
  phone: string;
  label: string | null;
  isPrimary: boolean;
}

interface CustomerListItem {
  id: number;
  name: string;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  phones: CustomerPhone[];
  assignedEmployee: { id: number; name: string | null } | null;
  assignedManager: { id: number; name: string | null } | null;
}

interface CustomerListResponse {
  data: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A-Z' },
  { value: 'name:desc', label: 'Name Z-A' },
] as const;

export default function Customers() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';
  const canCreateCustomer = hasPermission(currentUser, 'customer:create');
  const queryClient = useQueryClient();

  // Dashboard's "+ Add Customer" quick action links here with ?add=1 so it opens
  // straight into the Add Customer dialog instead of just landing on the list.
  const [searchParams, setSearchParams] = useSearchParams();
  const openAddOnLoad = searchParams.get('add') === '1';
  useEffect(() => {
    if (openAddOnLoad) {
      const next = new URLSearchParams(searchParams);
      next.delete('add');
      setSearchParams(next, { replace: true });
    }
    // Only ever meant to consume the param once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState<string>('all');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<string>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sort, setSort] = useState<string>('createdAt:desc');
  const [page, setPage] = useState(1);

  const employeesQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<EmployeeOption[]>('/users'),
    enabled: isAdmin,
  });

  const query = useQuery({
    queryKey: [
      'customers',
      {
        search: debouncedSearch,
        status,
        city,
        district,
        state,
        assignedEmployeeId,
        createdFrom,
        createdTo,
        sort,
        page,
      },
    ],
    queryFn: () => {
      const [sortBy, sortDir] = sort.split(':');
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status !== 'all') params.set('status', status);
      if (city) params.set('city', city);
      if (district) params.set('district', district);
      if (state) params.set('state', state);
      if (isAdmin && assignedEmployeeId !== 'all')
        params.set('assignedEmployeeId', assignedEmployeeId);
      if (createdFrom) params.set('createdFrom', createdFrom);
      if (createdTo) params.set('createdTo', createdTo);
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      return apiFetch<CustomerListResponse>(`/customers?${params.toString()}`);
    },
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;
  const employees = employeesQuery.data?.filter((u) => u.role === 'EMPLOYEE') ?? [];

  function primaryPhone(phones: CustomerPhone[]) {
    return phones.find((p) => p.isPrimary)?.phone ?? phones[0]?.phone ?? '—';
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        action={
          canCreateCustomer && (
            <AddCustomerDialog
              trigger={<Button>+ Add Customer</Button>}
              onCreated={() => queryClient.invalidateQueries({ queryKey: ['customers'] })}
              defaultOpen={openAddOnLoad}
            />
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search customer, phone, email…"
          value={search}
          onChange={(e) => resetPage(setSearch)(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={resetPage(setStatus)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={assignedEmployeeId} onValueChange={resetPage(setAssignedEmployeeId)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Assigned Employee" />
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
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40">
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

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="City"
          value={city}
          onChange={(e) => resetPage(setCity)(e.target.value)}
          className="w-32"
        />
        <Input
          placeholder="District"
          value={district}
          onChange={(e) => resetPage(setDistrict)(e.target.value)}
          className="w-32"
        />
        <Input
          placeholder="State"
          value={state}
          onChange={(e) => resetPage(setState)(e.target.value)}
          className="w-32"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Created after
          <Input
            type="date"
            value={createdFrom}
            onChange={(e) => resetPage(setCreatedFrom)(e.target.value)}
            className="w-40"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Created before
          <Input
            type="date"
            value={createdTo}
            onChange={(e) => resetPage(setCreatedTo)(e.target.value)}
            className="w-40"
          />
        </label>
      </div>

      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && (
        <ErrorState message="Could not load customers." onRetry={() => query.refetch()} />
      )}

      {query.data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    <Link to={`/customers/${customer.id}`} className="hover:underline">
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell>{primaryPhone(customer.phones)}</TableCell>
                  <TableCell>{customer.assignedEmployee?.name ?? 'Unassigned'}</TableCell>
                  <TableCell>{customer.status}</TableCell>
                </TableRow>
              ))}
              {query.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState message="No customers found." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {query.data.page} of {totalPages} · {query.data.total} customers
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
