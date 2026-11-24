// Phase 32 B4: quantities, units and money exactly as the CRM stores them — always in
// English, in BOTH message languages (frozen language rules, PHASE32_TODO.md §4.3).

const UNIT_WORDS: Record<string, [string, string]> = {
  PIECE: ['Piece', 'Pieces'],
  PACKET: ['Packet', 'Packets'],
  BOX: ['Box', 'Boxes'],
  BAG: ['Bag', 'Bags'],
  BOTTLE: ['Bottle', 'Bottles'],
};

/**
 * `2 Bags`, `1 Packet` for the PackagingUnit values (matched case-insensitively, so the
 * legacy "Bag"/"Packet" text on ORD-2026-000010…12 reads the same); any other stored
 * text is kept as-is in brackets (`2 (10 kg)`); no unit → just the number.
 */
export function formatQuantity(quantity: number, unit: string | null | undefined): string {
  const u = (unit ?? '').trim();
  if (u === '') return `${quantity}`;
  const words = UNIT_WORDS[u.toUpperCase()];
  if (words) return `${quantity} ${quantity === 1 ? words[0] : words[1]}`;
  return `${quantity} (${u})`;
}

/**
 * Indian digit grouping (en-IN, same as the parcel label): 1,250 / 1,25,000.
 * Whole rupees without decimals; otherwise exactly 2 decimals (1,234.50).
 */
export function formatRupees(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toLocaleString('en-IN');
  return rounded.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
