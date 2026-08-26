import { z } from 'zod';
import { customerInputSchema } from './customer.schema';

export const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const orderNumberParamSchema = z.object({
  orderNumber: z.string().min(1),
});

export const orderStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
]);
export const paymentStatusSchema = z.enum(['PENDING', 'PARTIAL', 'PAID', 'REFUNDED']);
export const deliveryStatusSchema = z.enum([
  'NOT_DISPATCHED',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURN_PENDING',
  'RETURN_IN_TRANSIT',
  'RETURNED',
  'LOST',
  'DAMAGED',
]);
export const paymentMethodSchema = z.enum([
  'CASH',
  'UPI',
  'BANK_TRANSFER',
  'CARD',
  'ONLINE',
  'OTHER',
]);

const orderItemInputSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
});

// Both optional/reference-only fields (§ "Changes to Order", 2026-08-20) — an article
// number may not be known at creation time, and estimatedDeliveryCharges is
// informational only, never folded into subtotal/discount/shipping/total anywhere.
// Normalized so "", null, and "   " never coexist as distinct stored values: a key
// entirely absent from the request means "don't touch" (Prisma ignores `undefined`
// in update data), while an explicitly empty/whitespace value means "clear it"
// (mapped to `null`, which Prisma writes as an actual NULL).
const articleNumberSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined ? undefined : v === '' ? null : v));
const estimatedDeliveryChargesSchema = z.preprocess(
  (v) => (v === '' ? null : v),
  z.coerce.number().min(0).nullable().optional()
);

const orderAddressInputSchema = z.object({
  addressLine: z.string().min(1),
  landmark: z.string().optional(),
  city: z.string().min(1),
  district: z.string().optional(),
  state: z.string().min(1),
  pincode: z.string().min(1),
  country: z.string().optional(),
});

// customerId and newCustomer are mutually exclusive — either order for an existing
// customer, or create the customer and the order together in one transaction (see
// PHASE1-6_TODO.md §2). Exactly one must be present.
export const createOrderSchema = z
  .object({
    customerId: z.coerce.number().int().positive().optional(),
    newCustomer: customerInputSchema.optional(),
    items: z.array(orderItemInputSchema).min(1, 'At least one product is required'),
    paymentMethod: paymentMethodSchema,
    discount: z.coerce.number().min(0).default(0),
    deliveryCharge: z.coerce.number().min(0).default(0),
    // An initial payment recorded at creation time (e.g. an advance) — same ledger
    // path as orderService.addPayment, just folded into the creation transaction.
    // Defaults to 0 (Unpaid), matching every order created before this field existed.
    amountPaid: z.coerce.number().min(0).default(0),
    address: orderAddressInputSchema.optional(),
    notes: z.string().optional(),
    articleNumber: articleNumberSchema,
    estimatedDeliveryCharges: estimatedDeliveryChargesSchema,
  })
  .refine((data) => Boolean(data.customerId) !== Boolean(data.newCustomer), {
    message: 'Provide exactly one of customerId or newCustomer',
    path: ['customerId'],
  });

export const updateOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1).optional(),
  discount: z.coerce.number().min(0).optional(),
  deliveryCharge: z.coerce.number().min(0).optional(),
  address: orderAddressInputSchema.optional(),
  notes: z.string().optional(),
  assignedEmployeeId: z.coerce.number().int().positive().optional(),
  expectedDelivery: z.coerce.date().optional(),
  articleNumber: articleNumberSchema,
  estimatedDeliveryCharges: estimatedDeliveryChargesSchema,
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(1),
});

// Phase 17: manual PATCH is only for the pre-dispatch workflow (Pending → Confirmed
// → Processing) — every other module in this codebase (Customer, Product, Category)
// already uses a dedicated PATCH /:id/status route, so this follows that convention.
// Out for Delivery/Delivered are reachable only via the Delivery Status sync (see
// orderService.updateDeliveryStatus's DELIVERY_TO_ORDER_STATUS), and Cancelled only
// via POST /:id/cancel — neither is settable directly here.
export const updateOrderStatusSchema = z.object({
  orderStatus: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING']),
});

export const updateDeliveryStatusSchema = z.object({
  deliveryStatus: deliveryStatusSchema,
  location: z.string().min(1).optional(),
  note: z.string().optional(),
  receivedBy: z.string().min(1).optional(),
});

export const orderListQuerySchema = z.object({
  search: z.string().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  assignedEmployeeId: z.coerce.number().int().positive().optional(),
  orderStatus: orderStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  deliveryStatus: deliveryStatusSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  amountMin: z.coerce.number().min(0).optional(),
  amountMax: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['orderDate', 'total', 'orderNumber']).default('orderDate'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type OrderIdParam = z.infer<typeof orderIdParamSchema>;
export type OrderNumberParam = z.infer<typeof orderNumberParamSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type UpdateDeliveryStatusInput = z.infer<typeof updateDeliveryStatusSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
