import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch, apiUrl, ApiError } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

type DateMode = 'today' | 'yesterday' | 'last7Days' | 'thisMonth' | 'lastMonth' | 'custom' | null;
type PaymentFilter = 'all' | 'paid' | 'unpaid';
type DeliveryFilter = 'all' | 'delivered' | 'undelivered';

const DATE_MODE_OPTIONS: { value: Exclude<DateMode, null>; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7Days', label: 'Last 7 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
];

function toYMD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Matches dashboard.service.ts's resolveRange exactly (week starts Monday isn't
// relevant here, but "this month" = 1st to today, "last month" = the whole
// prior calendar month) — same convention used elsewhere in the app already.
function resolveDateRange(
  mode: DateMode,
  customFrom: string,
  customTo: string
): { from?: string; to?: string } {
  const now = new Date();
  switch (mode) {
    case 'today': {
      const s = toYMD(now);
      return { from: s, to: s };
    }
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = toYMD(y);
      return { from: s, to: s };
    }
    case 'last7Days': {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { from: toYMD(start), to: toYMD(now) };
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toYMD(start), to: toYMD(now) };
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toYMD(start), to: toYMD(end) };
    }
    case 'custom':
      return { from: customFrom || undefined, to: customTo || undefined };
    default:
      return {};
  }
}

interface Filters {
  dateMode: DateMode;
  customFrom: string;
  customTo: string;
  payment: PaymentFilter;
  district: string; // 'all' or a real district value
  delivery: DeliveryFilter;
}

// The single source of truth for query params — used identically for the live
// count and both downloads, so the count shown can never drift from what
// actually downloads (see PHASE21_TODO.md decision #9).
function buildExportParams(filters: Filters): URLSearchParams {
  const { from, to } = resolveDateRange(filters.dateMode, filters.customFrom, filters.customTo);
  const params = new URLSearchParams();
  if (from) params.set('dateFrom', from);
  if (to) params.set('dateTo', to);
  if (filters.payment !== 'all') params.set('payment', filters.payment);
  if (filters.district !== 'all') params.set('district', filters.district);
  if (filters.delivery !== 'all') params.set('delivery', filters.delivery);
  return params;
}

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? 'default' : 'outline'}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

async function downloadBlob(path: string, params: URLSearchParams, filename: string) {
  const res = await fetch(apiUrl(`${path}?${params.toString()}`), { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function DownloadOrdersDialog() {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    dateMode: null,
    customFrom: '',
    customTo: '',
    payment: 'all',
    district: 'all',
    delivery: 'all',
  });
  const [downloading, setDownloading] = useState<'excel' | 'pdf' | null>(null);

  const debouncedFilters = useDebouncedValue(filters, 300);
  const countParams = buildExportParams(debouncedFilters);

  const countQuery = useQuery({
    queryKey: ['orders', 'export', 'count', countParams.toString()],
    queryFn: () => apiFetch<{ count: number }>(`/orders/export/count?${countParams.toString()}`),
    enabled: open,
  });

  const districtsQuery = useQuery({
    queryKey: ['customers', 'districts'],
    queryFn: () => apiFetch<{ data: string[] }>('/customers/districts'),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  function resetFilters() {
    setFilters({
      dateMode: null,
      customFrom: '',
      customTo: '',
      payment: 'all',
      district: 'all',
      delivery: 'all',
    });
  }

  async function handleDownload(format: 'excel' | 'pdf') {
    setDownloading(format);
    try {
      const params = buildExportParams(filters);
      await downloadBlob(
        `/orders/export/${format}`,
        params,
        `orders-export.${format === 'excel' ? 'xlsx' : 'pdf'}`
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to generate the report');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) resetFilters();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Download Orders</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Download Orders</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <Label>Date</Label>
            <ToggleGroup
              options={DATE_MODE_OPTIONS}
              value={filters.dateMode ?? ('' as never)}
              onChange={(v) => setFilters((f) => ({ ...f, dateMode: v }))}
            />
            {filters.dateMode === 'custom' && (
              <div className="flex items-center gap-1.5 pt-1">
                <Input
                  type="date"
                  value={filters.customFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, customFrom: e.target.value }))}
                  max={filters.customTo || undefined}
                  className="w-40"
                  aria-label="From date"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={filters.customTo}
                  onChange={(e) => setFilters((f) => ({ ...f, customTo: e.target.value }))}
                  min={filters.customFrom || undefined}
                  className="w-40"
                  aria-label="To date"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Payment Status</Label>
            <ToggleGroup
              options={[
                { value: 'all', label: 'All' },
                { value: 'paid', label: 'Paid' },
                { value: 'unpaid', label: 'Unpaid' },
              ]}
              value={filters.payment}
              onChange={(v) => setFilters((f) => ({ ...f, payment: v as PaymentFilter }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Area</Label>
            <Select
              value={filters.district}
              onValueChange={(v) => setFilters((f) => ({ ...f, district: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {districtsQuery.data?.data.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Delivery Status</Label>
            <ToggleGroup
              options={[
                { value: 'all', label: 'All' },
                { value: 'delivered', label: 'Delivered' },
                { value: 'undelivered', label: 'Undelivered' },
              ]}
              value={filters.delivery}
              onChange={(v) => setFilters((f) => ({ ...f, delivery: v as DeliveryFilter }))}
            />
          </div>

          <p className="border-t pt-3 text-center text-muted-foreground">
            {countQuery.isFetching
              ? 'Counting…'
              : countQuery.isError
                ? 'Could not load count'
                : `${countQuery.data?.count ?? 0} orders found`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={downloading !== null}
            onClick={() => handleDownload('excel')}
          >
            {downloading === 'excel' ? 'Generating report…' : 'Download Excel'}
          </Button>
          <Button disabled={downloading !== null} onClick={() => handleDownload('pdf')}>
            {downloading === 'pdf' ? 'Generating report…' : 'Download PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
