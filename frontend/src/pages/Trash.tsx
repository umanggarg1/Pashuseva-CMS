import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
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

  const query = useQuery({
    queryKey: ['trash', tab],
    queryFn: () =>
      apiFetch<{ data: TrashItem[]; total: number }>(
        `/trash${tab === 'all' ? '' : `?type=${tab}`}`
      ),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['trash'] });
  }

  const restore = useMutation({
    mutationFn: (item: TrashItem) =>
      apiFetch(`/trash/${item.type}/${item.id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
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
    onSuccess: () => {
      invalidate();
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
                <TableRow key={`${item.type}-${item.id}`}>
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell>{TYPE_LABEL[item.type]}</TableCell>
                  <TableCell>{item.deletedBy?.name ?? '—'}</TableCell>
                  <TableCell>{new Date(item.deletedAt).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(item.deletionExpiresAt).toLocaleDateString()}</TableCell>
                  <TableCell className="flex flex-wrap justify-end gap-2">
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
                      item={item}
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

// Skips the 10-day recovery window entirely — the spec's own explicit ask for a
// stronger confirmation than the usual Cancel/Confirm dialog, requiring the Admin to
// type DELETE rather than just clicking a button.
function PermanentDeleteDialog({
  item,
  isPending,
  onConfirm,
}: {
  item: TrashItem;
  isPending?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText('');
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Delete Permanently
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permanently Delete {TYPE_LABEL[item.type]}?</DialogTitle>
          <DialogDescription>{item.label}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-destructive">
          ⚠ This action cannot be undone. The 10-day recovery period will be skipped.
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="permanent-delete-confirm">
            Type DELETE to confirm
          </label>
          <Input
            id="permanent-delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={confirmText !== 'DELETE' || isPending}
            onClick={() => {
              setOpen(false);
              setConfirmText('');
              onConfirm();
            }}
          >
            Delete Permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
