// Phase 32 Q18 (PHASE32_TODO.md §20.2): the ONE total-weight rule for an order, used
// by every place that shows an order's total weight (today: the parcel label).
//
//   Show Total Weight only when EVERY product in the order has a known weight.
//   If even one product's weight is unknown → no total at all (null): never a
//   partial total, an estimate, "0 kg", a blank or "N/A".
//
// "Known weight" = a linked product with weightValue > 0 and a MASS unit (G or KG).
// ML / L are volumes, not weights, so they count as unknown. A deleted product
// (productId null) is unknown too. Weight is read from the current Product record
// (it is not snapshotted on the order item — see §20.2 data note).

export interface WeightItem {
  quantity: number;
  product?: { weightValue: number | null; weightUnit: string | null } | null;
}

/** Grams for one order line, or null when its weight isn't known. */
export function itemGrams(item: WeightItem): number | null {
  const value = item.product?.weightValue;
  const unit = item.product?.weightUnit;
  if (value === null || value === undefined || !(value > 0)) return null;
  if (unit === 'KG') return value * 1000 * item.quantity;
  if (unit === 'G') return value * item.quantity;
  return null; // ML / L / missing unit
}

/** Total grams when every line's weight is known; otherwise null (hide the section). */
export function getOrderTotalWeight(items: WeightItem[]): number | null {
  if (items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    const g = itemGrams(item);
    if (g === null) return null;
    total += g;
  }
  return total > 0 ? total : null;
}

/** Display form (unchanged from the parcel label's existing format): "2.50 KG" / "750 G". */
export function formatTotalWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} KG` : `${grams} G`;
}
