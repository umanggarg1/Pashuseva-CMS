import prisma, { PrismaClientOrTx } from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import type { WeightUnit, PackagingUnit } from '../generated/prisma/enums';

export const productRepository = {
  // Every one of these excludes trashed products by default — Trash (Phase 3
  // addendum) has its own dedicated findTrashed/restore/permanentDelete below.
  async findMany(
    where: Prisma.ProductWhereInput,
    options: { skip: number; take: number; orderBy: Prisma.ProductOrderByWithRelationInput }
  ) {
    const whereActive = { ...where, deletedAt: null };
    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where: whereActive,
        include: { category: true },
        skip: options.skip,
        take: options.take,
        orderBy: options.orderBy,
      }),
      prisma.product.count({ where: whereActive }),
    ]);
    return { data, total };
  },

  findById(id: number, client: PrismaClientOrTx = prisma) {
    return client.product.findFirst({ where: { id, deletedAt: null }, include: { category: true } });
  },

  // Unpaginated fetch, used for the "low stock" filter — that comparison needs two
  // columns (availableQty vs minimumStock) so it can't be expressed as a single Prisma
  // where clause; the caller filters in memory over the *full* matching set, then
  // paginates the filtered result itself, instead of filtering a single already-paged
  // slice (which under-counts as soon as there are more rows than one page).
  findAllMatching(where: Prisma.ProductWhereInput) {
    return prisma.product.findMany({ where: { ...where, deletedAt: null }, include: { category: true } });
  },

  // Atomic, race-safe decrement: the WHERE clause re-checks stock at the DB level, so
  // two concurrent orders can't both pass a read-then-write stock check and oversell.
  // Returns false (no rows matched) if stock was insufficient at the moment of the update.
  async decrementStock(productId: number, quantity: number, client: PrismaClientOrTx = prisma) {
    const result = await client.product.updateMany({
      where: { id: productId, availableQty: { gte: quantity } },
      data: { availableQty: { decrement: quantity } },
    });
    return result.count > 0;
  },

  incrementStock(productId: number, quantity: number, client: PrismaClientOrTx = prisma) {
    return client.product.update({
      where: { id: productId },
      data: { availableQty: { increment: quantity } },
    });
  },

  recordStockHistory(
    data: {
      productId: number;
      change: number;
      reason: string;
      note?: string;
      orderId?: number;
      createdById?: number;
    },
    client: PrismaClientOrTx = prisma
  ) {
    return client.stockHistory.create({ data });
  },

  findStockHistory(productId: number) {
    return prisma.stockHistory.findMany({
      where: { productId },
      include: {
        createdBy: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  // Add Stock: always a positive increment, records who/why. Adjust Stock: any nonzero
  // delta (can correct a miscount downward), guarded so it can never take stock below 0.
  async addStock(
    productId: number,
    data: { quantity: number; reason: string; note?: string; createdById: number }
  ) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: productId },
        data: { availableQty: { increment: data.quantity } },
        include: { category: true },
      });
      await tx.stockHistory.create({
        data: {
          productId,
          change: data.quantity,
          reason: data.reason,
          note: data.note,
          createdById: data.createdById,
        },
      });
      return product;
    });
  },

  async adjustStock(
    productId: number,
    data: { adjustment: number; reason: string; note?: string; createdById: number }
  ) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.product.updateMany({
        where: { id: productId, availableQty: { gte: -data.adjustment } },
        data: { availableQty: { increment: data.adjustment } },
      });
      if (result.count === 0) return null;

      await tx.stockHistory.create({
        data: {
          productId,
          change: data.adjustment,
          reason: data.reason,
          note: data.note,
          createdById: data.createdById,
        },
      });
      return tx.product.findUnique({ where: { id: productId }, include: { category: true } });
    });
  },

  findBySku(sku: string) {
    return prisma.product.findUnique({ where: { sku } });
  },

  // Used by SKU auto-generation to compute a per-category sequence number.
  // categoryId: null counts uncategorized products as their own bucket ("GEN").
  countByCategory(categoryId: number | null) {
    return prisma.product.count({ where: { categoryId } });
  },

  create(data: {
    name: string;
    description?: string;
    categoryId?: number;
    sku: string;
    price: number;
    weightValue?: number;
    weightUnit?: WeightUnit;
    unit?: PackagingUnit;
    availableQty: number;
    minimumStock: number;
    image?: string;
    createdById?: number;
  }) {
    return prisma.product.create({ data, include: { category: true } });
  },

  update(
    id: number,
    data: {
      name?: string;
      description?: string;
      categoryId?: number | null;
      sku?: string;
      price?: number;
      weightValue?: number | null;
      weightUnit?: WeightUnit | null;
      unit?: PackagingUnit | null;
      availableQty?: number;
      minimumStock?: number;
      image?: string;
    }
  ) {
    return prisma.product.update({ where: { id }, data, include: { category: true } });
  },

  updateStatus(id: number, active: boolean) {
    return prisma.product.update({ where: { id }, data: { active } });
  },

  recordActivity(productId: number, activity: string, createdById: number) {
    return prisma.productActivity.create({ data: { productId, activity, createdById } });
  },

  findActivity(productId: number) {
    return prisma.productActivity.findMany({
      where: { productId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  // Trash (Phase 3 addendum).
  findTrashedById(id: number) {
    return prisma.product.findFirst({ where: { id, deletedAt: { not: null } } });
  },

  findTrashed() {
    return prisma.product.findMany({
      where: { deletedAt: { not: null } },
      include: { deletedBy: { select: { id: true, name: true } } },
      orderBy: { deletedAt: 'desc' },
    });
  },

  softDelete(id: number, deletedById: number, deletionExpiresAt: Date) {
    return prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById, deletionExpiresAt },
    });
  },

  restore(id: number) {
    return prisma.product.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, deletionExpiresAt: null },
    });
  },

  // Product is the one entity where this really is a DELETE FROM — OrderItem's own
  // productId is ON DELETE SET NULL, and productName/productSKU/unitPrice are
  // already snapshotted there independently, so no historical order display breaks.
  // StockHistory/ProductActivity have no such SET NULL (and nowhere to display once
  // the product itself is gone), so they're deleted first in the same transaction —
  // without this, Postgres blocks the delete with a foreign-key violation on any
  // product that has ever had stock added/adjusted or any recorded activity, which in
  // practice is nearly every real product.
  permanentDelete(id: number) {
    return prisma.$transaction([
      prisma.stockHistory.deleteMany({ where: { productId: id } }),
      prisma.productActivity.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);
  },

  findExpired() {
    return prisma.product.findMany({
      where: { deletedAt: { not: null }, deletionExpiresAt: { lte: new Date() } },
      select: { id: true, name: true },
    });
  },
};
