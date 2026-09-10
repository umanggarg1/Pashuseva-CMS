/**
 * Standalone verification: `activeOrderWhere` (the Prisma where-clause) must agree
 * with `isOrderActive` (the JS predicate) on every possible order status pair.
 * They're two hand-kept shapes of one rule (Phase 18 follow-up) — this catches drift.
 *
 * This project has no test runner, so this is a plain script:
 *     npx ts-node src/utils/activeOrder.verify.ts
 * Exits 0 if they agree on all 60 combinations, 1 (with a diff table) if not.
 *
 * A tiny evaluator interprets `activeOrderWhere` directly. It supports only the
 * operators that clause currently uses (scalar eq, `notIn`, and a nested `NOT`);
 * anything else throws, so changing `activeOrderWhere` to an unsupported shape
 * fails loudly here rather than silently passing.
 */
import { OrderStatus, DeliveryStatus } from '../generated/prisma/enums';
import { activeOrderWhere, isOrderActive } from './activeOrder';

type Row = { orderStatus: OrderStatus; deliveryStatus: DeliveryStatus };

function evalWhere(where: Record<string, unknown>, row: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'NOT') {
      return !evalWhere(cond as Record<string, unknown>, row);
    }
    if (key === 'AND') {
      return (cond as Record<string, unknown>[]).every((c) => evalWhere(c, row));
    }
    if (key === 'OR') {
      return (cond as Record<string, unknown>[]).some((c) => evalWhere(c, row));
    }

    const actual = row[key];
    if (cond !== null && typeof cond === 'object') {
      const op = cond as Record<string, unknown>;
      if ('notIn' in op) return !(op.notIn as unknown[]).includes(actual);
      if ('in' in op) return (op.in as unknown[]).includes(actual);
      if ('not' in op) return actual !== op.not;
      if ('equals' in op) return actual === op.equals;
      throw new Error(`activeOrder.verify: unsupported operator on "${key}": ${JSON.stringify(op)}`);
    }
    // bare scalar → equality
    return actual === cond;
  });
}

function verify(): void {
  const orderStatuses = Object.values(OrderStatus);
  const deliveryStatuses = Object.values(DeliveryStatus);

  const mismatches: { row: Row; predicate: boolean; where: boolean }[] = [];
  let total = 0;

  for (const orderStatus of orderStatuses) {
    for (const deliveryStatus of deliveryStatuses) {
      total++;
      const row: Row = { orderStatus, deliveryStatus };
      const predicate = isOrderActive(row);
      const where = evalWhere(
        activeOrderWhere as Record<string, unknown>,
        row as Record<string, unknown>
      );
      if (predicate !== where) mismatches.push({ row, predicate, where });
    }
  }

  if (mismatches.length === 0) {
    console.log(
      `activeOrderWhere ≡ isOrderActive — all ${total} (orderStatus × deliveryStatus) combinations agree.`
    );
    process.exit(0);
  }
  console.error(
    `activeOrderWhere DISAGREES with isOrderActive on ${mismatches.length}/${total} combinations:\n`
  );
  for (const m of mismatches) {
    console.error(
      `  ${m.row.orderStatus.padEnd(16)} ${m.row.deliveryStatus.padEnd(18)}  isOrderActive=${m.predicate}  activeOrderWhere=${m.where}`
    );
  }
  process.exit(1);
}

if (require.main === module) verify();
