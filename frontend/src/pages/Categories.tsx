import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import { apiFetch, ApiError } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

interface CategoryRow {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  _count: { products: number };
}

export default function Categories() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const query = useQuery({
    queryKey: ['categories', { search: debouncedSearch }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      return apiFetch<CategoryRow[]>(`/categories?${params.toString()}`);
    },
  });
  const queryClient = useQueryClient();

  const toggleStatus = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiFetch(`/categories/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category updated');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update category'),
  });

  return (
    <div className="space-y-4">
      <Link
        to="/products"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <AddCategoryDialog />
      </div>

      <Input
        placeholder="Search categories…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.isError && (
        <ErrorState message="Could not load categories." onRetry={() => query.refetch()} />
      )}

      {query.data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell>{category._count.products}</TableCell>
                <TableCell>{category.active ? 'Active' : 'Inactive'}</TableCell>
                <TableCell className="flex justify-end gap-2 text-right">
                  <EditCategoryDialog category={category} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toggleStatus.mutate({ id: category.id, active: !category.active })
                    }
                  >
                    {category.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {query.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No categories yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

const categoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

function AddCategoryDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof categoryFormSchema>>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: '', description: '' },
  });

  const createCategory = useMutation({
    mutationFn: (values: z.infer<typeof categoryFormSchema>) =>
      apiFetch('/categories', {
        method: 'POST',
        body: JSON.stringify({ name: values.name, description: values.description || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category created');
      setOpen(false);
      form.reset();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to create category'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Add Category</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add category</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => createCategory.mutate(v))} className="space-y-4">
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
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={createCategory.isPending}>
                {createCategory.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditCategoryDialog({ category }: { category: CategoryRow }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof categoryFormSchema>>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: category.name, description: category.description ?? '' },
  });

  const updateCategory = useMutation({
    mutationFn: (values: z.infer<typeof categoryFormSchema>) =>
      apiFetch(`/categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: values.name, description: values.description || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category updated');
      setOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update category'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => updateCategory.mutate(v))} className="space-y-4">
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
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={updateCategory.isPending}>
                {updateCategory.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
