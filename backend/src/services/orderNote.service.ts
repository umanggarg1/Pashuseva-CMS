import { orderNoteRepository } from '../repositories/orderNote.repository';
import { orderRepository } from '../repositories/order.repository';
import { NotFoundError } from '../utils/httpError';

export const orderNoteService = {
  async add(orderId: number, note: string, createdById: number) {
    const order = await orderRepository.findAssignmentById(orderId);
    if (!order) throw new NotFoundError('Order not found');

    return orderNoteRepository.create(orderId, note, createdById);
  },

  list(orderId: number) {
    return orderNoteRepository.listForOrder(orderId);
  },
};
