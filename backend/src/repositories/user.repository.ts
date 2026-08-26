import crypto from 'node:crypto';
import prisma from '../lib/prisma';
import type { Role, AccountStatus, DataScope } from '../generated/prisma/enums';

export const userRepository = {
  // findByEmail deliberately does NOT exclude trashed — signup/login need to see a
  // trashed account's email is still taken (it's anonymized only on permanent
  // delete, which replaces the email with a placeholder, freeing the real one).
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  // Excludes trashed by default — this is also what authenticate.ts calls on every
  // request, so trashing an Employee/Manager locks them out immediately, same as
  // suspending them.
  findById(id: number) {
    return prisma.user.findFirst({ where: { id, deletedAt: null } });
  },

  // Phase 18: managerId, when present, filters by EmployeeManager membership (was a
  // scalar equality before an Employee could report to several Managers at once).
  list(where?: { managerId?: number; search?: string; status?: AccountStatus }, take?: number) {
    const { search, managerId, ...rest } = where ?? {};
    return prisma.user.findMany({
      where: {
        ...rest,
        deletedAt: null,
        ...(managerId !== undefined && { managedBy: { some: { managerId } } }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { managedBy: { select: { managerId: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },

  // managerId is the Employee's initial (single) Manager at creation time — an
  // Employee can be added to additional Managers' teams afterward via
  // addToManagerTeam below, same as any other reassignment action.
  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: Role;
    managerId?: number;
  }) {
    const { managerId, ...rest } = data;
    return prisma.user.create({
      data: {
        ...rest,
        ...(managerId !== undefined && { managedBy: { create: [{ managerId }] } }),
      },
    });
  },

  // Phase 18: the Employees page's "add/remove from a Manager's team" action —
  // deliberately separate from create() above, since an Employee can now belong to
  // more than one team at once.
  getManagerIds(employeeId: number) {
    return prisma.employeeManager
      .findMany({ where: { employeeId }, select: { managerId: true } })
      .then((rows) => rows.map((r) => r.managerId));
  },

  async addToManagerTeam(employeeId: number, managerId: number) {
    await prisma.employeeManager.upsert({
      where: { employeeId_managerId: { employeeId, managerId } },
      create: { employeeId, managerId },
      update: {},
    });
  },

  async removeFromManagerTeam(employeeId: number, managerId: number) {
    await prisma.employeeManager.deleteMany({ where: { employeeId, managerId } });
  },

  // Public signup (Phase 15) — role/managerId stay null until an Admin approves;
  // status defaults to PENDING explicitly rather than relying on the column default
  // (ACTIVE), since that default exists for the Admin/Manager-created flow above.
  signup(data: { name: string; email: string; phone: string; passwordHash: string; requestedRole?: Role }) {
    return prisma.user.create({
      data: { ...data, status: 'PENDING' },
    });
  },

  update(id: number, data: { name?: string; email?: string }) {
    return prisma.user.update({ where: { id }, data });
  },

  updateStatus(id: number, status: AccountStatus) {
    return prisma.user.update({ where: { id }, data: { status } });
  },

  updateRole(id: number, role: Role) {
    return prisma.user.update({ where: { id }, data: { role } });
  },

  // Approve: grants the real role, activates the account, records who decided and
  // when. Reject: same review bookkeeping, no role — the account stays role-less
  // and blocked from login (REJECTED), same shape as SUSPENDED.
  approve(id: number, role: Role, reviewedById: number) {
    return prisma.user.update({
      where: { id },
      data: { role, status: 'ACTIVE', reviewedById, reviewedAt: new Date() },
    });
  },

  reject(id: number, reviewedById: number) {
    return prisma.user.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById, reviewedAt: new Date() },
    });
  },

  suspend(id: number, suspendedById: number) {
    return prisma.user.update({
      where: { id },
      data: { status: 'SUSPENDED', suspendedById, suspendedAt: new Date() },
    });
  },

  reactivate(id: number) {
    return prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', suspendedById: null, suspendedAt: null },
    });
  },

  // Phase 15 addendum — Products has no equivalent, see the DataScope enum comment.
  updateDataScope(
    id: number,
    data: { customerDataScope?: DataScope; orderDataScope?: DataScope }
  ) {
    return prisma.user.update({ where: { id }, data });
  },

  updatePasswordHash(id: number, passwordHash: string) {
    return prisma.user.update({ where: { id }, data: { passwordHash } });
  },

  updateLastLogin(id: number) {
    return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  },

  // Trash (Phase 3 addendum) — Employee/Manager only, never Admin (enforced in the
  // service layer, not here).
  findTrashedById(id: number) {
    return prisma.user.findFirst({ where: { id, deletedAt: { not: null } } });
  },

  findTrashed() {
    return prisma.user.findMany({
      where: { deletedAt: { not: null }, purgedAt: null },
      include: { deletedBy: { select: { id: true, name: true } } },
      orderBy: { deletedAt: 'desc' },
    });
  },

  softDelete(id: number, deletedById: number, deletionExpiresAt: Date) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById, deletionExpiresAt },
    });
  },

  restore(id: number) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, deletionExpiresAt: null },
    });
  },

  // Not a real DELETE FROM — every reference to a User is ON DELETE SET NULL, which
  // is technically FK-safe, but a real delete would silently blank out "Created by:
  // Amit Kumar"-style attribution everywhere. Anonymizes in place instead: name and
  // email replaced (email must stay unique, hence the placeholder), phone cleared,
  // password replaced with an unusable random hash as defense-in-depth (findById
  // already excludes this row entirely, so login was already impossible either way).
  permanentDelete(id: number) {
    return prisma.user.update({
      where: { id },
      data: {
        name: `Deleted Employee #${id}`,
        email: `deleted-user-${id}@deleted.invalid`,
        phone: null,
        passwordHash: crypto.randomBytes(32).toString('hex'),
        purgedAt: new Date(),
      },
    });
  },

  findExpired() {
    return prisma.user.findMany({
      where: { deletedAt: { not: null }, purgedAt: null, deletionExpiresAt: { lte: new Date() } },
      select: { id: true, name: true },
    });
  },
};
