import { Request, Response } from 'express';
import { orderService } from '../services/order.service';
import { orderNoteService } from '../services/orderNote.service';
import {
  orderIdParamSchema,
  orderNumberParamSchema,
  createOrderSchema,
  updateOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  updateDeliveryStatusSchema,
  orderListQuerySchema,
} from '../schemas/order.schema';
import { createOrderNoteSchema } from '../schemas/orderNote.schema';
import { paymentIdParamSchema, createPaymentSchema, reversePaymentSchema } from '../schemas/payment.schema';
import { HttpError } from '../utils/httpError';
import { generateParcelSummaryPdf } from '../services/parcelSummary.service';

function requireActingUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

export const orderController = {
  async list(req: Request, res: Response) {
    const query = orderListQuerySchema.parse(req.query);
    const { data, total } = await orderService.list(requireActingUser(req), query);
    res.json({ data, total, page: query.page, pageSize: query.pageSize });
  },

  async getById(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const order = await orderService.getById(id);
    res.json(order);
  },

  async getByOrderNumber(req: Request, res: Response) {
    const { orderNumber } = orderNumberParamSchema.parse(req.params);
    const order = await orderService.getByOrderNumber(orderNumber, requireActingUser(req));
    res.json(order);
  },

  async create(req: Request, res: Response) {
    const input = createOrderSchema.parse(req.body);
    const order = await orderService.create(input, requireActingUser(req));
    res.status(201).json(order);
  },

  async update(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const input = updateOrderSchema.parse(req.body);
    const order = await orderService.update(id, input, requireActingUser(req));
    res.json(order);
  },

  async updateStatus(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const { orderStatus } = updateOrderStatusSchema.parse(req.body);
    const order = await orderService.updateStatus(id, orderStatus, requireActingUser(req));
    res.json(order);
  },

  async cancel(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const { reason } = cancelOrderSchema.parse(req.body);
    const order = await orderService.cancel(id, reason, requireActingUser(req));
    res.json(order);
  },

  async reorder(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const order = await orderService.reorder(id, requireActingUser(req));
    res.status(201).json(order);
  },

  async getPayments(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const result = await orderService.getPayments(id);
    res.json(result);
  },

  async addPayment(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const input = createPaymentSchema.parse(req.body);
    const result = await orderService.addPayment(id, input, requireActingUser(req));
    res.status(201).json(result);
  },

  async reversePayment(req: Request, res: Response) {
    const { id, paymentId } = paymentIdParamSchema.parse(req.params);
    const { reason } = reversePaymentSchema.parse(req.body);
    const result = await orderService.reversePayment(id, paymentId, reason, requireActingUser(req));
    res.json(result);
  },

  async updateDeliveryStatus(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const input = updateDeliveryStatusSchema.parse(req.body);
    const order = await orderService.updateDeliveryStatus(id, input, requireActingUser(req));
    res.json(order);
  },

  async getTracking(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const tracking = await orderService.getTracking(id);
    res.json(tracking);
  },

  async listNotes(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const notes = await orderNoteService.list(id);
    res.json(notes);
  },

  async addNote(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const { note } = createOrderNoteSchema.parse(req.body);
    const created = await orderNoteService.add(id, note, requireActingUser(req).id);
    res.status(201).json(created);
  },

  async getActivity(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const activity = await orderService.getActivity(id);
    res.json(activity);
  },

  async delete(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const order = await orderService.delete(id, requireActingUser(req));
    res.json(order);
  },

  async getParcelSummaryPdf(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const order = await orderService.getById(id);
    const pdf = await generateParcelSummaryPdf(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="parcel-summary-${order.orderNumber}.pdf"`
    );
    res.send(pdf);
  },
};
