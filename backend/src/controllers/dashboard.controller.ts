import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';
import {
  salesReportQuerySchema,
  ordersReportQuerySchema,
  customersReportQuerySchema,
  paymentsReportQuerySchema,
} from '../schemas/dashboard.schema';
import { HttpError } from '../utils/httpError';

function requireActingUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

export const dashboardController = {
  async getSummary(req: Request, res: Response) {
    const summary = await dashboardService.getSummary(requireActingUser(req));
    res.json(summary);
  },

  async getSalesReport(req: Request, res: Response) {
    const query = salesReportQuerySchema.parse(req.query);
    const report = await dashboardService.getSalesReport(requireActingUser(req), query);
    res.json(report);
  },

  async getOrdersReport(req: Request, res: Response) {
    const query = ordersReportQuerySchema.parse(req.query);
    const report = await dashboardService.getOrdersReport(requireActingUser(req), query);
    res.json(report);
  },

  async getCustomersReport(req: Request, res: Response) {
    const query = customersReportQuerySchema.parse(req.query);
    const report = await dashboardService.getCustomersReport(requireActingUser(req), query);
    res.json(report);
  },

  async getProductsReport(req: Request, res: Response) {
    const report = await dashboardService.getProductsReport(requireActingUser(req));
    res.json(report);
  },

  async getPaymentsReport(req: Request, res: Response) {
    const query = paymentsReportQuerySchema.parse(req.query);
    const report = await dashboardService.getPaymentsReport(requireActingUser(req), query);
    res.json(report);
  },
};
