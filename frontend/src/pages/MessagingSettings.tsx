import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import ErrorState from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

// Phase 32 D6 (PHASE32_TODO.md §9.5, §11, §14): Settings → WhatsApp Messaging.
// Route-gated on message:manage here AND on every API call. Everything on this page
// except Resume / Refresh templates / Resolve is read-only.

interface MessagingStatus {
  enabled: boolean;
  provider: string;
  sendsRealMessages: boolean;
  providerReason: string | null;
  paused: { at: string; reason: string | null; by: string | null } | null;
  rateLimitedUntil: string | null;
  goLiveAt: string | null;
  counts: Partial<Record<string, number>>;
  oldestWaitingSince: string | null;
  needsAttention: number;
  templates: { name: string; language: string; status: string; checkedAt: string }[];
}

export interface AttentionMessage {
  id: number;
  orderId: number | null;
  orderNumber: string | null;
  customerName: string;
  type: 'confirmation' | 'dispatched';
  status: string;
  to: string | null;
  errorCode: string | null;
  lastError: string | null;
  skipReason: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  sendStartedAt: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  acknowledgedByWhatsapp: boolean;
  statusReports: number;
  resolvedBy: { id: number; name: string | null } | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  lateResponseNote: string | null;
}

const PAGE_SIZE = 20;
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';

export function ageText(since: string | null, now = Date.now()): string {
  if (!since) return 'Nothing waiting';
  const min = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  if (min < 1) return 'Less than a minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ${min % 60} min` : `${Math.floor(h / 24)} days`;
}

const typeName = (t: 'confirmation' | 'dispatched') => (t === 'confirmation' ? 'Order confirmation' : 'Dispatch notification');

