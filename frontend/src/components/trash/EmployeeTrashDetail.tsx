import { Link } from 'react-router-dom';

import { InfoGrid, MiniTable, Section, TrashedTag } from './parts';
import { fmtDate, fmtDateTime, label, who, type UserRef } from './format';

export interface TrashEmployee {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  status: string;
  customerDataScope: string | null;
  orderDataScope: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  managedBy: { manager: UserRef }[];
  managing: { employee: UserRef & { deletedAt: string | null } }[];
  _count: { assignedCustomersAsEmployee: number; assignedOrders: number };
  auditLog: { id: number; action: string; createdAt: string; user: UserRef | null }[];
}

// Phase 27: read-only view of a trashed Employee or Manager. Users have no activity
// table, so the history shown is the audit log entries *about* this account.
export default function EmployeeTrashDetail({ u }: { u: TrashEmployee }) {
  const isManager = u.role === 'MANAGER';
  return (
    <>
      <Section title={`${isManager ? 'Manager' : 'Employee'} Information`}>
        <InfoGrid
          rows={[
            ['Name', u.name ?? '—'],
            ['Role', label(u.role)],
            ['Email', u.email],
            ['Phone', u.phone ?? '—'],
            ['Account status', label(u.status)],
            ['Customer data scope', label(u.customerDataScope)],
            ['Order data scope', label(u.orderDataScope)],
            ['Last login', fmtDateTime(u.lastLoginAt)],
            ['Created', fmtDate(u.createdAt)],
            ...(isManager
              ? []
              : ([
                  ['Reports to', u.managedBy.map((m) => m.manager.name).filter(Boolean).join(', ') || '—'],
                  ['Assigned customers', String(u._count.assignedCustomersAsEmployee)],
                  ['Assigned orders', String(u._count.assignedOrders)],
                ] as [string, string][])),
          ]}
        />
      </Section>

      {isManager && (
        <Section title={`Team (${u.managing.length})`}>
          <MiniTable
            head={['Employee']}
            empty="No team members."
            rows={u.managing.map((m) => [
              m.employee.deletedAt ? (
                <>
                  <Link to={`/trash/employee/${m.employee.id}`} className="text-primary hover:underline">
                    {m.employee.name ?? `#${m.employee.id}`}
                  </Link>
                  <TrashedTag />
                </>
              ) : (
                m.employee.name ?? `#${m.employee.id}`
              ),
            ])}
          />
        </Section>
      )}

      <Section title="History (audit log)">
        <MiniTable
          head={['When', 'Action', 'By']}
          empty="No history."
          rows={u.auditLog.map((a) => [fmtDateTime(a.createdAt), a.action, who(a.user)])}
        />
      </Section>
    </>
  );
}
