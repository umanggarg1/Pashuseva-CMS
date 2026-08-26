import { Request, Response } from 'express';
import { customerService } from '../services/customer.service';
import { customerNoteService } from '../services/customerNote.service';
import {
  customerIdParamSchema,
  createCustomerSchema,
  updateCustomerSchema,
  customerListQuerySchema,
} from '../schemas/customer.schema';
import { createCustomerNoteSchema } from '../schemas/customerNote.schema';
import {
  assignCustomerSchema,
  reassignCustomerSchema,
  bulkAssignCustomerSchema,
  unassignCustomerSchema,
} from '../schemas/customerAssignment.schema';
import { HttpError } from '../utils/httpError';

function requireActingUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

export const customerController = {
  async list(req: Request, res: Response) {
    const query = customerListQuerySchema.parse(req.query);
    const { data, total } = await customerService.list(requireActingUser(req), query);
    res.json({ data, total, page: query.page, pageSize: query.pageSize });
  },

  async getById(req: Request, res: Response) {
    const { id } = customerIdParamSchema.parse(req.params);
    const customer = await customerService.getById(id, requireActingUser(req));
    res.json(customer);
  },

  async create(req: Request, res: Response) {
    const input = createCustomerSchema.parse(req.body);
    const customer = await customerService.create(input, requireActingUser(req));
    res.status(201).json(customer);
  },

  async update(req: Request, res: Response) {
    const { id } = customerIdParamSchema.parse(req.params);
    const input = updateCustomerSchema.parse(req.body);
    const customer = await customerService.update(id, input, requireActingUser(req));
    res.json(customer);
  },

  // Phase 19: manual status control is gone — see customerService's comment.

  async searchForOrder(req: Request, res: Response) {
    const search = String(req.query.search ?? '');
    const results = await customerService.searchForOrder(requireActingUser(req), search);
    res.json({ data: results });
  },

  async listNotes(req: Request, res: Response) {
    const { id } = customerIdParamSchema.parse(req.params);
    const notes = await customerNoteService.list(id);
    res.json(notes);
  },

  async addNote(req: Request, res: Response) {
    const { id } = customerIdParamSchema.parse(req.params);
    const { note } = createCustomerNoteSchema.parse(req.body);
    const created = await customerNoteService.add(id, note, requireActingUser(req).id);
    res.status(201).json(created);
  },

  async getActivity(req: Request, res: Response) {
    const { id } = customerIdParamSchema.parse(req.params);
    const activity = await customerService.getActivity(id, requireActingUser(req));
    res.json(activity);
  },

  async assign(req: Request, res: Response) {
    const { id } = customerIdParamSchema.parse(req.params);
    const { employeeId } = assignCustomerSchema.parse(req.body);
    const customer = await customerService.assign(id, employeeId, requireActingUser(req));
    res.json(customer);
  },

  async reassign(req: Request, res: Response) {
    const { id } = customerIdParamSchema.parse(req.params);
    const { employeeId } = reassignCustomerSchema.parse(req.body);
    const customer = await customerService.reassign(id, employeeId, requireActingUser(req));
    res.json(customer);
  },

  async unassign(req: Request, res: Response) {
    const { id } = customerIdParamSchema.parse(req.params);
    const { employeeId } = unassignCustomerSchema.parse(req.body);
    const customer = await customerService.unassign(id, employeeId, requireActingUser(req));
    res.json(customer);
  },

  async bulkAssign(req: Request, res: Response) {
    const { customerIds, employeeId } = bulkAssignCustomerSchema.parse(req.body);
    const result = await customerService.bulkAssign(
      customerIds,
      employeeId,
      requireActingUser(req)
    );
    res.json({ count: result.count });
  },

  async delete(req: Request, res: Response) {
    const { id } = customerIdParamSchema.parse(req.params);
    const customer = await customerService.delete(id, requireActingUser(req));
    res.json(customer);
  },
};
