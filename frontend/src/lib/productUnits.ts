// Packaging type (was free text, now a fixed dropdown) and net weight/quantity
// (weightValue + weightUnit) for products. Kept as two separate concepts: a product's
// weight (1kg) is not the same thing as how it's packaged (Bag) — see Products.tsx's
// Add/Edit forms.
export const PACKAGING_UNIT_OPTIONS = [
  { value: 'PIECE', label: 'Piece' },
  { value: 'PACKET', label: 'Packet' },
  { value: 'BOX', label: 'Box' },
  { value: 'BAG', label: 'Bag' },
  { value: 'BOTTLE', label: 'Bottle' },
] as const;

export const WEIGHT_UNIT_OPTIONS = [
  { value: 'G', label: 'g' },
  { value: 'KG', label: 'kg' },
  { value: 'ML', label: 'ml' },
  { value: 'L', label: 'litre' },
] as const;

// Falls back to the raw value for any historical free-text `unit` that predates the
// fixed dropdown (e.g. old order-item snapshots) — displays as typed rather than
// disappearing.
export function packagingUnitLabel(unit: string | null | undefined): string | null {
  if (!unit) return null;
  return PACKAGING_UNIT_OPTIONS.find((o) => o.value === unit)?.label ?? unit;
}

export function weightUnitLabel(unit: string | null | undefined): string | null {
  if (!unit) return null;
  return WEIGHT_UNIT_OPTIONS.find((o) => o.value === unit)?.label ?? unit;
}

export function formatWeight(
  value: number | null | undefined,
  unit: string | null | undefined
): string | null {
  if (value === null || value === undefined || !unit) return null;
  return `${value} ${weightUnitLabel(unit)}`;
}
