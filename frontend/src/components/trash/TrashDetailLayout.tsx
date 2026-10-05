import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ConfirmDialog';
import PermanentDeleteDialog from './PermanentDeleteDialog';
import { fmtDateTime, who, type UserRef } from './format';

export interface TrashMeta {
  deletedAt: string;
  deletedBy: UserRef | null;
  deletionExpiresAt: string;
  daysRemaining: number;
}

// Phase 27: shared frame for every Trash detail page — back link, "Deleted …" title
// with a TRASHED badge, when/who/expiry, and the same Restore / Delete Permanently
// actions as the Trash list. The per-type sections go in `children`.
export default function TrashDetailLayout({
  typeLabel,
  itemLabel,
  trash,
  onBack,
  onRestore,
  onPermanentDelete,
  isPending,
  children,
}: {
  typeLabel: string;
  itemLabel: string;
  trash: TrashMeta;
  onBack: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  isPending: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to Trash
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold md:text-2xl">Deleted {typeLabel}</h1>
            <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive">
              Trashed
            </span>
          </div>
          <p className="mt-1 text-lg font-medium">{itemLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            trigger={<Button variant="outline">Restore</Button>}
            title={`Restore ${typeLabel}?`}
            description={`${itemLabel} will be removed from Trash and become visible in the CRM again.`}
            confirmLabel="Restore"
            isPending={isPending}
            onConfirm={onRestore}
          />
          <PermanentDeleteDialog
            typeLabel={typeLabel}
            itemLabel={itemLabel}
            isPending={isPending}
            onConfirm={onPermanentDelete}
            size="default"
          />
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground">Deleted</p>
          <p className="font-medium">{fmtDateTime(trash.deletedAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Deleted by</p>
          <p className="font-medium">{who(trash.deletedBy)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Permanently deleted on</p>
          <p className="font-medium">
            {fmtDateTime(trash.deletionExpiresAt)}{' '}
            <span className="text-muted-foreground">
              ({trash.daysRemaining} day{trash.daysRemaining === 1 ? '' : 's'} left)
            </span>
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}
