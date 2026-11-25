/**
 * Standalone verification for Phase 32 Q18: the shared total-weight rule.
 *
 * This project has no test runner, so this is a plain script:
 *     npx ts-node src/utils/orderWeight.verify.ts
 * Exits 0 when every case matches, 1 otherwise.
 */
import { formatTotalWeight, getOrderTotalWeight, itemGrams, WeightItem } from './orderWeight';

const kg = (v: number, q = 1): WeightItem => ({ quantity: q, product: { weightValue: v, weightUnit: 'KG' } });
const g = (v: number, q = 1): WeightItem => ({ quantity: q, product: { weightValue: v, weightUnit: 'G' } });

const cases: [string, WeightItem[], number | null][] = [
  ['all known (KG + G)', [kg(5, 2), g(500)], 10500],
  ['single KG item', [kg(5)], 5000],
  ['single G item', [g(750)], 750],
  ['one item without weight → no total', [kg(5), { quantity: 1, product: { weightValue: null, weightUnit: null } }], null],
  ['weight value but no unit → unknown → no total', [kg(5), { quantity: 1, product: { weightValue: 2, weightUnit: null } }], null],
  ['unit but no value → unknown → no total', [kg(5), { quantity: 1, product: { weightValue: null, weightUnit: 'KG' } }], null],
  ['ML (volume) counts as unknown → no total', [kg(5), { quantity: 1, product: { weightValue: 500, weightUnit: 'ML' } }], null],
  ['L (volume) counts as unknown → no total', [{ quantity: 2, product: { weightValue: 1, weightUnit: 'L' } }], null],
  ['deleted product (no product) → no total', [kg(5), { quantity: 1, product: null }], null],
  ['weight 0 → unknown → no total (never "0 kg")', [{ quantity: 1, product: { weightValue: 0, weightUnit: 'KG' } }], null],
  ['negative weight → unknown → no total', [{ quantity: 1, product: { weightValue: -1, weightUnit: 'KG' } }], null],
  ['no items → no total', [], null],
  ['all items unknown → no total', [{ quantity: 1, product: null }, { quantity: 3, product: { weightValue: null, weightUnit: null } }], null],
  ['decimal KG', [kg(2.5, 3)], 7500],
];

let failures = 0;
for (const [name, items, expected] of cases) {
  const got = getOrderTotalWeight(items);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — expected ${expected} got ${got}`}`);
}

const fmt: [number, string][] = [[10500, '10.50 KG'], [1000, '1.00 KG'], [999, '999 G'], [750, '750 G']];
for (const [grams, expected] of fmt) {
  const ok = formatTotalWeight(grams) === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  format ${grams} g → "${formatTotalWeight(grams)}"`);
}
const one = itemGrams(kg(5, 2)) === 10000 && itemGrams({ quantity: 1, product: null }) === null;
if (!one) failures++;
console.log(`${one ? 'PASS' : 'FAIL'}  itemGrams per line`);

const total = cases.length + fmt.length + 1;
console.log(`\n${total - failures}/${total} total-weight cases passed`);
process.exit(failures ? 1 : 0);
