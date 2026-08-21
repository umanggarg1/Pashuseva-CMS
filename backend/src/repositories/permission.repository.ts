import prisma from '../lib/prisma';

export const permissionRepository = {
  async getForUser(userId: number) {
    const rows = await prisma.userPermission.findMany({ where: { userId } });
    return rows.map((r) => r.permission);
  },

  replaceForUser(userId: number, permissions: string[], grantedById?: number) {
    return prisma.$transaction([
      prisma.userPermission.deleteMany({ where: { userId } }),
      prisma.userPermission.createMany({
        data: permissions.map((permission) => ({ userId, permission, grantedById })),
      }),
    ]);
  },
};
