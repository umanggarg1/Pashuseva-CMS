import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TRASH_RETENTION_DAYS } from '@/lib/trash';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// Skips the recovery window entirely — the spec's own explicit ask for a
// stronger confirmation than the usual Cancel/Confirm dialog, requiring the Admin to
// type DELETE rather than just clicking a button. Shared by the Trash list and the
// Trash detail page (Phase 27).
export default function PermanentDeleteDialog({
  typeLabel,
  itemLabel,
  isPending,
  onConfirm,
  size = 'sm',
}: {
  typeLabel: string;
  itemLabel: string;
  isPending?: boolean;
  onConfirm: () => void;
  size?: 'sm' | 'default';
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText('');
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size={size}>
          Delete Permanently
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permanently Delete {typeLabel}?</DialogTitle>
          <DialogDescription>{itemLabel}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-destructive">
          ⚠ This action cannot be undone. The {TRASH_RETENTION_DAYS}-day recovery period will be skipped.
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="permanent-delete-confirm">
            Type DELETE to confirm
          </label>
          <Input
            id="permanent-delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={confirmText !== 'DELETE' || isPending}
            onClick={() => {
              setOpen(false);
              setConfirmText('');
              onConfirm();
            }}
          >
            Delete Permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
