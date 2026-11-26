import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

// Phase 32 D4 (PHASE32_TODO.md §0.1): Order Details → WhatsApp messages card.
// READ-ONLY: it only ever GETs /orders/:id/messages (masked numbers only). It never
// creates, resends or changes a message; Resend arrives in D5 behind message:resend.

export type MessageStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'RETRY_WAIT'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'UNKNOWN'
  | 'SKIPPED';

export interface OrderMessage {
  id: number;
  type: 'confirmation' | 'dispatched';
  status: MessageStatus;
  isResend: boolean;
  resendOfId: number | null;
  resendReason: string | null;
  to: string | null; // masked by the server: 98XXXX3210
  language: 'EN' | 'HI';
  fallbackFromLanguage: 'EN' | 'HI' | null;
  skipReason: string | null;
  errorCode: string | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  triggeredBy: { id: number; name: string | null } | null;
  needsAttention: boolean;
}

/** While any message is in one of these, the card refreshes every 10 s. */
export const ACTIVE_STATUSES: MessageStatus[] = ['QUEUED', 'PROCESSING', 'RETRY_WAIT', 'SENT'];
export const REFRESH_MS = 10_000;

const STATUS_LABEL: Record<MessageStatus, string> = {
  QUEUED: 'Queued',
  PROCESSING: 'Sending',
  RETRY_WAIT: 'Retrying',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  READ: 'Read',
  FAILED: 'Failed',
  UNKNOWN: 'Unconfirmed',
  SKIPPED: 'Not sent',
};

const STATUS_STYLE: Record<MessageStatus, string> = {
  QUEUED: 'bg-slate-100 text-slate-700',
  PROCESSING: 'bg-blue-100 text-blue-800',
  RETRY_WAIT: 'bg-amber-100 text-amber-800',
  SENT: 'bg-sky-100 text-sky-800',
  DELIVERED: 'bg-green-100 text-green-800',
  READ: 'bg-green-200 text-green-900',
  FAILED: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-orange-100 text-orange-800',
  SKIPPED: 'bg-gray-100 text-gray-700',
};

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The one-line explanation for each status (§0.1 wording). */
export function statusHelp(m: Pick<OrderMessage, 'status' | 'skipReason' | 'lastError' | 'errorCode' | 'nextAttemptAt'>): string {
  switch (m.status) {
    case 'QUEUED':
      return 'Waiting to be sent';
    case 'PROCESSING':
      return 'Sending now';
    case 'RETRY_WAIT':
      return `Temporary problem, will retry automatically at ${m.nextAttemptAt ? formatTime(m.nextAttemptAt) : 'the next attempt'}`;
    case 'SENT':
      return 'Accepted by WhatsApp, not yet delivered';
    case 'DELIVERED':
      return "Delivered to the customer's WhatsApp";
    case 'READ':
      return 'Read by the customer';
    case 'FAILED':
      return `Could not be sent: ${m.lastError ?? 'no reason recorded'}${m.errorCode ? ` (code ${m.errorCode})` : ''}`;
    case 'UNKNOWN':
      return 'Not confirmed whether it was sent; an Admin will check (shown in Needs attention)';
    case 'SKIPPED':
      return `Not sent: ${m.skipReason ?? 'no reason recorded'}`;
  }
}

/** When the current status happened. */
function statusTime(m: OrderMessage): string | null {
  switch (m.status) {
    case 'READ':
      return m.readAt;
    case 'DELIVERED':
      return m.deliveredAt;
    case 'SENT':
      return m.sentAt;
    case 'FAILED':
      return m.failedAt ?? m.createdAt;
    default:
      return m.createdAt;
  }
}

function typeLabel(m: OrderMessage): string {
  const base = m.type === 'confirmation' ? 'Order confirmation' : 'Dispatch notification';
  return m.isResend ? `Resend: ${base}` : base;
}

const languageName = (l: 'EN' | 'HI') => (l === 'HI' ? 'Hindi' : 'English');

export default function WhatsappMessagesCard({ orderId }: { orderId: number }) {
  const query = useQuery({
    queryKey: ['order', orderId, 'whatsapp-messages'],
    queryFn: () => apiFetch<OrderMessage[]>(`/orders/${orderId}/messages`),
    // Auto-refresh only while something can still change.
    refetchInterval: (q) => (q.state.data?.some((m) => ACTIVE_STATUSES.includes(m.status)) ? REFRESH_MS : false),
  });

  return (
    <Card className="print-hide" data-testid="whatsapp-messages-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-green-600" aria-hidden="true" /> WhatsApp messages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isPending && <Skeleton className="h-16 w-full" />}
        {query.isError && <p className="text-sm text-destructive">Could not load WhatsApp messages.</p>}
        {query.data && query.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No WhatsApp messages for this order.</p>
        )}
        {query.data?.map((m) => (
          <div key={m.id} data-testid="whatsapp-message-row" data-message-id={m.id} className="rounded-md border p-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                #{m.id} · {typeLabel(m)}
              </span>
              <span className="flex items-center gap-2">
                <span
                  data-testid="message-status"
                  title={statusHelp(m)}
                  className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[m.status])}
                >
                  {STATUS_LABEL[m.status]}
                </span>
                <span className="text-xs text-muted-foreground">{formatTime(statusTime(m))}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              To {m.to ?? 'no WhatsApp number'} · {languageName(m.language)}
              {m.fallbackFromLanguage && ` (${languageName(m.fallbackFromLanguage)} template not available)`}
              {' · '}
              {m.triggeredBy ? `by ${m.triggeredBy.name ?? 'a staff member'}` : 'automatic'}
            </p>
            {m.isResend && m.resendOfId && (
              <p className="text-xs text-muted-foreground">
                Resend of #{m.resendOfId}
                {m.resendReason && ` · Reason: ${m.resendReason}`}
              </p>
            )}
            <p
              data-testid="message-help"
              className={cn(
                'mt-1 text-xs',
                m.status === 'FAILED' || m.status === 'UNKNOWN' ? 'text-red-700' : 'text-muted-foreground'
              )}
            >
              {statusHelp(m)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
