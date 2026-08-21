import { Prisma } from '../generated/prisma/client';
import prisma from '../lib/prisma';
import { orderRepository } from '../repositories/order.repository';
import { customerRepository } from '../repositories/customer.repository';
import { productRepository } from '../repositories/product.repository';
import { userRepository } from '../repositories/user.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { auditLogRepository } from '../repositories/auditLog.repository';
import { HttpError, NotFoundError } from '../utils/httpError';
import { hasPermission } from '../utils/permissions';
import { orderDataWhere, hasCustomerDataAccess, hasOrderDataAccess } from '../utils/dataScope';
import { computeDeletionExpiry } from '../utils/trash';
import type { Role, DeliveryStatus, PaymentStatus, DataScope } from '../generated/prisma/enums';
import type { CreateOrderInput, UpdateOrderInput, OrderListQuery } from '../schemas/order.schema';
import type { CreatePaymentInput } from '../schemas/payment.schema';

// Phase 11 §8: both orderStatus and deliveryStatus are "forward-only, no backward
// moves" for Employees — but ADMIN/MANAGER can freely set any value in any direction,
// as an explicit correction override. This replaces the earlier "fully manual for
// everyone" rule from the Phase 7 "manual status" work; that rule's most-valued
// behavior — re-logging IN_TRANSIT multiple times with a new location while staying in
// the same stage — still works for every role, since staying at the same index isn't a
// backward move.
const ORDER_STATUS_SEQUENCE = ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED'] as const;
const DELIVERY_STATUS_SEQUENCE = [
  'NOT_DISPATCHED',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
] as const;

function assertNotBackward(
  sequence: readonly string[],
  current: string,
  next: string,
  actingUser: ActingUser,
  fieldLabel: string
) {
  if (actingUser.role === 'ADMIN' || actingUser.role === 'MANAGER') return;
  const currentIndex = sequence.indexOf(current);
  const nextIndex = sequence.indexOf(next);
  if (nextIndex < currentIndex) {
    throw new HttpError(
      400,
      `Cannot move ${fieldLabel} backward from ${current} to ${next} — ask a Manager or Admin to make this correction.`
    );
  }
}

type ActingUser = {
  id: number;
  role: Role | null;
  managerId?: number | null;
  permissions?: string[];
  customerDataScope?: DataScope | null;
  orderDataScope?: DataScope | null;
};

// Mirrors middleware/authorize.ts's rule exactly (via the same hasPermission()
// helper) — needed here too since inline customer creation during order creation
// requires customer:create, but POST /orders itself is only gated on order:create.
function assertCanCreateCustomer(actingUser: ActingUser) {
  if (!hasPermission(actingUser, 'customer:create')) {
    throw new HttpError(403, 'You do not have permission to create customers');
  }
}

interface OrderWithItemsAndStatus {
  id: number;
  orderStatus: string;
  deliveryStatus: string;
  items: { productId: number | null; quantity: number }[];
}

// §15/§17 of phases.md describe the cancel/edit cutoff as "before delivery", but the
// example tables mix Order Status values (PENDING/CONFIRMED/PROCESSING) with Delivery
// Status values (DISPATCHED/IN_TRANSIT/DELIVERED) as if they were one sequence — even
// though §11/§12 are explicit that the two fields are independent. The only field that
// actually answers "has fulfillment physically started" is deliveryStatus, so that's
// the real gate; orderStatus only additionally blocks the terminal COMPLETED/CANCELLED
// states. See phases.md §44 for this resolution.
function assertNotDispatched(order: OrderWithItemsAndStatus, action: 'edit' | 'cancel') {
  if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'COMPLETED') {
    throw new HttpError(
      400,
      `Cannot ${action} an order that is already ${order.orderStatus.toLowerCase()}`
    );
  }
  if (order.deliveryStatus !== 'NOT_DISPATCHED') {
    throw new HttpError(
      400,
      `Cannot ${action} an order once it has been dispatched (current delivery status: ${order.deliveryStatus})`
    );
  }
}

