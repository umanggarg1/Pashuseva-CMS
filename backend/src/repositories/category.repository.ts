import prisma from '../lib/prisma';

export const categoryRepository = {
  findMany(search?: string) {
    return prisma.productCategory.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  },

  findById(id: number) {
    return prisma.productCategory.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
  },

  findBySlug(slug: string) {
    return prisma.productCategory.findUnique({ where: { slug } });
  },

  create(data: { name: string; slug: string; description?: string }) {
    return prisma.productCategory.create({ data });
  },

  update(id: number, data: { name?: string; description?: string }) {
    return prisma.productCategory.update({ where: { id }, data });
  },

  updateStatus(id: number, active: boolean) {
    return prisma.productCategory.update({ where: { id }, data: { active } });
  },
};
