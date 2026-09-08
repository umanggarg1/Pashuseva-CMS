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
  orderExportFiltersSchema,
  type OrderExportFilters,
} from '../schemas/order.schema';
import { createOrderNoteSchema } from '../schemas/orderNote.schema';
import { paymentIdParamSchema, createPaymentSchema, reversePaymentSchema } from '../schemas/payment.schema';
import { HttpError } from '../utils/httpError';
import { generateParcelSummaryPdf } from '../services/parcelSummary.service';
import { generateOrdersExcel, generateOrdersPdf } from '../services/orderExport.service';

function requireActingUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

function formatDDMMYYYY(date: Date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

// Phase 21: the export PDF's summary header only names filters actually
// restricted (not "all") — see PHASE21_TODO.md's request text: an unfiltered
// export shows just the date range, not "Area: All | Payment: All | Delivery: All".
function buildExportSummaryMeta(filters: OrderExportFilters) {
  const dateRangeLabel =
    filters.dateFrom && filters.dateTo
      ? `${formatDDMMYYYY(filters.dateFrom)} – ${formatDDMMYYYY(filters.dateTo)}`
      : filters.dateFrom
        ? `From ${formatDDMMYYYY(filters.dateFrom)}`
        : filters.dateTo
          ? `Until ${formatDDMMYYYY(filters.dateTo)}`
          : 'All dates';

  const activeFilters: string[] = [];
  if (filters.district && filters.district.toLowerCase() !== 'all') {
    activeFilters.push(`Area: ${filters.district}`);
  }
  if (filters.payment !== 'all') {
    activeFilters.push(`Payment: ${filters.payment === 'paid' ? 'Paid' : 'Unpaid'}`);
  }
  if (filters.delivery !== 'all') {
    activeFilters.push(`Delivery: ${filters.delivery === 'delivered' ? 'Delivered' : 'Undelivered'}`);
  }

  return {
    dateRangeLabel,
    filterSummaryLine: activeFilters.length > 0 ? activeFilters.join(' | ') : null,
  };
}

// Shared by both exportExcel and exportPdf — same summary block (title, date
// range, active-filter line, Orders/Total/Paid/Unpaid) on both formats now
// that Excel's report also carries one, per PHASE21_TODO.md's Excel revision.
function buildExportSummary(rows: Awaited<ReturnType<typeof orderService.exportRows>>, filters: OrderExportFilters) {
  const totalAmount = rows.reduce((sum, r) => sum + r.total, 0);
  const paidAmount = rows.filter((r) => r.isPaid).reduce((sum, r) => sum + r.total, 0);
  const { dateRangeLabel, filterSummaryLine } = buildExportSummaryMeta(filters);
  return {
    dateRangeLabel,
    filterSummaryLine,
    orderCount: rows.length,
    totalAmount,
    paidAmount,
    unpaidAmount: totalAmount - paidAmount,
  };
}

export const orderController = {
  async list(req: Request, res: Response) {
    const query = orderListQuerySchema.parse(req.query);
    const { data, total } = await orderService.list(requireActingUser(req), query);
    res.json({ data, total, page: query.page, pageSize: query.pageSize });
  },

  // Phase 21: Orders export — count/excel/pdf all parse the same
  // orderExportFiltersSchema and go through orderService.exportCount/exportRows,
  // which both share buildOrderExportWhere. See PHASE21_TODO.md decision #9.
  async exportCount(req: Request, res: Response) {
    const filters = orderExportFiltersSchema.parse(req.query);
    const count = await orderService.exportCount(requireActingUser(req), filters);
    res.json({ count });
  },

  async exportExcel(req: Request, res: Response) {
    const filters = orderExportFiltersSchema.parse(req.query);
    const rows = await orderService.exportRows(requireActingUser(req), filters);
    const buffer = await generateOrdersExcel(rows, buildExportSummary(rows, filters));
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="orders-export.xlsx"');
    res.send(buffer);
  },

  async exportPdf(req: Request, res: Response) {
    const filters = orderExportFiltersSchema.parse(req.query);
    const rows = await orderService.exportRows(requireActingUser(req), filters);
    const buffer = await generateOrdersPdf(rows, buildExportSummary(rows, filters));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="orders-export.pdf"');
    res.send(buffer);
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
