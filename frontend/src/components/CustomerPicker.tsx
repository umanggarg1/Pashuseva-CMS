import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddCustomerDialog, { type CreatedCustomer } from '@/components/AddCustomerDialog';
import { apiFetch } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useCurrentUser, hasPermission } from '@/lib/auth';

export interface CustomerOption {
  id: number;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  phones: { phone: string; isPrimary: boolean }[];
}

// Reusable customer search-or-create picker. Built for Create Order, kept generic
// (value/onChange, no order-specific logic) so it can be dropped into any future
// module that needs to select a customer (phases.md-adjacent — see
// PHASE1-6_TODO.md "add this capability anywhere a customer is needed").
export default function CustomerPicker({
  value,
  onChange,
}: {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const { data: currentUser } = useCurrentUser();
  const canCreateCustomer = hasPermission(currentUser, 'customer:create');

  const query = useQuery({
    queryKey: ['customer-picker-search', debouncedSearch],
    queryFn: () =>
      apiFetch<{ data: CustomerOption[] }>(
        `/customers?search=${encodeURIComponent(debouncedSearch)}&pageSize=8`
      ),
    enabled: debouncedSearch.length > 1,
  });

  function handleCreated(customer: CreatedCustomer) {
    onChange({ id: customer.id, name: customer.name, status: 'ACTIVE', phones: customer.phones });
    setSearch('');
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{value.name}</p>
          {value.phones[0] && (
            <p className="text-sm text-muted-foreground">📞 {value.phones[0].phone}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange(null)}>
          <X className="mr-1 h-4 w-4" /> Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search customer by name, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {query.data && debouncedSearch.length > 1 && (
        <div className="divide-y rounded-md border">
          {query.data.data.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c)}
              className="flex w-full items-center justify-between gap-3 p-2 text-left text-sm hover:bg-accent"
            >
              <span className="min-w-0 truncate">{c.name}</span>
              <span className="shrink-0 text-muted-foreground">{c.phones[0]?.phone}</span>
            </button>
          ))}
          {query.data.data.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">No customers found.</p>
          )}
        </div>
      )}

      {canCreateCustomer && (
        <div className="flex items-center justify-between rounded-md border border-dashed p-3 text-sm">
          <span className="text-muted-foreground">Can't find the customer?</span>
          <AddCustomerDialog onCreated={handleCreated} />
        </div>
      )}
    </div>
  );
}
