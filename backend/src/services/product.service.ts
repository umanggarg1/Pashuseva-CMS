import { Prisma } from '../generated/prisma/client';
import { productRepository } from '../repositories/product.repository';
import { categoryRepository } from '../repositories/category.repository';
import { auditLogRepository } from '../repositories/auditLog.repository';
import { HttpError, NotFoundError } from '../utils/httpError';
import { computeDeletionExpiry } from '../utils/trash';
import type {
  CreateProductInput,
  UpdateProductInput,
  SuggestSkuQuery,
  ProductListQuery,
  AddStockInput,
  AdjustStockInput,
} from '../schemas/product.schema';

const SKU_PREFIX = 'PASH';

// Deterministic per-category abbreviation, derived from the category's (already-
// unique) slug rather than a new stored field — recomputed on every call so it stays
// in sync if the category is later renamed. Collision-checked against every other
// category's abbreviation at the same length, extending the length only for the
// categories that actually collide, so most stores never see anything past 3 letters.
function slugLetters(slug: string, length: number): string {
  const letters = slug.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return letters.slice(0, length) || 'GEN';
}

async function categoryAbbreviation(categoryId: number | undefined): Promise<string> {
  if (!categoryId) return 'GEN';
  const category = await categoryRepository.findById(categoryId);
  if (!category) return 'GEN';

  const allCategories = await categoryRepository.findMany();
  for (let length = 3; length <= 6; length++) {
    const candidate = slugLetters(category.slug, length);
    const collides = allCategories.some(
      (c) => c.id !== category.id && slugLetters(c.slug, length) === candidate
    );
    if (!collides) return candidate;
  }
  return slugLetters(category.slug, 6);
}

// Weight units (G/KG/ML/L) are already the exact shorthand wanted in the SKU, so no
// separate formatting table is needed — e.g. weightValue=1, weightUnit='KG' -> "1KG".
function weightSegment(weightValue?: number, weightUnit?: string): string | null {
  if (weightValue === undefined || weightUnit === undefined) return null;
  return `${weightValue}${weightUnit}`;
}

// First word of the product name, e.g. "Calcium and Mineral" -> "CAL". Deterministic
// (unlike trying to pick out a "meaningful" word from anywhere in the name) and, in
// practice, usually is the meaningful word — most product names lead with the active
// ingredient/product type ("Calcium...", "Feed...", "Medicine..."). Collisions between
// products (two different "Cow ..." products both -> "COW") are expected and fine:
// the category segment plus the sequence number still keep every SKU unique.
function productAbbreviation(name: string | undefined): string | null {
  if (!name) return null;
  const firstWord = name.trim().split(/\s+/)[0] ?? '';
  const letters = firstWord.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return letters.slice(0, 3) || null;
}

function buildProductWhere(query: ProductListQuery): Prisma.ProductWhereInput {
  return {
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.active !== undefined && { active: query.active }),
    ...(query.stock === 'out' && { availableQty: { lte: 0 } }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { sku: { contains: query.search, mode: 'insensitive' as const } },
        { category: { name: { contains: query.search, mode: 'insensitive' as const } } },
      ],
    }),
  };
}

async function assertCategoryIsActive(categoryId: number | undefined | null) {
  if (categoryId === undefined || categoryId === null) return;
  const category = await categoryRepository.findById(categoryId);
  if (!category) throw new HttpError(400, 'categoryId does not refer to an existing category');
  if (!category.active) {
    throw new HttpError(400, 'This category is deactivated and cannot be selected for products');
  }
}

