import { Request, Response } from 'express';
import { productService } from '../services/product.service';
import {
  productIdParamSchema,
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
  productListQuerySchema,
  suggestSkuQuerySchema,
  addStockSchema,
  adjustStockSchema,
} from '../schemas/product.schema';
import { HttpError } from '../utils/httpError';

function requireActingUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

export const productController = {
  async list(req: Request, res: Response) {
    const query = productListQuerySchema.parse(req.query);
    const { data, total } = await productService.list(query);
    res.json({ data, total, page: query.page, pageSize: query.pageSize });
  },

  async getById(req: Request, res: Response) {
    const { id } = productIdParamSchema.parse(req.params);
    const product = await productService.getById(id);
    res.json(product);
  },

  async create(req: Request, res: Response) {
    const input = createProductSchema.parse(req.body);
    const product = await productService.create(input, requireActingUser(req).id);
    res.status(201).json(product);
  },

  async suggestSku(req: Request, res: Response) {
    const query = suggestSkuQuerySchema.parse(req.query);
    const sku = await productService.suggestSku(query);
    res.json({ sku });
  },

  async update(req: Request, res: Response) {
    const { id } = productIdParamSchema.parse(req.params);
    const input = updateProductSchema.parse(req.body);
    const product = await productService.update(id, input, requireActingUser(req).id);
    res.json(product);
  },

  async updateStatus(req: Request, res: Response) {
    const { id } = productIdParamSchema.parse(req.params);
    const { active } = updateProductStatusSchema.parse(req.body);
    const product = await productService.updateStatus(id, active, requireActingUser(req).id);
    res.json(product);
  },

  async getActivity(req: Request, res: Response) {
    const { id } = productIdParamSchema.parse(req.params);
    const activity = await productService.getActivity(id);
    res.json(activity);
  },

  async addStock(req: Request, res: Response) {
    const { id } = productIdParamSchema.parse(req.params);
    const input = addStockSchema.parse(req.body);
    const product = await productService.addStock(id, input, requireActingUser(req).id);
    res.json(product);
  },

  async adjustStock(req: Request, res: Response) {
    const { id } = productIdParamSchema.parse(req.params);
    const input = adjustStockSchema.parse(req.body);
    const product = await productService.adjustStock(id, input, requireActingUser(req).id);
    res.json(product);
  },

  async getStockHistory(req: Request, res: Response) {
    const { id } = productIdParamSchema.parse(req.params);
    const history = await productService.getStockHistory(id);
    res.json(history);
  },

  async delete(req: Request, res: Response) {
    const { id } = productIdParamSchema.parse(req.params);
    const product = await productService.delete(id, requireActingUser(req).id);
    res.json(product);
  },
};
