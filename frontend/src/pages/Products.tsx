import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { apiFetch, ApiError } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import {
  PACKAGING_UNIT_OPTIONS,
  WEIGHT_UNIT_OPTIONS,
  packagingUnitLabel,
  formatWeight,
} from '@/lib/productUnits';

interface CategoryOption {
  id: number;
  name: string;
  active: boolean;
}

interface ProductListItem {
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

interface ProductListResponse {
  data: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

function stockStatus(product: ProductListItem) {
  if (product.availableQty <= 0) return { icon: '🔴', label: 'Out of Stock', className: 'text-destructive' };
  if (product.availableQty < product.minimumStock)
    return { icon: '🟠', label: 'Low Stock', className: 'text-amber-600' };
  return { icon: '🟢', label: 'In Stock', className: 'text-primary' };
}

function stockQuantityLabel(product: ProductListItem) {
  const label = packagingUnitLabel(product.unit);
  return label ? `${product.availableQty} ${label}` : String(product.availableQty);
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="border-b pb-1 text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A-Z' },
  { value: 'name:desc', label: 'Name Z-A' },
  { value: 'price:asc', label: 'Price: low to high' },
  { value: 'price:desc', label: 'Price: high to low' },
  { value: 'availableQty:asc', label: 'Stock: low to high' },
] as const;

export default function Products() {
  // A dashboard link like /products?stock=low should land pre-filtered, same pattern
  // as Orders (Phase 9).
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [categoryId, setCategoryId] = useState<string>('all');
  const [active, setActive] = useState<string>('all');
  const [stock, setStock] = useState<string>(searchParams.get('stock') ?? 'all');
  const [sort, setSort] = useState<string>('createdAt:desc');
  const [page, setPage] = useState(1);

  // Dashboard's "+ Add Product" quick action links here with ?add=1 so it opens
  // straight into the Add Product dialog instead of just landing on the list.
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

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryOption[]>('/categories'),
  });

