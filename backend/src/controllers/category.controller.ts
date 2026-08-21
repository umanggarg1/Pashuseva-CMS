import { Request, Response } from 'express';
import { categoryService } from '../services/category.service';
import {
  categoryIdParamSchema,
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
  categoryListQuerySchema,
} from '../schemas/category.schema';

export const categoryController = {
  async list(req: Request, res: Response) {
    const { search } = categoryListQuerySchema.parse(req.query);
    const categories = await categoryService.list(search);
    res.json(categories);
  },

  async getById(req: Request, res: Response) {
    const { id } = categoryIdParamSchema.parse(req.params);
    const category = await categoryService.getById(id);
    res.json(category);
  },

  async create(req: Request, res: Response) {
    const input = createCategorySchema.parse(req.body);
    const category = await categoryService.create(input);
    res.status(201).json(category);
  },

  async update(req: Request, res: Response) {
    const { id } = categoryIdParamSchema.parse(req.params);
    const input = updateCategorySchema.parse(req.body);
    const category = await categoryService.update(id, input);
    res.json(category);
  },

  async updateStatus(req: Request, res: Response) {
    const { id } = categoryIdParamSchema.parse(req.params);
    const { active } = updateCategoryStatusSchema.parse(req.body);
    const category = await categoryService.updateStatus(id, active);
    res.json(category);
  },
};
