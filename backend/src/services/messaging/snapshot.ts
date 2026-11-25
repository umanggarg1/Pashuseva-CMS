import type { PrismaClientOrTx } from '../../lib/prisma';
import { getOrderPaymentSummary } from '../orderPayment';
import type { ConfirmationSnapshot, DispatchSnapshot, MessageItem } from './templates/builders';

// Phase 32 B5 (PHASE32_TODO.md §18 B5): the facts a WhatsApp message shows, read from
// the SAVED order — never from the current product catalogue or from client input:
//   - product name / quantity / unit / line total come from OrderItem (the snapshot
//     taken when the order was placed), so later catalogue renames or price changes
//     never leak into a message;
//   - money comes ONLY from the shared B0 calculation (getOrderPaymentSummary);
//   - everything is read through the caller's transaction client, so a message created
//     inside order creation / dispatch sees exactly what that transaction wrote (e.g.
//     the Article No. saved by the auto-dispatch path a moment earlier).
// The built parameters are stored on the OutboundMessage row; retries never rebuild.

export interface OrderMessageSnapshot {
  orderId: number;
  orderNumber: string;
  customerId: number;
  orderCreatedAt: Date;
  confirmation: ConfirmationSnapshot;
  dispatch: DispatchSnapshot;
}

export async function loadOrderMessageSnapshot(
  client: PrismaClientOrTx,
  orderId: number
): Promise<OrderMessageSnapshot | null> {
  const order = await client.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      customerId: true,
      total: true,
      paymentStatus: true,
      articleNumber: true,
      customer: { select: { name: true } },
      items: {
        select: { productName: true, quantity: true, unit: true, totalPrice: true },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!order) return null;

  const items: MessageItem[] = order.items.map((i) => ({
    productName: i.productName,
    quantity: i.quantity,
    unit: i.unit,
    lineTotal: i.totalPrice,
  }));
  const confirmation: ConfirmationSnapshot = {
    customerName: order.customer.name,
    orderNumber: order.orderNumber,
    items,
  };
  const payment = await getOrderPaymentSummary(
    { id: order.id, total: order.total, paymentStatus: order.paymentStatus },
    client
  );
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    orderCreatedAt: order.createdAt,
    confirmation,
    dispatch: { ...confirmation, payment, articleNumber: order.articleNumber },
  };
}
