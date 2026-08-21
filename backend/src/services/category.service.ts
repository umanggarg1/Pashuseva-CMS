import { categoryRepository } from '../repositories/category.repository';
import { HttpError, NotFoundError } from '../utils/httpError';
import { slugify } from '../schemas/category.schema';
import type { CreateCategoryInput, UpdateCategoryInput } from '../schemas/category.schema';

export const categoryService = {
  list(search?: string) {
    return categoryRepository.findMany(search);
  },

  async getById(id: number) {
    const category = await categoryRepository.findById(id);
    if (!category) throw new NotFoundError('Category not found');
    return category;
  },

  async create(input: CreateCategoryInput) {
    const slug = input.slug ? slugify(input.slug) : slugify(input.name);
    const existing = await categoryRepository.findBySlug(slug);
    if (existing) throw new HttpError(409, 'A category with this name/slug already exists');

    return categoryRepository.create({ name: input.name, description: input.description, slug });
  },

  async update(id: number, input: UpdateCategoryInput) {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw new NotFoundError('Category not found');
    return categoryRepository.update(id, input);
  },

  async updateStatus(id: number, active: boolean) {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw new NotFoundError('Category not found');
    return categoryRepository.updateStatus(id, active);
  },
};
