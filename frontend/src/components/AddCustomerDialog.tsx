import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { apiFetch, ApiError } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

export interface CreatedCustomer {
  id: number;
  name: string;
  phones: { phone: string; isPrimary: boolean }[];
}

interface PossibleDuplicate extends CreatedCustomer {
  addresses: { city: string }[];
}

const customerFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phones: z
    .array(
      z.object({
        phone: z.string().min(1, 'Phone number is required'),
        label: z.string().optional(),
        isPrimary: z.boolean(),
      })
    )
    .min(1, 'At least one phone number is required'),
  line1: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  district: z.string().optional(),
  state: z.string().min(1, 'State is required'),
  pincode: z.string().min(1, 'Pincode is required'),
  landmark: z.string().optional(),
  notes: z.string().optional(),
});

// Reusable "add a customer without leaving the current flow" dialog — built for
// CustomerPicker (Create Order) but deliberately generic so it can be dropped into
// any future module that needs to select/create a customer inline.
export default function AddCustomerDialog({
  trigger,
  onCreated,
  defaultOpen,
}: {
  trigger?: React.ReactNode;
  onCreated: (customer: CreatedCustomer) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [ignoreDuplicate, setIgnoreDuplicate] = useState(false);

  const form = useForm<z.infer<typeof customerFormSchema>>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phones: [{ phone: '', label: 'Personal', isPrimary: true }],
      line1: '',
      city: '',
      district: '',
      state: '',
      pincode: '',
      landmark: '',
      notes: '',
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'phones' });

  const primaryPhone = form.watch('phones.0.phone');
  const debouncedPhone = useDebouncedValue(primaryPhone, 400);

  const duplicateQuery = useQuery({
    queryKey: ['customer-duplicate-check', debouncedPhone],
    queryFn: () =>
      apiFetch<{ data: PossibleDuplicate[] }>(
        `/customers?search=${encodeURIComponent(debouncedPhone)}&pageSize=3`
      ),
    enabled: debouncedPhone.trim().length >= 6 && !ignoreDuplicate,
  });

  const possibleDuplicate = duplicateQuery.data?.data[0];

  const createCustomer = useMutation({
    mutationFn: (values: z.infer<typeof customerFormSchema>) =>
      apiFetch<CreatedCustomer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          email: values.email || undefined,
          notes: values.notes || undefined,
          phones: values.phones,
          address: {
            line1: values.line1,
            city: values.city,
            district: values.district || undefined,
            state: values.state,
            pincode: values.pincode,
            landmark: values.landmark || undefined,
          },
        }),
      }),
    onSuccess: (customer) => {
      toast.success('Customer created');
      setOpen(false);
      setIgnoreDuplicate(false);
      form.reset();
      onCreated(customer);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to create customer'),
  });

  function setPrimary(index: number) {
    const phones = form.getValues('phones').map((p, i) => ({ ...p, isPrimary: i === index }));
    form.setValue('phones', phones);
  }

  function selectExistingCustomer(customer: PossibleDuplicate) {
    setOpen(false);
    setIgnoreDuplicate(false);
    form.reset();
    onCreated(customer);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setIgnoreDuplicate(false);
          form.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? <Button variant="outline">+ Add New Customer</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => createCustomer.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Name *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Phone Numbers *</FormLabel>
              <div className="mt-2 space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Input
                      placeholder="Phone number"
                      {...form.register(`phones.${index}.phone` as const)}
                    />
                    <Input
                      placeholder="Label"
                      className="w-28"
                      {...form.register(`phones.${index}.label` as const)}
                    />
                    <Button
                      type="button"
                      variant={form.watch(`phones.${index}.isPrimary`) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPrimary(index)}
                    >
                      Primary
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => append({ phone: '', label: 'Alternate', isPrimary: false })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add another phone
              </Button>
              {form.formState.errors.phones && (
                <p className="mt-1 text-sm font-medium text-destructive">
                  {form.formState.errors.phones.message}
                </p>
              )}
            </div>

            {possibleDuplicate && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4" /> Customer may already exist
                </p>
                <p className="mt-1 text-amber-900">
                  {possibleDuplicate.name} —{' '}
                  {possibleDuplicate.phones.find((p) => p.isPrimary)?.phone ??
                    possibleDuplicate.phones[0]?.phone}
                  {possibleDuplicate.addresses[0]?.city && ` · ${possibleDuplicate.addresses[0].city}`}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => selectExistingCustomer(possibleDuplicate)}
                  >
                    Use Existing Customer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIgnoreDuplicate(true)}
                  >
                    Create Anyway
                  </Button>
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (optional)</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="line1"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Address *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="district"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>District (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pincode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pincode *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="landmark"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Landmark (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createCustomer.isPending}>
                {createCustomer.isPending ? 'Creating…' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
