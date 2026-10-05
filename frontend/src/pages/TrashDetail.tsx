import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import { apiFetch, ApiError } from '@/lib/api';
import TrashDetailLayout, { type TrashMeta } from '@/components/trash/TrashDetailLayout';
import CustomerTrashDetail, { type TrashCustomer } from '@/components/trash/CustomerTrashDetail';
import OrderTrashDetail, { type TrashOrder } from '@/components/trash/OrderTrashDetail';
import ProductTrashDetail, { type TrashProduct } from '@/components/trash/ProductTrashDetail';
import EmployeeTrashDetail, { type TrashEmployee } from '@/components/trash/EmployeeTrashDetail';

type TrashType = 'customer' | 'order' | 'product' | 'employee';
const TYPES: TrashType[] = ['customer', 'order', 'product', 'employee'];

type TrashDetailResponse =
  | { type: 'customer'; record: TrashCustomer; trash: TrashMeta }
  | { type: 'order'; record: TrashOrder; trash: TrashMeta }
  | { type: 'product'; record: TrashProduct; trash: TrashMeta }
  | { type: 'employee'; record: TrashEmployee; trash: TrashMeta };

// Same list keys the Trash page invalidates — restoring / purging changes the item's own
// list and every dashboard / report number derived from it.
const LIST_QUERY_KEY: Record<TrashType, string> = {
  customer: 'customers',
  order: 'orders',
  product: 'products',
  employee: 'users',
};

const GONE_MESSAGE = 'This item is no longer in Trash — it may have been restored or permanently deleted.';

// Phase 27: Admin-only detail view of one trashed item (/trash/:type/:id). Normal
// detail pages still 404 a trashed record; this page reads it through the Admin-only
// GET /api/trash/:type/:id instead, and offers Restore / Delete Permanently.
export default function TrashDetail() {
  const params = useParams();
  const type = params.type as TrashType;
  const id = Number(params.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const validType = TYPES.includes(type) && Number.isInteger(id) && id > 0;

  const query = useQuery({
    queryKey: ['trash', 'detail', type, id],
    queryFn: () => apiFetch<TrashDetailResponse>(`/trash/${type}/${id}`),
    enabled: validType,
    retry: (count, err) => !(err instanceof ApiError && [403, 404].includes(err.status)) && count < 1,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['trash'] });
    queryClient.invalidateQueries({ queryKey: [LIST_QUERY_KEY[type]] });
    // the normal detail page's own cache may still hold a "not found" from before
    queryClient.invalidateQueries({ queryKey: [type === 'employee' ? 'users' : type] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  }

  // A 404 here means the item left Trash between opening the page and clicking —
  // most likely the hourly purge, or another Admin. Say so and go back to the list.
  function onActionError(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 404) {
      toast.error('This item has already been permanently removed (or restored) — it is no longer in Trash.');
      invalidate();
      navigate('/trash');
      return;
    }
    toast.error(err instanceof ApiError ? err.message : fallback);
  }

  const restore = useMutation({
    mutationFn: () => apiFetch(`/trash/${type}/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      toast.success('Restored');
      const data = query.data;
      if (type === 'customer') navigate(`/customers/${id}`);
      else if (type === 'order' && data?.type === 'order') navigate(`/orders/${data.record.orderNumber}`);
      else if (type === 'product') navigate(`/products/${id}`);
      else navigate(type === 'employee' ? '/employees' : '/trash');
    },
    onError: (err) => onActionError(err, 'Failed to restore'),
  });

  const permanentDelete = useMutation({
    mutationFn: () =>
      apiFetch(`/trash/${type}/${id}/permanent-delete`, {
        method: 'POST',
        body: JSON.stringify({ confirm: 'DELETE' }),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Permanently deleted');
      navigate('/trash');
    },
    onError: (err) => onActionError(err, 'Failed to permanently delete'),
  });

  const back = () => navigate('/trash');

  if (!validType || (query.error instanceof ApiError && query.error.status === 404)) {
    return (
      <div className="space-y-4">
        <ErrorState message={validType ? GONE_MESSAGE : 'Unknown Trash item.'} />
        <Button variant="outline" onClick={back}>
          Back to Trash
        </Button>
      </div>
    );
  }
  if (query.error instanceof ApiError && query.error.status === 403) {
    return <ErrorState message="You don't have permission to view Trash." />;
  }
  if (query.isError) {
    return <ErrorState message="Unable to load Trash details." onRetry={() => query.refetch()} />;
  }
  if (!query.data) return <Skeleton className="h-96 w-full" />;

  const data = query.data;
  const typeLabel =
    data.type === 'customer'
      ? 'Customer'
      : data.type === 'order'
        ? 'Order'
        : data.type === 'product'
          ? 'Product'
          : data.record.role === 'MANAGER'
            ? 'Manager'
            : 'Employee';
  const itemLabel =
    data.type === 'order'
      ? data.record.orderNumber
      : data.type === 'employee'
        ? (data.record.name ?? data.record.email)
        : data.record.name;

  return (
    <TrashDetailLayout
      typeLabel={typeLabel}
      itemLabel={itemLabel}
      trash={data.trash}
      onBack={back}
      onRestore={() => restore.mutate()}
      onPermanentDelete={() => permanentDelete.mutate()}
      isPending={restore.isPending || permanentDelete.isPending}
    >
      {data.type === 'customer' && <CustomerTrashDetail c={data.record} />}
      {data.type === 'order' && <OrderTrashDetail o={data.record} />}
      {data.type === 'product' && <ProductTrashDetail p={data.record} />}
      {data.type === 'employee' && <EmployeeTrashDetail u={data.record} />}
    </TrashDetailLayout>
  );
}