async function assertCustomerAccessible(customerId: number, actingUser: ActingUser) {
  const customer = await customerRepository.findAssignmentById(customerId);
  if (!customer) throw new NotFoundError('Customer not found');

  if (!hasCustomerDataAccess(actingUser, actingUser.customerDataScope, customer)) {
    throw new HttpError(403, 'You do not have access to this customer');
  }
}

// Same rule as checkOrderAccess middleware (derived from the order's customer's live
// assignment, not Order.assignedEmployeeId — phases.md §44), reimplemented inline for
// the order-number lookup path so the numeric-id middleware doesn't need to learn a
// second identifier type (ORDER_DETAILS_UPGRADE_TODO.md §1).
function assertOrderAccessible(
  order: { customer: { assignedEmployeeId: number | null; assignedManagerId: number | null } },
  actingUser: ActingUser
) {
  if (!hasOrderDataAccess(actingUser, actingUser.orderDataScope, order)) {
    throw new HttpError(403, 'You do not have access to this order');
  }
}

// Admin sees all orders; Manager/Employee scope depends on their Data Scope setting
// (Phase 15 addendum) — derived from the customer's live assignment, not
// Order.assignedEmployeeId (phases.md §44).
function buildOrderWhere(actingUser: ActingUser, query: OrderListQuery): Prisma.OrderWhereInput {
  const scope = orderDataWhere(actingUser, actingUser.orderDataScope);

  const dateFilter: Prisma.OrderWhereInput =
    query.dateFrom || query.dateTo
      ? {
          orderDate: {
            ...(query.dateFrom && { gte: query.dateFrom }),
            ...(query.dateTo && { lte: query.dateTo }),
          },
        }
      : {};

  const amountFilter: Prisma.OrderWhereInput =
    query.amountMin !== undefined || query.amountMax !== undefined
      ? {
          total: {
            ...(query.amountMin !== undefined && { gte: query.amountMin }),
            ...(query.amountMax !== undefined && { lte: query.amountMax }),
          },
        }
      : {};

  return {
    ...scope,
    ...(query.customerId && { customerId: query.customerId }),
    ...(actingUser.role === 'ADMIN' &&
      query.assignedEmployeeId && { assignedEmployeeId: query.assignedEmployeeId }),
    ...(query.orderStatus && { orderStatus: query.orderStatus }),
    ...(query.paymentStatus && { paymentStatus: query.paymentStatus }),
    ...(query.deliveryStatus && { deliveryStatus: query.deliveryStatus }),
    ...dateFilter,
    ...amountFilter,
    ...(query.search && {
      OR: [
        { orderNumber: { contains: query.search, mode: 'insensitive' as const } },
        { customer: { name: { contains: query.search, mode: 'insensitive' as const } } },
        { customer: { phones: { some: { phone: { contains: query.search } } } } },
        {
          items: { some: { productSKU: { contains: query.search, mode: 'insensitive' as const } } },
        },
        {
          items: {
            some: { productName: { contains: query.search, mode: 'insensitive' as const } },
          },
        },
      ],
    }),
  };
}

interface ResolvedItem {
  productId: number;
  productName: string;
  productSKU: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
}

// The one function in this file that enforces the "never trust the frontend price"
// rule (phases.md §42-43): it only ever takes { productId, quantity } and looks up the
// live Product row for price/name/SKU/unit/stock — the request body's price, if a
// forged one were sent, is never read.
async function resolveOrderItems(
  items: { productId: number; quantity: number }[],
  tx: Prisma.TransactionClient
): Promise<{ resolved: ResolvedItem[]; subtotal: number }> {
  const resolved: ResolvedItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    const product = await productRepository.findById(item.productId, tx);
    if (!product) throw new HttpError(400, `Product ${item.productId} not found`);
    if (!product.active) {
      throw new HttpError(400, `${product.name} is inactive and cannot be ordered`);
    }

    const decremented = await productRepository.decrementStock(item.productId, item.quantity, tx);
    if (!decremented) {
      throw new HttpError(
        400,
        `Insufficient stock for ${product.name}. Available: ${product.availableQty}, Requested: ${item.quantity}`
      );
    }

    const totalPrice = product.price * item.quantity;
    subtotal += totalPrice;
    resolved.push({
      productId: product.id,
      productName: product.name,
      productSKU: product.sku,
      unit: product.unit ?? undefined,
      quantity: item.quantity,
      unitPrice: product.price,
      discount: 0,
      totalPrice,
    });
  }

  return { resolved, subtotal };
}