  const query = useQuery({
    queryKey: ['products', { search: debouncedSearch, categoryId, active, stock, sort, page }],
    queryFn: () => {
      const [sortBy, sortDir] = sort.split(':');
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (categoryId !== 'all') params.set('categoryId', categoryId);
      if (active !== 'all') params.set('active', active);
      if (stock !== 'all') params.set('stock', stock);
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      return apiFetch<ProductListResponse>(`/products?${params.toString()}`);
    },
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        action={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/categories">Manage Categories</Link>
            </Button>
            <AddProductDialog categories={categoriesQuery.data ?? []} defaultOpen={openAddOnLoad} />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search products, SKU…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categoriesQuery.data?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={active}
          onValueChange={(v) => {
            setActive(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={stock}
          onValueChange={(v) => {
            setStock(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44">
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

      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && (
        <ErrorState message="Could not load products." onRetry={() => query.refetch()} />
      )}

      {query.data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Stock Status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((product) => {
                const status = stockStatus(product);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      <Link to={`/products/${product.id}`} className="hover:underline">
                        {product.name}
                      </Link>
                      {formatWeight(product.weightValue, product.weightUnit) && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {formatWeight(product.weightValue, product.weightUnit)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{product.sku}</TableCell>
                    <TableCell>{product.category?.name ?? '—'}</TableCell>
                    <TableCell>{stockQuantityLabel(product)}</TableCell>
                    <TableCell className={status.className}>
                      <span className="flex items-center gap-1">
                        {status.icon} {status.label}
                      </span>
                    </TableCell>
                    <TableCell>{product.active ? 'Active' : 'Inactive'}</TableCell>
                    <TableCell className="text-right">
                      <EditProductDialog
                        product={product}
                        categories={categoriesQuery.data ?? []}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {query.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState message="No products found." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {query.data.page} of {totalPages} · {query.data.total} products
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

const productFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().min(1, 'SKU is required'),
  categoryId: z.string().optional(),
  description: z.string().optional(),
  price: z.coerce.number().positive('Price must be positive'),
  // Kept as plain strings (not z.coerce.number()) so an empty field means "no
  // weight" rather than coercing to 0 — converted to a real number only at submit,
  // same pattern as every other optional field in this form.
  weightValue: z.string().optional(),
  weightUnit: z.string().optional(),
  unit: z.string().optional(),
  availableQty: z.coerce.number().int().min(0),
  minimumStock: z.coerce.number().int().min(0),
  image: z.string().optional(),
});

function AddProductDialog({
  categories,
  defaultOpen,
}: {
  categories: CategoryOption[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [skuTouched, setSkuTouched] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<
    z.input<typeof productFormSchema>,
    unknown,
    z.output<typeof productFormSchema>
  >({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      sku: '',
      categoryId: undefined,
      description: '',
      price: 0,
      weightValue: '',
      weightUnit: 'KG',
      unit: '',
      availableQty: 0,
      minimumStock: 0,
      image: '',
    },
  });

  // Auto-generated SKU: as Name/Category/Weight change, preview a suggested SKU
  // (Admin doesn't have to think about it) — but stop overwriting it the moment the
  // admin types into the field directly, since it's still just a starting point they
  // can freely override.
  const nameWatch = form.watch('name');
  const categoryIdWatch = form.watch('categoryId');
  const weightValueWatch = form.watch('weightValue');
  const weightUnitWatch = form.watch('weightUnit');
  const debouncedName = useDebouncedValue(nameWatch, 400);
  const debouncedWeightValue = useDebouncedValue(weightValueWatch, 400);

  const suggestedSku = useQuery({
    queryKey: ['suggest-sku', debouncedName, categoryIdWatch, debouncedWeightValue, weightUnitWatch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedName) params.set('name', debouncedName);
      if (categoryIdWatch) params.set('categoryId', categoryIdWatch);
      if (debouncedWeightValue) {
        params.set('weightValue', debouncedWeightValue);
        params.set('weightUnit', weightUnitWatch || 'KG');
      }
      return apiFetch<{ sku: string }>(`/products/suggest-sku?${params.toString()}`);
    },
    enabled: open && !skuTouched,
  });

  useEffect(() => {
    if (open && !skuTouched && suggestedSku.data) {
      form.setValue('sku', suggestedSku.data.sku);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedSku.data, open, skuTouched]);

  const createProduct = useMutation({
    mutationFn: (values: z.infer<typeof productFormSchema>) =>
      apiFetch('/products', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          categoryId: values.categoryId ? Number(values.categoryId) : undefined,
          description: values.description || undefined,
          weightValue: values.weightValue ? Number(values.weightValue) : undefined,
          weightUnit: values.weightValue ? values.weightUnit : undefined,
          unit: values.unit || undefined,
          image: values.image || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Product created');
      setOpen(false);
      setSkuTouched(false);
      form.reset();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to create product'),
  });

  const activeCategories = categories.filter((c) => c.active);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Add Product</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => createProduct.mutate(v))} className="space-y-6">
            <FormSection title="Basic Information">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            setSkuTouched(true);
                          }}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {skuTouched ? 'Custom SKU' : 'Auto-generated — edit if needed'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeCategories.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <FormSection title="Pricing & Quantity">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} value={field.value as number} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="weightValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight / Quantity (optional)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="e.g. 1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weightUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight Unit</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {WEIGHT_UNIT_OPTIONS.map((u) => (
                            <SelectItem key={u.value} value={u.value}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PACKAGING_UNIT_OPTIONS.map((u) => (
                            <SelectItem key={u.value} value={u.value}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="availableQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Stock</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value as number} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minimumStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum Stock</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value as number} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </FormSection>

            <FormSection title="Media">
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Image URL (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <DialogFooter>
              <Button type="submit" disabled={createProduct.isPending}>
                {createProduct.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditProductDialog({
  product,
  categories,
}: {
  product: ProductListItem;
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<
    z.input<typeof productFormSchema>,
    unknown,
    z.output<typeof productFormSchema>
  >({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product.name,
      sku: product.sku,
      categoryId: product.category ? String(product.category.id) : undefined,
      description: product.description ?? '',
      price: product.price,
      weightValue: product.weightValue !== null ? String(product.weightValue) : '',
      weightUnit: product.weightUnit ?? 'KG',
      unit: product.unit ?? '',
      availableQty: product.availableQty,
      minimumStock: product.minimumStock,
      image: product.image ?? '',
    },
  });

  const updateProduct = useMutation({
    mutationFn: (values: z.infer<typeof productFormSchema>) =>
      apiFetch(`/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...values,
          categoryId: values.categoryId ? Number(values.categoryId) : null,
          description: values.description || undefined,
          weightValue: values.weightValue ? Number(values.weightValue) : null,
          weightUnit: values.weightValue ? values.weightUnit : null,
          unit: values.unit || undefined,
          image: values.image || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Product updated');
      setOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update product'),
  });

  const activeCategories = categories.filter((c) => c.active || c.id === product.category?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => updateProduct.mutate(v))} className="space-y-6">
            <FormSection title="Basic Information">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeCategories.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <FormSection title="Pricing & Quantity">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} value={field.value as number} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="weightValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight / Quantity (optional)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="e.g. 1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weightUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight Unit</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {WEIGHT_UNIT_OPTIONS.map((u) => (
                            <SelectItem key={u.value} value={u.value}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PACKAGING_UNIT_OPTIONS.map((u) => (
                            <SelectItem key={u.value} value={u.value}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="availableQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Stock</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value as number} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minimumStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum Stock</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value as number} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </FormSection>

            <FormSection title="Media">
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Image URL (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <DialogFooter>
              <Button type="submit" disabled={updateProduct.isPending}>
                {updateProduct.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
