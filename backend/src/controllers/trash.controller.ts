import { Request, Response } from 'express';
import { trashService } from '../services/trash.service';
import { customerService } from '../services/customer.service';
import { orderService } from '../services/order.service';
import { productService } from '../services/product.service';
import { userService } from '../services/user.service';
import {
  trashListQuerySchema,
  trashItemParamSchema,
  permanentDeleteConfirmSchema,
} from '../schemas/trash.schema';
import { HttpError } from '../utils/httpError';

function requireActingUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

export const trashController = {
  async list(req: Request, res: Response) {
    const { type } = trashListQuerySchema.parse(req.query);
    const items = await trashService.list(type);
    res.json({ data: items, total: items.length });
  },

  async restore(req: Request, res: Response) {
    const { type, id } = trashItemParamSchema.parse(req.params);
    const actingUser = requireActingUser(req);

    switch (type) {
      case 'customer':
        return res.json(await customerService.restore(id, actingUser));
      case 'order':
        return res.json(await orderService.restore(id, actingUser));
      case 'product':
        return res.json(await productService.restore(id, actingUser.id));
      case 'employee':
        return res.json(await userService.restore(id, actingUser));
    }
  },

  async permanentDelete(req: Request, res: Response) {
    const { type, id } = trashItemParamSchema.parse(req.params);
    permanentDeleteConfirmSchema.parse(req.body);
    const actingUser = requireActingUser(req);

    switch (type) {
      case 'customer':
        await customerService.permanentlyDelete(id, actingUser);
        break;
      case 'order':
        await orderService.permanentlyDelete(id, actingUser);
        break;
      case 'product':
        await productService.permanentlyDelete(id, actingUser.id);
        break;
      case 'employee':
        await userService.permanentlyDelete(id, actingUser);
        break;
    }
    res.status(204).send();
  },
};
