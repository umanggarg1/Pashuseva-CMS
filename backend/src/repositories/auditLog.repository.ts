import prisma from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';

export const auditLogRepository = {
  // userId omitted/undefined means the system performed the action (the daily
  // Trash purge), not an Admin — shown as "System" rather than a person.
  create(data: { userId?: number; action: string; meta?: Prisma.InputJsonValue }) {
    return prisma.auditLog.create({
      data: { userId: data.userId, action: data.action, meta: data.meta },
    });
  },
};