export const orderService = {
  list(actingUser: ActingUser, query: OrderListQuery) {
    const where = buildOrderWhere(actingUser, query);
    const skip = (query.page - 1) * query.pageSize;
    return orderRepository.findMany(where, {
      skip,
      take: query.pageSize,
      orderBy: { [query.sortBy]: query.sortDir },
    });
  },

  async getById(id: number) {
    const order = await orderRepository.findById(id);
    if (!order) throw new NotFoundError('Order not found');
    return order;
  },

  async getByOrderNumber(orderNumber: string, actingUser: ActingUser) {
    const order = await orderRepository.findByOrderNumber(orderNumber);
    if (!order) throw new NotFoundError('Order not found');
    assertOrderAccessible(order, actingUser);
    return order;
  },

  async create(input: CreateOrderInput, actingUser: ActingUser) {
    // Two mutually exclusive paths (enforced by the schema's refine): order for an
    // existing customer (checked/fetched up front, as before), or create the customer
    // and the order together in one transaction (phases.md-adjacent requirement — see
    // PHASE1-6_TODO.md §2, "don't create the customer and order as two unrelated
    // operations").
    let existingCustomer: Awaited<ReturnType<typeof customerRepository.findById>> = null;
    if (input.newCustomer) {
      assertCanCreateCustomer(actingUser);
    } else {
      await assertCustomerAccessible(input.customerId!, actingUser);
      existingCustomer = await customerRepository.findById(input.customerId!);
      if (!existingCustomer) throw new NotFoundError('Customer not found');
      if (existingCustomer.status !== 'ACTIVE') {
        throw new HttpError(400, 'Cannot create an order for an inactive customer');
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      let customerId: number;
      let assignedEmployeeId: number | null;
      let addresses: {
        line1: string;
        landmark: string | null;
        city: string;
        district: string | null;
        state: string;
        pincode: string;
        country: string;
      }[];

      if (input.newCustomer) {
        const createdCustomer = await customerRepository.create(
          {
            name: input.newCustomer.name,
            email: input.newCustomer.email,
            notes: input.newCustomer.notes,
            createdById: actingUser.id,
            // Same auto-assignment rule as customerService.create — see the
            // prerequisite fix in PHASE1-6_TODO.md §1.
            assignedManagerId:
              actingUser.role === 'MANAGER'
                ? actingUser.id
                : actingUser.role === 'EMPLOYEE'
                  ? (actingUser.managerId ?? undefined)
                  : undefined,
            assignedEmployeeId: actingUser.role === 'EMPLOYEE' ? actingUser.id : undefined,
            phones: input.newCustomer.phones,
            address: input.newCustomer.address,
          },
          tx
        );
        await customerRepository.recordActivity(
          createdCustomer.id,
          'Customer created',
          actingUser.id,
          tx
        );
        customerId = createdCustomer.id;
        assignedEmployeeId = createdCustomer.assignedEmployeeId;
        addresses = createdCustomer.addresses;
      } else {
        customerId = existingCustomer!.id;
        assignedEmployeeId = existingCustomer!.assignedEmployeeId;
        addresses = existingCustomer!.addresses;
      }

      const { resolved, subtotal } = await resolveOrderItems(input.items, tx);
      const total = subtotal - input.discount + input.deliveryCharge;

      const primaryAddress = addresses[0];
      const address =
        input.address ??
        (primaryAddress && {
          addressLine: primaryAddress.line1,
          landmark: primaryAddress.landmark ?? undefined,
          city: primaryAddress.city,
          district: primaryAddress.district ?? undefined,
          state: primaryAddress.state,
          pincode: primaryAddress.pincode,
          country: primaryAddress.country,
        });

      const orderNumber = await orderRepository.nextOrderNumber(tx);
      const invoiceNumber = await orderRepository.nextInvoiceNumber(tx);

      const created = await orderRepository.create(
        {
          orderNumber,
          invoiceNumber,
          customerId,
          subtotal,
          discount: input.discount,
          shipping: input.deliveryCharge,
          total,
          paymentMethod: input.paymentMethod,
          createdById: actingUser.id,
          assignedEmployeeId: assignedEmployeeId ?? undefined,
          notes: input.notes,
          articleNumber: input.articleNumber,
          estimatedDeliveryCharges: input.estimatedDeliveryCharges,
          items: resolved,
          address,
        },
        tx
      );

      await orderRepository.recordActivity(
        created.id,
        'Order created',
        actingUser.id,
        undefined,
        undefined,
        tx
      );

      await Promise.all(
        resolved.map((item) =>
          productRepository.recordStockHistory(
            {
              productId: item.productId,
              change: -item.quantity,
              reason: 'Order Placed',
              orderId: created.id,
              createdById: actingUser.id,
            },
            tx
          )
        )
      );

      // An initial payment (e.g. an advance) recorded at creation time — same ledger
      // path as addPayment, just inline in this transaction instead of a follow-up
      // request. Order.paymentStatus stays derived, never set directly (Phase 13).
      if (input.amountPaid > 0) {
        if (input.amountPaid > total) {
          throw new HttpError(
            400,
            `Amount paid (₹${input.amountPaid}) cannot exceed the order total (₹${total})`
          );
        }
        await paymentRepository.create(
          {
            orderId: created.id,
            amount: input.amountPaid,
            method: input.paymentMethod,
            createdById: actingUser.id,
          },
          tx
        );
        const newStatus = orderService.paidStatusFor(input.amountPaid, total);
        await orderRepository.setPaymentStatus(created.id, newStatus, tx);
        await orderRepository.recordActivity(
          created.id,
          'Payment added',
          actingUser.id,
          'PENDING',
          `+₹${input.amountPaid} (${input.paymentMethod}) → ${newStatus}`,
          tx
        );
        created.paymentStatus = newStatus;
      }

      return created;
    // Default interactive-transaction timeout is 5000ms; against the live Neon
    // serverless DB, inline customer creation (phones + address + activity) on top of
    // per-item stock decrements can genuinely exceed that under normal network latency
    // — confirmed by hitting the real timeout live, not a hypothetical. 15s gives real
    // headroom without masking an actual hang.
    }, { timeout: 15000 });

    return order;
  },

  async update(id: number, input: UpdateOrderInput, actingUser: ActingUser) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order not found');

    // Only the core item/pricing/address edit is dispatch-gated — reassigning who's
    // responsible for an order or correcting its expected delivery date are
    // administrative/tracking actions that stay useful (arguably more useful) after
    // dispatch, so they don't go through assertNotDispatched
    // (ORDER_DETAILS_UPGRADE_TODO.md §3).
    const isCoreEdit =
      input.items !== undefined ||
      input.discount !== undefined ||
      input.deliveryCharge !== undefined ||
      input.address !== undefined;
    if (isCoreEdit) {
      assertNotDispatched(existing, 'edit');
    }

    let assignedEmployeeName: string | undefined;
    if (input.assignedEmployeeId !== undefined) {
      const employee = await userRepository.findById(input.assignedEmployeeId);
      if (!employee || employee.role !== 'EMPLOYEE') {
        throw new HttpError(400, 'assignedEmployeeId does not refer to an existing Employee');
      }
      assignedEmployeeName = employee.name ?? employee.email;
    }

    return prisma.$transaction(async (tx) => {
      const activities: { action: string; oldValue?: string; newValue?: string }[] = [];
      let subtotal = existing.subtotal;
      let resolvedItems: ResolvedItem[] | undefined;

      if (input.items) {
        for (const oldItem of existing.items) {
          if (oldItem.productId) {
            await productRepository.incrementStock(oldItem.productId, oldItem.quantity, tx);
            await productRepository.recordStockHistory(
              {
                productId: oldItem.productId,
                change: oldItem.quantity,
                reason: 'Order Items Updated',
                orderId: id,
                createdById: actingUser.id,
              },
              tx
            );
          }
        }
        const result = await resolveOrderItems(input.items, tx);
        resolvedItems = result.resolved;
        subtotal = result.subtotal;
        activities.push({ action: 'Products updated' });

        await Promise.all(
          result.resolved.map((item) =>
            productRepository.recordStockHistory(
              {
                productId: item.productId,
                change: -item.quantity,
                reason: 'Order Items Updated',
                orderId: id,
                createdById: actingUser.id,
              },
              tx
            )
          )
        );
      }

      const discount = input.discount ?? existing.discount;
      const shipping = input.deliveryCharge ?? existing.shipping;
      const total = subtotal - discount + shipping;

      if (input.discount !== undefined && input.discount !== existing.discount) {
        activities.push({
          action: 'Discount updated',
          oldValue: String(existing.discount),
          newValue: String(input.discount),
        });
      }
      if (input.deliveryCharge !== undefined && input.deliveryCharge !== existing.shipping) {
        activities.push({
          action: 'Delivery charge updated',
          oldValue: String(existing.shipping),
          newValue: String(input.deliveryCharge),
        });
      }
      if (input.address) activities.push({ action: 'Delivery address updated' });
      if (input.notes !== undefined && input.notes !== existing.notes) {
        activities.push({ action: 'Notes updated' });
      }
      if (
        input.assignedEmployeeId !== undefined &&
        input.assignedEmployeeId !== existing.assignedEmployeeId
      ) {
        activities.push({
          action: 'Assigned employee changed',
          newValue: assignedEmployeeName,
        });
      }
      if (
        input.expectedDelivery !== undefined &&
        input.expectedDelivery.getTime() !== existing.expectedDelivery?.getTime()
      ) {
        activities.push({
          action: 'Expected delivery date changed',
          newValue: input.expectedDelivery.toDateString(),
        });
      }
      if (input.articleNumber !== undefined && input.articleNumber !== existing.articleNumber) {
        activities.push({
          action: 'Article number changed',
          oldValue: existing.articleNumber ?? undefined,
          newValue: input.articleNumber ?? undefined,
        });
      }
      if (
        input.estimatedDeliveryCharges !== undefined &&
        input.estimatedDeliveryCharges !== existing.estimatedDeliveryCharges
      ) {
        activities.push({
          action: 'Estimated delivery charges changed',
          oldValue: existing.estimatedDeliveryCharges?.toString(),
          newValue: input.estimatedDeliveryCharges?.toString(),
        });
      }

      const order = await orderRepository.update(
        id,
        {
          items: resolvedItems,
          subtotal,
          discount,
          shipping,
          total,
          address: input.address,
          notes: input.notes,
          assignedEmployeeId: input.assignedEmployeeId,
          expectedDelivery: input.expectedDelivery,
          articleNumber: input.articleNumber,
          estimatedDeliveryCharges: input.estimatedDeliveryCharges,
        },
        tx
      );

      await Promise.all(
        activities.map((a) =>
          orderRepository.recordActivity(id, a.action, actingUser.id, a.oldValue, a.newValue, tx)
        )
      );

      return order;
    }, { timeout: 15000 });
  },

  async updateStatus(
    id: number,
    orderStatus: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED',
    actingUser: ActingUser
  ) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order not found');
    if (existing.orderStatus === 'CANCELLED') {
      throw new HttpError(400, 'Cannot change the status of a cancelled order');
    }
    assertNotBackward(
      ORDER_STATUS_SEQUENCE,
      existing.orderStatus,
      orderStatus,
      actingUser,
      'order status'
    );

    const order = await orderRepository.updateStatus(id, orderStatus);
    await orderRepository.recordActivity(
      id,
      'Order status changed',
      actingUser.id,
      existing.orderStatus,
      orderStatus
    );
    return order;
  },

  // Phase 13 §2/§19-20: paymentStatus is derived from SUM(payments.amount), never set
  // directly — Unpaid at 0 paid, Partially Paid while 0 < paid < total, Paid once
  // paid >= total (REFUNDED is reachable only by whatever future flow needs it; this
  // computation never produces it on its own).
  paidStatusFor(paid: number, total: number): PaymentStatus {
    if (paid <= 0) return 'PENDING';
    if (paid >= total) return 'PAID';
    return 'PARTIAL';
  },

  async getPayments(id: number) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order not found');

    const payments = await paymentRepository.findByOrder(id);
    const paid = await paymentRepository.sumForOrder(id);
    return { payments, paid, remaining: existing.total - paid };
  },

  async addPayment(id: number, data: CreatePaymentInput, actingUser: ActingUser) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order not found');
    if (existing.orderStatus === 'CANCELLED') {
      throw new HttpError(400, 'Cannot record a payment against a cancelled order');
    }

    return prisma.$transaction(async (tx) => {
      // Re-sum inside the transaction, not from a value read before it started —
      // otherwise two concurrent payments could each pass a stale "remaining balance"
      // check and together overpay the order (same class of race
      // productRepository.decrementStock already guards against for stock).
      const paidSoFar = await paymentRepository.sumForOrder(id, tx);
      const remaining = existing.total - paidSoFar;
      if (data.amount > remaining) {
        throw new HttpError(
          400,
          `Payment of ₹${data.amount} exceeds the remaining balance of ₹${remaining}`
        );
      }

      const payment = await paymentRepository.create(
        {
          orderId: id,
          amount: data.amount,
          method: data.method,
          referenceNumber: data.referenceNumber,
          paymentDate: data.paymentDate,
          notes: data.notes,
          createdById: actingUser.id,
        },
        tx
      );

      const newPaid = paidSoFar + data.amount;
      const newStatus = orderService.paidStatusFor(newPaid, existing.total);
      const order = await orderRepository.setPaymentStatus(id, newStatus, tx);
      await orderRepository.recordActivity(
        id,
        'Payment added',
        actingUser.id,
        existing.paymentStatus,
        `+₹${data.amount} (${data.method}) → ${newStatus}`,
        tx
      );

      return { order, payment };
    });
  },

  async reversePayment(
    id: number,
    paymentId: number,
    reason: string,
    actingUser: ActingUser
  ) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order not found');

    const original = await paymentRepository.findById(paymentId);
    if (!original || original.orderId !== id) throw new NotFoundError('Payment not found');
    if (original.reversesPaymentId !== null) {
      throw new HttpError(400, 'Cannot reverse a payment that is itself a reversal');
    }
    const alreadyReversed = await paymentRepository.findReversalOf(paymentId);
    if (alreadyReversed) throw new HttpError(400, 'This payment has already been reversed');

    return prisma.$transaction(async (tx) => {
      const reversal = await paymentRepository.create(
        {
          orderId: id,
          amount: -original.amount,
          method: original.method,
          notes: reason,
          reversesPaymentId: original.id,
          createdById: actingUser.id,
        },
        tx
      );

      const paidSoFar = await paymentRepository.sumForOrder(id, tx);
      const newStatus = orderService.paidStatusFor(paidSoFar, existing.total);
      const order = await orderRepository.setPaymentStatus(id, newStatus, tx);
      await orderRepository.recordActivity(
        id,
        'Payment reversed',
        actingUser.id,
        `₹${original.amount} (${original.method})`,
        `${reason} → ${newStatus}`,
        tx
      );

      return { order, payment: reversal };
    });
  },

  async updateDeliveryStatus(
    id: number,
    data: { deliveryStatus: DeliveryStatus; location?: string; note?: string; receivedBy?: string },
    actingUser: ActingUser
  ) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order not found');
    assertNotBackward(
      DELIVERY_STATUS_SEQUENCE,
      existing.deliveryStatus,
      data.deliveryStatus,
      actingUser,
      'delivery status'
    );

    const order = await orderRepository.updateDeliveryStatus(id, {
      deliveryStatus: data.deliveryStatus,
      location: data.location,
      note: data.note,
      receivedBy: data.receivedBy,
      updatedById: actingUser.id,
    });
    await orderRepository.recordActivity(
      id,
      'Delivery status changed',
      actingUser.id,
      existing.deliveryStatus,
      data.deliveryStatus
    );
    return order;
  },

  getTracking(orderId: number) {
    return orderRepository.findTracking(orderId);
  },

  async cancel(id: number, reason: string, actingUser: ActingUser) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order not found');
    assertNotDispatched(existing, 'cancel');

    return prisma.$transaction(async (tx) => {
      for (const item of existing.items) {
        if (item.productId) {
          await productRepository.incrementStock(item.productId, item.quantity, tx);
          await productRepository.recordStockHistory(
            {
              productId: item.productId,
              change: item.quantity,
              reason: 'Order Cancelled',
              orderId: id,
              createdById: actingUser.id,
            },
            tx
          );
        }
      }

      const order = await orderRepository.cancel(
        id,
        { cancelledById: actingUser.id, cancellationReason: reason },
        tx
      );

      await orderRepository.recordActivity(
        id,
        'Order cancelled',
        actingUser.id,
        existing.orderStatus,
        'CANCELLED',
        tx
      );

      return order;
    }, { timeout: 15000 });
  },

  async reorder(sourceOrderId: number, actingUser: ActingUser) {
    const source = await orderRepository.findById(sourceOrderId);
    if (!source) throw new NotFoundError('Order not found');

    const items = source.items
      .filter((item): item is typeof item & { productId: number } => item.productId !== null)
      .map((item) => ({ productId: item.productId, quantity: item.quantity }));

    if (items.length === 0) {
      throw new HttpError(400, 'This order has no items that can be reordered');
    }

    // Deliberately re-resolves current prices/stock via create() rather than reusing
    // the source order's snapshotted prices — phases.md §24 is explicit about this.
    return orderService.create(
      {
        customerId: source.customerId,
        items,
        paymentMethod: source.paymentMethod,
        discount: 0,
        deliveryCharge: 0,
        amountPaid: 0,
        notes: undefined,
      },
      actingUser
    );
  },

  getActivity(orderId: number) {
    return orderRepository.findActivity(orderId);
  },

  // Trash (Phase 3 addendum). Nothing about the order's own data changes here —
  // it's still the same order, just hidden from every normal list until restored.
  async delete(id: number, actingUser: ActingUser) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order not found');

    const expiresAt = computeDeletionExpiry();
    const order = await orderRepository.softDelete(id, actingUser.id, expiresAt);
    await orderRepository.recordActivity(id, 'Moved to Trash', actingUser.id);
    await auditLogRepository.create({
      userId: actingUser.id,
      action: 'Deleted Order',
      meta: { orderId: id, orderNumber: existing.orderNumber, expiresAt: expiresAt.toISOString() },
    });
    return order;
  },

  async restore(id: number, actingUser: ActingUser) {
    const existing = await orderRepository.findTrashedById(id);
    if (!existing) throw new NotFoundError('This order is not in Trash');

    const order = await orderRepository.restore(id);
    await orderRepository.recordActivity(id, 'Restored from Trash', actingUser.id);
    await auditLogRepository.create({
      userId: actingUser.id,
      action: 'Restored Order',
      meta: { orderId: id, orderNumber: existing.orderNumber },
    });
    return order;
  },

  // actingUser is null when the daily purge (not an Admin) calls this. Nothing is
  // scrubbed — see orderRepository.permanentDelete's comment.
  async permanentlyDelete(id: number, actingUser: ActingUser | null) {
    const existing = await orderRepository.findTrashedById(id);
    if (!existing) throw new NotFoundError('This order is not in Trash');

    const order = await orderRepository.permanentDelete(id);
    await auditLogRepository.create({
      userId: actingUser?.id,
      action: 'Permanently Deleted Order',
      meta: {
        orderId: id,
        orderNumber: existing.orderNumber,
        reason: actingUser ? 'Admin action' : '10-day trash period expired',
      },
    });
    return order;
  },
};
