import { Link } from 'react-router-dom';

import { InfoGrid, MiniTable, Section, TrashedTag } from './parts';
import { fmtDate, fmtDateTime, label, money, who, type UserRef } from './format';

export interface TrashOrder {
  id: number;
  orderNumber: string;
  invoiceNumber: string | null;
  orderDate: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  deliveryStatus: string;
  articleNumber: string | null;
  notes: string | null;
  cancellationReason: string | null;
  createdBy: UserRef | null;
  cancelledBy: UserRef | null;
  customer: {
    id: number;
    name: string;
    deletedAt: string | null;
    purgedAt: string | null;
    phones: { phone: string }[];
  };
  address: {
    addressLine: string;
    landmark: string | null;
    city: string;
    district: string | null;
    state: string;
    pincode: string;
  } | null;
  assignedEmployees: { employee: UserRef }[];
  items: {
    id: number;
    productName: string;
    productSKU: string;
    unit: string | null;
    quantity: number;
    unitPrice: number;
    discount: number;
    totalPrice: number;
  }[];
  payments: {
    id: number;
    amount: number;
    method: string;
    paymentDate: string;
    referenceNumber: string | null;
    notes: string | null;
    createdBy: UserRef | null;
  }[];
  tracking: {
    id: number;
    status: string;
    location: string | null;
    receivedBy: string | null;
    note: string | null;
    createdAt: string;
    updatedBy: UserRef | null;
  }[];
  activities: {
    id: number;
    action: string;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
    createdBy: UserRef | null;
  }[];
  orderNotes: { id: number; note: string; createdAt: string; createdBy: UserRef | null }[];
}

// Phase 27: read-only view of a trashed order — everything Order Details shows, plus
// the customer link going to the customer's own Trash detail if it's trashed too.
export default function OrderTrashDetail({ o }: { o: TrashOrder }) {
  const customer = o.customer;
  const customerCell = customer.purgedAt ? (
    customer.name
  ) : (
    <>
      <Link
        to={customer.deletedAt ? `/trash/customer/${customer.id}` : `/customers/${customer.id}`}
        className="font-medium text-primary hover:underline"
      >
        {customer.name}
      </Link>
      {customer.deletedAt && <TrashedTag />}
    </>
  );

  return (
    <>
      <Section title="Order Information">
        <InfoGrid
          rows={[
            ['Order', o.orderNumber],
            ['Invoice', o.invoiceNumber ?? '—'],
            ['Order date', fmtDate(o.orderDate)],
            ['Customer', customerCell],
            ['Phone', customer.phones.map((p) => p.phone).join(', ') || '—'],
            [
              'Delivery address',
              o.address
                ? [o.address.addressLine, o.address.landmark, o.address.city, o.address.district, o.address.state, o.address.pincode]
                    .filter(Boolean)
                    .join(', ')
                : '—',
            ],
            ['Order status', label(o.orderStatus)],
            ['Delivery status', label(o.deliveryStatus)],
            ['Article No.', o.articleNumber ?? '—'],
            ['Assigned employees', o.assignedEmployees.map((a) => a.employee.name).filter(Boolean).join(', ') || '—'],
            ['Created by', who(o.createdBy)],
            ...(o.cancellationReason
              ? ([['Cancelled', `${o.cancellationReason} (${who(o.cancelledBy)})`]] as [string, string][])
              : []),
            ['Notes', o.notes ?? '—'],
          ]}
        />
      </Section>

      <Section title="Items">
        <MiniTable
          head={['Product', 'SKU', 'Qty', 'Unit price', 'Discount', 'Total']}
          empty="No items."
          rows={o.items.map((i) => [
            i.productName,
            i.productSKU,
            `${i.quantity}${i.unit ? ` ${i.unit}` : ''}`,
            money(i.unitPrice),
            money(i.discount),
            money(i.totalPrice),
          ])}
        />
        <div className="mt-3">
          <InfoGrid
            rows={[
              ['Subtotal', money(o.subtotal)],
              ['Discount', money(o.discount)],
              ['Delivery', money(o.shipping)],
              ['Total', <span className="font-semibold">{money(o.total)}</span>],
            ]}
          />
        </div>
      </Section>

      <Section title="Payment">
        <InfoGrid
          rows={[
            ['Status', label(o.paymentStatus)],
            ['Method', label(o.paymentMethod)],
            ['Paid', money(o.paid)],
            ['Remaining', money(o.remaining)],
          ]}
        />
        <div className="mt-3">
          <MiniTable
            head={['Date', 'Amount', 'Method', 'Reference', 'By']}
            empty="No payments recorded."
            rows={o.payments.map((p) => [
              fmtDate(p.paymentDate),
              money(p.amount),
              label(p.method),
              p.referenceNumber ?? '—',
              who(p.createdBy),
            ])}
          />
        </div>
      </Section>

      <Section title="Delivery Timeline">
        <MiniTable
          head={['When', 'Status', 'Location', 'Received by', 'Note', 'By']}
          empty="No delivery updates."
          rows={o.tracking.map((t) => [
            fmtDateTime(t.createdAt),
            label(t.status),
            t.location ?? '—',
            t.receivedBy ?? '—',
            t.note ?? '—',
            who(t.updatedBy),
          ])}
        />
      </Section>

      <Section title="Notes">
        <MiniTable
          head={['When', 'By', 'Note']}
          empty="No notes."
          rows={o.orderNotes.map((n) => [fmtDateTime(n.createdAt), who(n.createdBy), n.note])}
        />
      </Section>

      <Section title="Activity">
        <MiniTable
          head={['When', 'By', 'Action', 'Change']}
          empty="No activity."
          rows={o.activities.map((a) => [
            fmtDateTime(a.createdAt),
            who(a.createdBy),
            a.action,
            a.oldValue || a.newValue ? `${a.oldValue ?? '—'} → ${a.newValue ?? '—'}` : '—',
          ])}
        />
      </Section>
    </>
  );
}
