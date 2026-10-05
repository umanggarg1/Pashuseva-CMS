import { Link } from 'react-router-dom';

import { InfoGrid, MiniTable, Section, TrashedTag } from './parts';
import { fmtDate, fmtDateTime, label, money, who, type UserRef } from './format';

export interface TrashCustomer {
  id: number;
  name: string;
  email: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  createdBy: UserRef | null;
  assignedManager: UserRef | null;
  assignedEmployees: { employee: UserRef }[];
  phones: { id: number; phone: string; label: string | null; isPrimary: boolean }[];
  addresses: {
    id: number;
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    district: string | null;
    state: string;
    pincode: string;
  }[];
  customerNotes: { id: number; note: string; createdAt: string; createdBy: UserRef | null }[];
  activities: { id: number; activity: string; createdAt: string; createdBy: UserRef | null }[];
  orders: {
    id: number;
    orderNumber: string;
    orderDate: string;
    total: number;
    orderStatus: string;
    deliveryStatus: string;
    paymentStatus: string;
    deletedAt: string | null;
  }[];
}

// Phase 27: read-only view of a trashed customer. Its orders are listed and linked —
// to the normal Order Details if active, or to its own Trash detail if trashed too.
export default function CustomerTrashDetail({ c }: { c: TrashCustomer }) {
  return (
    <>
      <Section title="Customer Information">
        <InfoGrid
          rows={[
            ['Name', c.name],
            [
              'Phone',
              c.phones.length
                ? c.phones.map((p) => `${p.phone}${p.label ? ` (${p.label})` : ''}${p.isPrimary ? ' · primary' : ''}`).join(', ')
                : '—',
            ],
            ['Email', c.email ?? '—'],
            [
              'Address',
              c.addresses.length
                ? c.addresses
                    .map((a) => [a.line1, a.line2, a.landmark, a.city, a.district, a.state, a.pincode].filter(Boolean).join(', '))
                    .join(' | ')
                : '—',
            ],
            ['Status', label(c.status)],
            ['Assigned Manager', who(c.assignedManager)],
            ['Assigned Employees', c.assignedEmployees.map((a) => a.employee.name).filter(Boolean).join(', ') || '—'],
            ['Notes', c.notes ?? '—'],
            ['Created', `${fmtDate(c.createdAt)} by ${who(c.createdBy)}`],
          ]}
        />
      </Section>

      <Section title={`Orders (${c.orders.length})`}>
        <MiniTable
          head={['Order', 'Date', 'Amount', 'Order Status', 'Delivery', 'Payment']}
          empty="No orders."
          rows={c.orders.map((o) => [
            <>
              <Link
                to={o.deletedAt ? `/trash/order/${o.id}` : `/orders/${o.orderNumber}`}
                className="font-medium text-primary hover:underline"
              >
                {o.orderNumber}
              </Link>
              {o.deletedAt && <TrashedTag />}
            </>,
            fmtDate(o.orderDate),
            money(o.total),
            label(o.orderStatus),
            label(o.deliveryStatus),
            label(o.paymentStatus),
          ])}
        />
      </Section>

      <Section title="Notes">
        <MiniTable
          head={['When', 'By', 'Note']}
          empty="No notes."
          rows={c.customerNotes.map((n) => [fmtDateTime(n.createdAt), who(n.createdBy), n.note])}
        />
      </Section>

      <Section title="Activity">
        <MiniTable
          head={['When', 'By', 'Activity']}
          empty="No activity."
          rows={c.activities.map((a) => [fmtDateTime(a.createdAt), who(a.createdBy), a.activity])}
        />
      </Section>
    </>
  );
}
