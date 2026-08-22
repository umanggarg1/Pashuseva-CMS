import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Package } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentUser, hasPermission } from '@/lib/auth';
import { packagingUnitLabel, formatWeight } from '@/lib/productUnits';

interface ProductDetailData {
  id: number;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  weightValue: number | null;
  weightUnit: string | null;
  unit: string | null;
  availableQty: number;
  minimumStock: number;
  image: string | null;
  active: boolean;
  category: { id: number; name: string } | null;
}

interface ActivityRow {
  id: number;
  activity: string;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
}

interface StockHistoryRow {
  id: number;
  change: number;
  reason: string;
  note: string | null;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
  order: { id: number; orderNumber: string } | null;
}

function stockStatus(product: ProductDetailData) {
  if (product.availableQty <= 0) return { icon: '🔴', label: 'Out of Stock', className: 'text-destructive' };
  if (product.availableQty < product.minimumStock)
    return { icon: '🟠', label: 'Low Stock', className: 'text-amber-600' };
  return { icon: '🟢', label: 'In Stock', className: 'text-primary' };
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canAddStock = hasPermission(currentUser, 'stock:add');
  const canAdjustStock = hasPermission(currentUser, 'stock:adjust');

  const productQuery = useQuery({
    queryKey: ['product', id],
    queryFn: () => apiFetch<ProductDetailData>(`/products/${id}`),
  });
  const activityQuery = useQuery({
    queryKey: ['product', id, 'activity'],
    queryFn: () => apiFetch<ActivityRow[]>(`/products/${id}/activity`),
  });
  const stockHistoryQuery = useQuery({
    queryKey: ['product', id, 'stock-history'],
    queryFn: () => apiFetch<StockHistoryRow[]>(`/products/${id}/stock-history`),
  });

  const toggleStatus = useMutation({
    mutationFn: (active: boolean) =>
      apiFetch(`/products/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['product', id, 'activity'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Status updated');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status'),
  });

  // Trash (Phase 3 addendum) — distinct from Deactivate above: this hides the
  // product entirely, recoverable from Trash for 10 days. Past orders keep their
  // own snapshotted product name/SKU/price regardless.
  const deleteProduct = useMutation({
    mutationFn: () => apiFetch(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Product moved to Trash');
      navigate('/products');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to delete'),
  });

  function invalidateStock() {
    queryClient.invalidateQueries({ queryKey: ['product', id] });
    queryClient.invalidateQueries({ queryKey: ['product', id, 'activity'] });
    queryClient.invalidateQueries({ queryKey: ['product', id, 'stock-history'] });
    // Stock changes shift low-stock/out-of-stock counts and stock value on both the
    // Dashboard and the Inventory report.
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  }

  if (productQuery.isPending) return <Skeleton className="h-96 w-full" />;
  if (productQuery.isError || !productQuery.data) {
    return <ErrorState message="Could not load product." onRetry={() => productQuery.refetch()} />;
  }

  const product = productQuery.data;
  const status = stockStatus(product);

  return (
    <div className="space-y-6">
      <Link
        to="/products"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex h-48 items-center justify-center rounded-md bg-muted">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full rounded-md object-cover"
                />
              ) : (
                <Package className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            <h1 className="text-xl font-semibold">{product.name}</h1>
            <p className="text-sm text-muted-foreground">
              SKU: {product.sku}
              {formatWeight(product.weightValue, product.weightUnit) && (
                <> · {formatWeight(product.weightValue, product.weightUnit)}</>
              )}
            </p>
            <p className="mt-2 text-lg font-medium">
              ₹{product.price.toLocaleString()}
              {packagingUnitLabel(product.unit) && (
                <span className="text-sm text-muted-foreground">
                  {' '}
                  / {packagingUnitLabel(product.unit)}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Category: {product.category?.name ?? '—'}
            </p>
            {product.description && <p className="mt-3 text-sm">{product.description}</p>}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-sm">
                <span className={product.active ? 'text-primary' : 'text-muted-foreground'}>●</span>
                {product.active ? 'Active' : 'Inactive'}
              </span>
              <div className="flex flex-wrap gap-2">
                {product.active ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm">
                        Deactivate
                      </Button>
                    }
                    title="Deactivate this product?"
                    description="Deactivated products can't be added to new orders until reactivated. Existing orders referencing it are unaffected."
                    confirmLabel="Deactivate"
                    isPending={toggleStatus.isPending}
                    onConfirm={() => toggleStatus.mutate(false)}
                  />
                ) : (
                  <Button variant="outline" size="sm" onClick={() => toggleStatus.mutate(true)}>
                    Activate
                  </Button>
                )}
                {hasPermission(currentUser, 'product:deactivate') && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="destructive" size="sm">
                        Delete
                      </Button>
                    }
                    title="Delete Product?"
                    description="This product will be moved to Trash. You can restore it within 10 days."
                    confirmLabel="Move to Trash"
                    isPending={deleteProduct.isPending}
                    onConfirm={() => deleteProduct.mutate()}
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Current Stock</p>
                <p className="text-lg font-semibold">
                  {product.availableQty} {packagingUnitLabel(product.unit) ?? ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Minimum Stock</p>
                <p className="text-lg font-semibold">
                  {product.minimumStock} {packagingUnitLabel(product.unit) ?? ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className={`flex items-center gap-1 font-medium ${status.className}`}>
                  {status.icon} {status.label}
                </p>
              </div>
            </div>

            <div className="flex gap-2 border-t pt-3">
              {canAddStock && (
                <AddStockDialog productId={product.id} onSuccess={invalidateStock} />
              )}
              {canAdjustStock && (
                <AdjustStockDialog
                  productId={product.id}
                  currentStock={product.availableQty}
                  onSuccess={invalidateStock}
                />
              )}
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Stock History
              </p>
              {stockHistoryQuery.isPending && <Skeleton className="h-16 w-full" />}
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {stockHistoryQuery.data?.map((h) => (
                  <div key={h.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className={h.change >= 0 ? 'text-primary' : 'text-destructive'}>
                        {h.change >= 0 ? '+' : ''}
                        {h.change} {packagingUnitLabel(product.unit) ?? ''}
                      </p>
                      <p className="break-words text-xs text-muted-foreground">
                        {h.order ? `Order #${h.order.orderNumber}` : h.reason}
                        {h.note && ` — ${h.note}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <p>{new Date(h.createdAt).toLocaleDateString()}</p>
                      {h.createdBy?.name && <p>By: {h.createdBy.name}</p>}
                    </div>
                  </div>
                ))}
                {stockHistoryQuery.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">No stock history yet.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {activityQuery.isPending && <Skeleton className="h-16 w-full" />}
          {activityQuery.data?.map((a) => (
            <div key={a.id} className="text-sm">
              <span className="text-muted-foreground">
                {new Date(a.createdAt).toLocaleDateString()}
              </span>{' '}
              — {a.activity}
              {a.createdBy?.name && (
                <span className="text-muted-foreground"> by {a.createdBy.name}</span>
              )}
            </div>
          ))}
          {activityQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddStockDialog({
  productId,
  onSuccess,
}: {
  productId: number;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('New Stock');
  const [note, setNote] = useState('');

  const addStock = useMutation({
    mutationFn: () =>
      apiFetch(`/products/${productId}/stock/add`, {
        method: 'POST',
        body: JSON.stringify({ quantity: Number(quantity), reason, note: note || undefined }),
      }),
    onSuccess: () => {
      toast.success('Stock added');
      onSuccess();
      setOpen(false);
      setQuantity('');
      setReason('New Stock');
      setNote('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to add stock'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ Add Stock</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-sm font-medium">Quantity *</label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Reason *</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Note</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Stock received"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!quantity || Number(quantity) <= 0 || !reason.trim() || addStock.isPending}
            onClick={() => addStock.mutate()}
          >
            {addStock.isPending ? 'Adding…' : 'Add Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustStockDialog({
  productId,
  currentStock,
  onSuccess,
}: {
  productId: number;
  currentStock: number;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [adjustment, setAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const adjustmentNumber = Number(adjustment);
  const newStock = adjustment ? currentStock + adjustmentNumber : currentStock;

  const adjustStock = useMutation({
    mutationFn: () =>
      apiFetch(`/products/${productId}/stock/adjust`, {
        method: 'POST',
        body: JSON.stringify({ adjustment: adjustmentNumber, reason, note: note || undefined }),
      }),
    onSuccess: () => {
      toast.success('Stock adjusted');
      onSuccess();
      setOpen(false);
      setAdjustment('');
      setReason('');
      setNote('');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to adjust stock'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Adjust Stock
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Current Stock: <span className="font-medium">{currentStock}</span>
          </p>
          <div>
            <label className="text-sm font-medium">Adjustment *</label>
            <Input
              type="number"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              placeholder="e.g. -2 or 5"
            />
            {adjustment && (
              <p className="mt-1 text-xs text-muted-foreground">New stock: {newStock}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Reason *</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged Stock"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Note</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !adjustment ||
              adjustmentNumber === 0 ||
              newStock < 0 ||
              !reason.trim() ||
              adjustStock.isPending
            }
            onClick={() => adjustStock.mutate()}
          >
            {adjustStock.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
