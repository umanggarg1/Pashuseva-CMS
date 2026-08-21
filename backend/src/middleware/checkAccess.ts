import { NextFunction, Request, Response } from 'express';
import { customerRepository } from '../repositories/customer.repository';
import { orderRepository } from '../repositories/order.repository';
import { HttpError, NotFoundError } from '../utils/httpError';
import { hasCustomerDataAccess, hasOrderDataAccess } from '../utils/dataScope';

export async function checkCustomerAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, 'Not authenticated');

    const id = Number(req.params.id);
    const customer = await customerRepository.findAssignmentById(id);
    if (!customer) throw new NotFoundError('Customer not found');

    if (!hasCustomerDataAccess(req.user, req.user.customerDataScope, customer)) {
      throw new HttpError(403, 'You do not have access to this customer');
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Scoped by the order's customer's live assignment, not Order.assignedEmployeeId —
// see phases.md §44 for why.
export async function checkOrderAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, 'Not authenticated');

    const id = Number(req.params.id);
    const order = await orderRepository.findAssignmentById(id);
    if (!order) throw new NotFoundError('Order not found');

    if (!hasOrderDataAccess(req.user, req.user.orderDataScope, order)) {
      throw new HttpError(403, 'You do not have access to this order');
    }
    next();
  } catch (err) {
    next(err);
  }
}
