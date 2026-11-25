import prisma, { PrismaClientOrTx } from '../../lib/prisma';

// Phase 32 B8a (PHASE32_TODO.md §12, §19.5): the ONE place a provider-reported status
// (sent / delivered / read / failed) is applied to a message — used by the webhook
// (C7) and by reconciliation. It never moves a status backwards:
//
//   rank: QUEUED / PROCESSING / RETRY_WAIT / UNKNOWN = 0 < SENT 1 < DELIVERED 2 < READ 3
//   - a status is applied only if its rank is HIGHER than the current one
//     (READ before DELIVERED → stays READ; a late SENT never downgrades);
//   - FAILED is applied only while the message is below DELIVERED;
//   - SKIPPED / FAILED rows are never "revived" by a sent/delivered/read report.
// Matching: by providerMessageId (wamid). If no row has that wamid, the echoed
// biz_opaque_callback_data (= eventKey) is tried — reconciling a message whose send
// response was lost (UNKNOWN, or still PROCESSING): it gets the wamid and its worker
// claim is cleared, so a slower API response can't overwrite it.

export type ProviderStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface ApplyStatusInput {
  providerMessageId: string;
  status: ProviderStatus;
  at: Date;
  /** biz_opaque_callback_data echoed by Meta (our eventKey), if present. */
  callbackData?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ApplyStatusResult {
  messageId: number | null;
  /** True when the row's status (or timestamps) changed. */
  applied: boolean;
  /** True when the wamid was attached via callbackData (lost-response reconciliation). */
  reconciled: boolean;
}

const RANK_SQL = `CASE status WHEN 'SENT' THEN 1 WHEN 'DELIVERED' THEN 2 WHEN 'READ' THEN 3 ELSE 0 END`;
const NEW_RANK: Record<ProviderStatus, number> = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: -1 };

export async function applyProviderStatus(input: ApplyStatusInput, client: PrismaClientOrTx = prisma): Promise<ApplyStatusResult> {
  let row = await client.outboundMessage.findUnique({ where: { providerMessageId: input.providerMessageId }, select: { id: true } });
  let reconciled = false;

  if (!row && input.callbackData) {
    // Lost-response reconciliation: attach the wamid to the UNKNOWN / PROCESSING row
    // of that event (only if it has no wamid yet), clearing any worker claim.
    const attached = await client.outboundMessage.updateMany({
      where: { eventKey: input.callbackData, providerMessageId: null, status: { in: ['UNKNOWN', 'PROCESSING'] } },
      data: { providerMessageId: input.providerMessageId, claimToken: null, lockedUntil: null, lockedBy: null, sentAt: input.at },
    });
    if (attached.count === 1) {
      reconciled = true;
      row = await client.outboundMessage.findUnique({ where: { providerMessageId: input.providerMessageId }, select: { id: true } });
    }
  }
  if (!row) return { messageId: null, applied: false, reconciled: false };

  let changed: number;
  if (input.status === 'FAILED') {
    changed = await client.$executeRawUnsafe(
      `UPDATE "OutboundMessage" SET status = 'FAILED', "failedAt" = $2, "errorKind" = 'PERMANENT',
         "errorCode" = COALESCE($3, "errorCode"), "lastError" = COALESCE($4, "lastError"),
         "claimToken" = NULL, "lockedUntil" = NULL, "updatedAt" = now()
       WHERE id = $1 AND status IN ('SENT', 'UNKNOWN', 'PROCESSING')`,
      row.id, input.at, input.errorCode ?? null, input.errorMessage ?? null
    );
  } else {
    const col = input.status === 'SENT' ? '"sentAt"' : input.status === 'DELIVERED' ? '"deliveredAt"' : '"readAt"';
    // Raise the status only when the new rank is higher; reaching READ also fills
    // deliveredAt (Meta may skip the delivered report when read implies it).
    changed = await client.$executeRawUnsafe(
      `UPDATE "OutboundMessage" SET
         status = CASE WHEN ${RANK_SQL} < $2 THEN $3::"MessageStatus" ELSE status END,
         "sentAt" = COALESCE("sentAt", $4),
         "deliveredAt" = CASE WHEN $2 >= 2 THEN COALESCE("deliveredAt", $4) ELSE "deliveredAt" END,
         "readAt" = CASE WHEN $2 >= 3 THEN COALESCE("readAt", $4) ELSE "readAt" END,
         "claimToken" = NULL, "lockedUntil" = NULL, "updatedAt" = now()
       WHERE id = $1 AND status IN ('PROCESSING', 'UNKNOWN', 'SENT', 'DELIVERED', 'READ')
         AND (${RANK_SQL} < $2 OR ${col} IS NULL)`,
      row.id, NEW_RANK[input.status], input.status, input.at
    );
  }
  return { messageId: row.id, applied: changed > 0, reconciled };
}