export const productService = {
  async list(query: ProductListQuery) {
    const where = buildProductWhere(query);

    if (query.stock === 'low') {
      const all = await productRepository.findAllMatching(where);
      const filtered = all
        .filter((p) => p.availableQty > 0 && p.availableQty < p.minimumStock)
        .sort((a, b) => {
          const dir = query.sortDir === 'asc' ? 1 : -1;
          const key = query.sortBy;
          if (a[key] < b[key]) return -1 * dir;
          if (a[key] > b[key]) return 1 * dir;
          return 0;
        });
      const skip = (query.page - 1) * query.pageSize;
      return { data: filtered.slice(skip, skip + query.pageSize), total: filtered.length };
    }

    const skip = (query.page - 1) * query.pageSize;
    return productRepository.findMany(where, {
      skip,
      take: query.pageSize,
      orderBy: { [query.sortBy]: query.sortDir },
    });
  },

  async getById(id: number) {
    const product = await productRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    return product;
  },

  // A suggestion, not a reservation — the actual uniqueness check happens in create()
  // as normal, so a rare race between two admins previewing the same combo at once
  // just surfaces as the existing "SKU already exists" 409, same as any manually
  // typed duplicate SKU today.
  async suggestSku(query: SuggestSkuQuery) {
    const categoryAbbr = await categoryAbbreviation(query.categoryId);
    const productAbbr = productAbbreviation(query.name);
    const weight = weightSegment(query.weightValue, query.weightUnit);
    const count = await productRepository.countByCategory(query.categoryId ?? null);

    const buildSku = (seq: number) =>
      [SKU_PREFIX, categoryAbbr, productAbbr, weight, String(seq).padStart(3, '0')]
        .filter(Boolean)
        .join('-');

    let seq = count + 1;
    let sku = buildSku(seq);
    while (await productRepository.findBySku(sku)) {
      seq += 1;
      sku = buildSku(seq);
    }
    return sku;
  },

  async create(input: CreateProductInput, actingUserId: number) {
    const existingSku = await productRepository.findBySku(input.sku);
    if (existingSku) throw new HttpError(409, 'A product with this SKU already exists');

    await assertCategoryIsActive(input.categoryId);

    const product = await productRepository.create({ ...input, createdById: actingUserId });
    await productRepository.recordActivity(product.id, 'Product created', actingUserId);
    return product;
  },

  async update(id: number, input: UpdateProductInput, actingUserId: number) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');

    if (input.sku && input.sku !== existing.sku) {
      const existingSku = await productRepository.findBySku(input.sku);
      if (existingSku) throw new HttpError(409, 'A product with this SKU already exists');
    }

    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      await assertCategoryIsActive(input.categoryId);
    }

    const activities: string[] = [];
    if (input.price !== undefined && input.price !== existing.price) {
      activities.push(`Price changed ₹${existing.price} → ₹${input.price}`);
    }
    if (input.availableQty !== undefined && input.availableQty !== existing.availableQty) {
      activities.push(`Stock updated ${existing.availableQty} → ${input.availableQty}`);
    }

    const product = await productRepository.update(id, input);
    await Promise.all(
      activities.map((activity) => productRepository.recordActivity(id, activity, actingUserId))
    );
    return product;
  },

  async updateStatus(id: number, active: boolean, actingUserId: number) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');

    const product = await productRepository.updateStatus(id, active);
    await productRepository.recordActivity(
      id,
      active ? 'Product activated' : 'Product deactivated',
      actingUserId
    );
    return product;
  },

  getActivity(productId: number) {
    return productRepository.findActivity(productId);
  },

  async addStock(id: number, input: AddStockInput, actingUserId: number) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');

    const product = await productRepository.addStock(id, {
      quantity: input.quantity,
      reason: input.reason,
      note: input.note,
      createdById: actingUserId,
    });
    await productRepository.recordActivity(
      id,
      `Stock added: +${input.quantity} (${input.reason})`,
      actingUserId
    );
    return product;
  },

  async adjustStock(id: number, input: AdjustStockInput, actingUserId: number) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');

    const product = await productRepository.adjustStock(id, {
      adjustment: input.adjustment,
      reason: input.reason,
      note: input.note,
      createdById: actingUserId,
    });
    if (!product) {
      throw new HttpError(
        400,
        `Adjustment would take stock below 0. Available: ${existing.availableQty}`
      );
    }
    await productRepository.recordActivity(
      id,
      `Stock adjusted: ${input.adjustment > 0 ? '+' : ''}${input.adjustment} (${input.reason})`,
      actingUserId
    );
    return product;
  },

  getStockHistory(productId: number) {
    return productRepository.findStockHistory(productId);
  },

  // Trash (Phase 3 addendum).
  async delete(id: number, actingUserId: number) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');

    const expiresAt = computeDeletionExpiry();
    const product = await productRepository.softDelete(id, actingUserId, expiresAt);
    await productRepository.recordActivity(id, 'Moved to Trash', actingUserId);
    await auditLogRepository.create({
      userId: actingUserId,
      action: 'Deleted Product',
      meta: { productId: id, productName: existing.name, expiresAt: expiresAt.toISOString() },
    });
    return product;
  },

  async restore(id: number, actingUserId: number) {
    const existing = await productRepository.findTrashedById(id);
    if (!existing) throw new NotFoundError('This product is not in Trash');

    const product = await productRepository.restore(id);
    await productRepository.recordActivity(id, 'Restored from Trash', actingUserId);
    await auditLogRepository.create({
      userId: actingUserId,
      action: 'Restored Product',
      meta: { productId: id, productName: existing.name },
    });
    return product;
  },

  // actingUserId is undefined when the daily purge (not an Admin) calls this — the
  // one entity where this really is a DELETE FROM, see productRepository.permanentDelete.
  async permanentlyDelete(id: number, actingUserId?: number) {
    const existing = await productRepository.findTrashedById(id);
    if (!existing) throw new NotFoundError('This product is not in Trash');

    await productRepository.permanentDelete(id);
    await auditLogRepository.create({
      userId: actingUserId,
      action: 'Permanently Deleted Product',
      meta: {
        productId: id,
        productName: existing.name,
        reason: actingUserId ? 'Admin action' : '10-day trash period expired',
      },
    });
  },
};
