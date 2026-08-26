import { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { permissionService } from '../services/permission.service';
import {
  createUserSchema,
  updateUserSchema,
  userListQuerySchema,
  updateStatusSchema,
  updateRoleSchema,
  approveUserSchema,
  deleteUserSchema,
  userIdParamSchema,
  userManagerParamSchema,
  addManagerSchema,
} from '../schemas/user.schema';
import { updatePermissionsSchema } from '../schemas/permission.schema';
import { HttpError } from '../utils/httpError';

function requireActingUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

export const userController = {
  async list(req: Request, res: Response) {
    const query = userListQuerySchema.parse(req.query);
    const users = await userService.list(requireActingUser(req), query.search, query.status);
    res.json(users);
  },

  async create(req: Request, res: Response) {
    const input = createUserSchema.parse(req.body);
    const user = await userService.create(input, requireActingUser(req));
    res.status(201).json(user);
  },

  async update(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const input = updateUserSchema.parse(req.body);
    const user = await userService.update(id, input, requireActingUser(req));
    res.json(user);
  },

  async updateStatus(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const { status } = updateStatusSchema.parse(req.body);
    const user = await userService.updateStatus(id, status, requireActingUser(req));
    res.json(user);
  },

  async updateRole(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const { role } = updateRoleSchema.parse(req.body);
    const user = await userService.updateRole(id, role, requireActingUser(req));
    res.json(user);
  },

  async approve(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const input = approveUserSchema.parse(req.body);
    const user = await userService.approve(id, input, requireActingUser(req));
    res.json(user);
  },

  async reject(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const user = await userService.reject(id, requireActingUser(req));
    res.json(user);
  },

  async suspend(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const user = await userService.suspend(id, requireActingUser(req));
    res.json(user);
  },

  async reactivate(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const user = await userService.reactivate(id, requireActingUser(req));
    res.json(user);
  },

  async getPermissions(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const permissions = await permissionService.getForUser(id, requireActingUser(req));
    res.json({ permissions });
  },

  async updatePermissions(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const input = updatePermissionsSchema.parse(req.body);
    const updated = await permissionService.replaceForUser(id, input, requireActingUser(req));
    res.json({ permissions: updated });
  },

  // Phase 18 item 3: add/remove an Employee from an additional Manager's team.
  async addManagerTeam(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const { managerId } = addManagerSchema.parse(req.body);
    await userService.addManagerTeam(id, managerId, requireActingUser(req));
    res.status(204).send();
  },

  async removeManagerTeam(req: Request, res: Response) {
    const { id, managerId } = userManagerParamSchema.parse(req.params);
    await userService.removeManagerTeam(id, managerId, requireActingUser(req));
    res.status(204).send();
  },

  async getDeleteImpact(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const impact = await userService.getDeleteImpact(id, requireActingUser(req));
    res.json(impact);
  },

  async delete(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const { reassignToUserId } = deleteUserSchema.parse(req.body);
    const user = await userService.delete(id, requireActingUser(req), reassignToUserId);
    res.json(user);
  },
};
