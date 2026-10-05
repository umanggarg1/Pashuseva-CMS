import { formatWeight, packagingUnitLabel } from '@/lib/productUnits';

import { InfoGrid, MiniTable, Section } from './parts';
import { fmtDate, fmtDateTime, money, who, type UserRef } from './format';

export interface TrashProduct {
  id: number;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  weightValue: number | null;
  weightUnit: string | null;
  unit: string | null;
  availableQty: number;
  minimumStock: number;
  active: boolean;
  createdAt: string;
  category: { id: number; name: string } | null;
  createdBy: UserRef | null;
  stockHistory: {
    id: number;
    change: number;
    reason: string;
    note: string | null;
    createdAt: string;
    createdBy: UserRef | null;
    order: { orderNumber: string } | null;
  }[];
  activities: { id: number; activity: string; createdAt: string; createdBy: UserRef | null }[];
}

// Phase 27: read-only view of a trashed product (its real fields — there is no
// dealer/discount price or size on Product).
export default function ProductTrashDetail({ p }: { p: TrashProduct }) {
  return (
    <>
      <Section title="Product Information">
        <InfoGrid
          rows={[
            ['Name', p.name],
            ['SKU', p.sku],
            ['Category', p.category?.name ?? '—'],
            ['Price', money(p.price)],
            ['Weight', formatWeight(p.weightValue, p.weightUnit) ?? '—'],
            ['Packaging unit', packagingUnitLabel(p.unit) ?? '—'],
            ['Available stock', String(p.availableQty)],
            ['Minimum stock', String(p.minimumStock)],
            ['Status', p.active ? 'Active' : 'Inactive'],
            ['Description', p.description ?? '—'],
            ['Created', `${fmtDate(p.createdAt)} by ${who(p.createdBy)}`],
          ]}
        />
      </Section>

      <Section title="Stock History">
        <MiniTable
          head={['When', 'Change', 'Reason', 'Order', 'Note', 'By']}
          empty="No stock movements."
          rows={p.stockHistory.map((s) => [
            fmtDateTime(s.createdAt),
            s.change > 0 ? `+${s.change}` : String(s.change),
            s.reason,
            s.order?.orderNumber ?? '—',
            s.note ?? '—',
            who(s.createdBy),
          ])}
        />
      </Section>

      <Section title="Activity">
        <MiniTable
          head={['When', 'By', 'Activity']}
          empty="No activity."
          rows={p.activities.map((a) => [fmtDateTime(a.createdAt), who(a.createdBy), a.activity])}
        />
      </Section>
    </>
  );
}