export default function MessagingSettings() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<AttentionMessage | null>(null);

  const status = useQuery({
    queryKey: ['messaging', 'status'],
    queryFn: () => apiFetch<MessagingStatus>('/messaging/status'),
    refetchInterval: 30_000,
  });
  const attention = useQuery({
    queryKey: ['messaging', 'needs-attention', page],
    queryFn: () => apiFetch<{ total: number; data: AttentionMessage[] }>(`/messaging/messages?needsAttention=true&page=${page}&pageSize=${PAGE_SIZE}`),
    refetchInterval: 30_000,
  });
  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['messaging'] });

  const resume = useMutation({
    mutationFn: () => apiFetch<{ resumed: boolean }>('/messaging/resume', { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(r.resumed ? 'WhatsApp sending resumed' : 'Sending was not paused');
      refreshAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not resume'),
  });
  const refreshTemplates = useMutation({
    mutationFn: () => apiFetch<{ updated: number }>('/messaging/templates/refresh', { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(`Template statuses refreshed (${r.updated} updated)`);
      refreshAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not refresh template statuses'),
  });

  if (status.isError) return <ErrorState message={status.error instanceof ApiError ? status.error.message : 'Could not load WhatsApp status.'} />;

  const s = status.data;
  const c = s?.counts ?? {};
  const queueSize = (c.QUEUED ?? 0) + (c.RETRY_WAIT ?? 0) + (c.PROCESSING ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader title="WhatsApp Messaging" />

      {!s ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card data-testid="messaging-state">
            <CardHeader>
              <CardTitle className="text-base">Sending</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="WhatsApp sending">
                <span className={cn('font-medium', s.enabled ? 'text-green-700' : 'text-red-700')} data-testid="state-enabled">
                  {s.enabled ? 'Enabled' : 'Disabled'}
                </span>{' '}
                <span className="text-muted-foreground">
                  ({s.sendsRealMessages ? 'WhatsApp Cloud API: real messages' : 'dry run: no real messages are sent'})
                </span>
              </Row>
              {s.providerReason && <p className="text-xs text-muted-foreground">{s.providerReason}</p>}
              <Row label="Status">
                {s.paused ? (
                  <span data-testid="state-paused" className="text-amber-800">
                    Paused since {fmt(s.paused.at)}
                    {s.paused.by ? ` by ${s.paused.by}` : ''}
                    {s.paused.reason ? `: ${s.paused.reason}` : ''}
                  </span>
                ) : (
                  <span data-testid="state-paused" className="text-green-700">Running</span>
                )}
              </Row>
              {s.paused && (
                <ConfirmDialog
                  trigger={<Button size="sm">Resume sending</Button>}
                  title="Resume WhatsApp sending?"
                  description="Queued messages will start sending again. Check that the reason for the pause has been fixed first."
                  confirmLabel="Resume"
                  isPending={resume.isPending}
                  onConfirm={() => resume.mutate()}
                />
              )}
              <Row label="Rate limit">
                <span data-testid="state-rate-limit">
                  {s.rateLimitedUntil ? `WhatsApp asked us to slow down; sending again from ${fmt(s.rateLimitedUntil)}` : 'None'}
                </span>
              </Row>
              <Row label="Go-live">{s.goLiveAt ? fmt(s.goLiveAt) : 'Not started yet'}</Row>
            </CardContent>
          </Card>

          <Card data-testid="messaging-queue">
            <CardHeader>
              <CardTitle className="text-base">Queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Waiting to be sent">
                <span data-testid="queue-size">{queueSize}</span>
                <span className="text-muted-foreground"> (queued {c.QUEUED ?? 0}, retrying {c.RETRY_WAIT ?? 0}, sending {c.PROCESSING ?? 0})</span>
              </Row>
              <Row label="Oldest waiting">
                <span data-testid="queue-oldest">{ageText(s.oldestWaitingSince)}</span>
              </Row>
              <Row label="Needs attention">
                <span data-testid="needs-attention-count" className={cn(s.needsAttention > 0 && 'font-medium text-red-700')}>
                  {s.needsAttention} unresolved
                </span>
              </Row>
            </CardContent>
          </Card>
        </div>
      )}

      {s && (
        <Card data-testid="messaging-templates">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Message templates</CardTitle>
            <Button size="sm" variant="outline" disabled={refreshTemplates.isPending} onClick={() => refreshTemplates.mutate()}>
              <RefreshCw className="mr-1 h-4 w-4" /> {refreshTemplates.isPending ? 'Refreshing…' : 'Refresh from WhatsApp'}
            </Button>
          </CardHeader>
          <CardContent>
            {s.templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No template statuses checked yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Checked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.templates.map((t) => (
                    <TableRow key={`${t.name}-${t.language}`}>
                      <TableCell className="font-mono text-xs">{t.name}</TableCell>
                      <TableCell>{t.language}</TableCell>
                      <TableCell className={cn(t.status === 'APPROVED' ? 'text-green-700' : 'font-medium text-red-700')}>{t.status}</TableCell>
                      <TableCell>{fmt(t.checkedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card data-testid="needs-attention">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" /> Needs attention
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Unconfirmed (UNKNOWN) messages waiting for an Admin decision, failed messages, and late answers from WhatsApp.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {attention.isPending && <Skeleton className="h-24 w-full" />}
          {attention.data?.data.length === 0 && <p className="text-sm text-muted-foreground">Nothing needs attention.</p>}
          {attention.data?.data.map((m) => (
            <div key={m.id} data-testid="attention-row" data-message-id={m.id} className="rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">
                    {typeName(m.type)} (message #{m.id})
                  </span>{' '}
                  ·{' '}
                  {m.orderNumber ? (
                    <Link to={`/orders/${m.orderNumber}`} className="text-primary hover:underline">
                      {m.orderNumber}
                    </Link>
                  ) : (
                    'no order'
                  )}{' '}
                  · {m.customerName} · {m.to ?? 'no number'}
                </span>
                <span className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', m.status === 'UNKNOWN' ? 'bg-orange-100 text-orange-800' : m.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700')}>
                    {m.status === 'UNKNOWN' ? 'Unconfirmed' : m.status === 'FAILED' ? 'Failed' : m.status}
                  </span>
                  {m.status === 'UNKNOWN' && !m.resolvedAt && (
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setResolving(m)}>
                      Resolve
                    </Button>
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {fmt(m.createdAt)} · attempts {m.attempts}/{m.maxAttempts}
                {m.lastError && ` · error: ${m.lastError}`}
                {m.errorCode && ` (code ${m.errorCode})`}
              </p>
              {m.resolvedAt && (
                <p className="text-xs text-muted-foreground">
                  Resolved by {m.resolvedBy?.name ?? 'an Admin'} on {fmt(m.resolvedAt)}: {m.resolutionNote}
                </p>
              )}
              {m.lateResponseNote && <p className="text-xs text-amber-800">Late answer from WhatsApp: {m.lateResponseNote}</p>}
            </div>
          ))}
          {attention.data && attention.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2 pt-2 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span>
                Page {page} of {Math.ceil(attention.data.total / PAGE_SIZE)}
              </span>
              <Button size="sm" variant="outline" disabled={page * PAGE_SIZE >= attention.data.total} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {resolving && <ResolveDialog message={resolving} onClose={() => setResolving(null)} onDone={refreshAll} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

type Decision = 'mark-sent' | 'mark-failed-and-resend';

/**
 * D6: resolving an UNKNOWN message. Shows the evidence first; the decision is an
 * explicit choice (nothing preselected) and a reason is mandatory.
 */
function ResolveDialog({ message: m, onClose, onDone }: { message: AttentionMessage; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolve = useMutation({
    mutationFn: () =>
      apiFetch<{ messageId: number; status: string; resend: { messageId: number } | null; resendBlockedReason: string | null }>(
        `/messaging/messages/${m.id}/resolve`,
        { method: 'POST', body: JSON.stringify({ action: decision, reason: reason.trim() }) }
      ),
    onSuccess: (r) => {
      if (decision === 'mark-sent') toast.success(`Message #${m.id} marked as sent`);
      else if (r.resend) toast.success(`Message #${m.id} marked as failed; resend queued as message #${r.resend.messageId}`);
      else toast.warning(`Message #${m.id} marked as failed; no resend was queued`, { description: r.resendBlockedReason ?? undefined });
      onDone();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Try again.');
      onDone(); // e.g. another Admin resolved it meanwhile: refresh the list behind
    },
  });

  const reasonOk = reason.trim().length >= 3;
  const canConfirm = decision !== null && reasonOk && !resolve.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && !resolve.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="resolve-dialog">
        <DialogHeader>
          <DialogTitle>Resolve unconfirmed message #{m.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="rounded-md bg-orange-50 p-2 text-orange-900">
            The CRM could not confirm whether WhatsApp received this message. That does not mean the customer did
            not get it. Decide based on the details below (and, if possible, by asking the customer).
          </p>
          <div className="grid grid-cols-[11rem_1fr] gap-x-2 gap-y-1" data-testid="resolve-details">
            <span className="text-muted-foreground">Message</span>
            <span>
              {typeName(m.type)} to {m.to ?? 'no number'} · {m.orderNumber ?? 'no order'} · {m.customerName}
            </span>
            <span className="text-muted-foreground">Current status</span>
            <span data-testid="resolve-status">{m.status === 'UNKNOWN' ? 'Unconfirmed (UNKNOWN)' : m.status}</span>
            <span className="text-muted-foreground">Send attempts</span>
            <span data-testid="resolve-attempts">
              {m.attempts} of {m.maxAttempts}
            </span>
            <span className="text-muted-foreground">Sending started</span>
            <span data-testid="resolve-started">{fmt(m.sendStartedAt)}</span>
            <span className="text-muted-foreground">Last attempt</span>
            <span>{fmt(m.lastAttemptAt)}</span>
            <span className="text-muted-foreground">WhatsApp acknowledged</span>
            <span data-testid="resolve-ack">
              {m.acknowledgedByWhatsapp
                ? `Yes: WhatsApp returned a message id${m.statusReports ? ` (${m.statusReports} status reports)` : ''}`
                : 'No: no message id or status report was received'}
            </span>
            <span className="text-muted-foreground">Original error</span>
            <span data-testid="resolve-error">
              {m.lastError ? `${m.lastError}${m.errorCode ? ` (code ${m.errorCode})` : ''}` : 'None recorded'}
            </span>
          </div>

          <fieldset className="space-y-1">
            <legend className="font-medium">Decision *</legend>
            <label className="flex cursor-pointer items-start gap-2">
              <input type="radio" name="decision" className="mt-1" checked={decision === 'mark-sent'} onChange={() => setDecision('mark-sent')} />
              <span>
                <span className="font-medium">Mark as sent</span>: the customer most likely received it. Nothing is
                resent.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input type="radio" name="decision" className="mt-1" checked={decision === 'mark-failed-and-resend'} onChange={() => setDecision('mark-failed-and-resend')} />
              <span>
                <span className="font-medium">Mark as failed and resend</span>: a NEW message is queued to the
                customer&apos;s current WhatsApp number (normal checks apply). This one stays as it is.
              </span>
            </label>
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor="resolve-reason">Reason *</Label>
            <Textarea
              id="resolve-reason"
              value={reason}
              maxLength={300}
              placeholder="e.g. Customer confirmed on the phone that they received it"
              onChange={(e) => setReason(e.target.value)}
            />
            {!reasonOk && reason.length > 0 && <p className="text-xs text-destructive">At least 3 characters.</p>}
          </div>
          {error && (
            <p data-testid="resolve-error-msg" className="text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={resolve.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canConfirm} onClick={() => resolve.mutate()}>
            {resolve.isPending ? 'Saving…' : 'Confirm decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
