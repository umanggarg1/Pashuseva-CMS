import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import ConfirmDialog from '@/components/ConfirmDialog';
import PermanentDeleteDialog from '@/components/trash/PermanentDeleteDialog';
import { apiFetch, ApiError } from '@/lib/api';

type TrashType = 'customer' | 'order' | 'product' | 'employee';

interface TrashItem {
  type: TrashType;
  id: number;
  label: string;
  deletedBy: { id: number; name: string | null } | null;
  deletedAt: string;
  deletionExpiresAt: string;
}

const TABS: { value: TrashType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'customer', label: 'Customers' },
  { value: 'order', label: 'Orders' },
  { value: 'product', label: 'Products' },
  { value: 'employee', label: 'Employees' },
];

const TYPE_LABEL: Record<TrashType, string> = {
  customer: 'Customer',
  order: 'Order',
  product: 'Product',
  employee: 'Employee',
};

export default function Trash() {
  const [tab, setTab] = useState<TrashType | 'all'>('all');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['trash', tab],
    queryFn: () =>
      apiFetch<{ data: TrashItem[]; total: number }>(
        `/trash${tab === 'all' ? '' : `?type=${tab}`}`
      ),
  });

  // Restoring or permanently deleting any of these changes both its own list AND
  // every dashboard/report number derived from it (Total Orders, Total Customers,
  // stock counts, sales/outstanding totals, etc.) — all of those are computed live
  // from the database on every request, but the frontend still has to be told its
  // cached copies are stale, or it'll keep showing pre-restore/pre-purge numbers.
  const LIST_QUERY_KEY: Record<TrashType, string> = {
    customer: 'customers',
    order: 'orders',
    product: 'products',
    employee: 'users',
  };

  function invalidate(type: TrashType) {
    queryClient.invalidateQueries({ queryKey: ['trash'] });
    queryClient.invalidateQueries({ queryKey: [LIST_QUERY_KEY[type]] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  }

  const restore = useMutation({
    mutationFn: (item: TrashItem) =>
      apiFetch(`/trash/${item.type}/${item.id}/restore`, { method: 'POST' }),
    onSuccess: (_data, item) => {
      invalidate(item.type);
      toast.success('Restored');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to restore'),
  });

  const permanentDelete = useMutation({
    mutationFn: (item: TrashItem) =>
      apiFetch(`/trash/${item.type}/${item.id}/permanent-delete`, {
        method: 'POST',
        body: JSON.stringify({ confirm: 'DELETE' }),
      }),
    onSuccess: (_data, item) => {
      invalidate(item.type);
      toast.success('Permanently deleted');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to permanently delete'),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Trash" />

      {query.data && query.data.total > 0 && (
        <p className="text-sm text-muted-foreground">
          {query.data.total} item{query.data.total === 1 ? '' : 's'} will be permanently deleted
          within the next 10 days unless restored.
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`shrink-0 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && (
        <ErrorState message="Could not load Trash." onRetry={() => query.refetch()} />
      )}

      {query.data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Deleted By</TableHead>
                <TableHead>Deleted On</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((item) => (
                // Phase 27: the whole row opens the item's Trash detail page.
                <TableRow
                  key={`${item.type}-${item.id}`}
                  className="cursor-pointer"
                  onClick={() => navigate(`/trash/${item.type}/${item.id}`)}
                >
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell>{TYPE_LABEL[item.type]}</TableCell>
                  <TableCell>{item.deletedBy?.name ?? '—'}</TableCell>
                  <TableCell>{new Date(item.deletedAt).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(item.deletionExpiresAt).toLocaleDateString()}</TableCell>
                  {/* Clicks here (and inside the portalled dialogs, whose React events
                      still bubble through this cell) must not open the row. */}
                  <TableCell
                    className="flex flex-wrap justify-end gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/trash/${item.type}/${item.id}`}>View</Link>
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="outline" size="sm">
                          Restore
                        </Button>
                      }
                      title={`Restore ${TYPE_LABEL[item.type]}?`}
                      description={`${item.label} will become active again.`}
                      confirmLabel="Restore"
                      isPending={restore.isPending}
                      onConfirm={() => restore.mutate(item)}
                    />
                    <PermanentDeleteDialog
                      typeLabel={TYPE_LABEL[item.type]}
                      itemLabel={item.label}
                      isPending={permanentDelete.isPending}
                      onConfirm={() => permanentDelete.mutate(item)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {query.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState message="Trash is empty." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
