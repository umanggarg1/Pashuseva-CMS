// Phase 32 A6 (PHASE32_TODO.md §18 A6): when a customer is PERMANENTLY deleted (purged),
// the WhatsApp records keep no copy of their personal data. Runs inside the purge's own
// transaction (customerRepository.permanentDelete), so either the customer is anonymized
// AND their messaging data is scrubbed, or neither happens.
//
// Per message of this customer:
//   - cleared: toPhone, toPhoneId, params, snapshot (the number and the order details
//     copied into the message), lastError and lateResponseNote (provider text, which can
//     echo the number), replaced by a marker where there was text;
//   - still waiting (QUEUED / RETRY_WAIT) → SKIPPED "Customer permanently deleted", so it
//     can never be sent. A message a worker holds right now (PROCESSING) is left to the
//     worker: it re-checks the customer before sending and skips a trashed/purged one.
//   - kept: that a message existed, its type, order, status, times and staff ids, so the
//     order history stays accurate.
// Per status event of those messages: the raw provider payload (which contains the
// number) is replaced by a marker; status, time and error code are kept.
// Plus: the A5 backfill's activity entries, whose metadata copied the phone list, and
// staff "Phone numbers updated" entries (older than Phase 32; the purge never cleared
// them): each number becomes "(number removed)". Who changed it, when, how many numbers
// there were and which was primary / WhatsApp are kept.
// And the staff "Name updated" / "Email updated" / "Address updated" entries (also older
// than Phase 32): their old and new values are replaced by "(name removed)" etc. The
// entry, who made the change and when are kept, so the history still shows THAT it changed.

import type { Prisma } from '../../generated/prisma/client';

export const PURGED_SKIP_REASON = 'Customer permanently deleted';
export const PURGED_TEXT = '(removed: customer permanently deleted)';
const BACKFILL_PHONE_ACTIVITY = 'WhatsApp number set (one-time backfill, Phase 32)';
const STAFF_PHONE_ACTIVITY = 'Phone numbers updated';
export const REMOVED_NUMBER = '(number removed)';
/** Activity type → the marker that replaces its old/new values on purge. */
export const PERSONAL_HISTORY: Record<string, string> = {
  'Name updated': '(name removed)',
  'Email updated': '(email removed)',
  'Address updated': '(address removed)',
};

/**
 * Replace every phone number in a text, keeping the rest: a run of digits with the
 * separators people type (spaces incl. U+00A0, - . ( ) and a leading +) that holds at
 * least 8 digits. Shorter digit runs (pincodes, amounts, counts) are left alone.
 */
export function removePhoneNumbers(text: string): string {
  return text.replace(/\+?[0-9][0-9\s\u00a0().-]*[0-9]/gu, (m) => (m.replace(/[^0-9]/g, '').length >= 8 ? REMOVED_NUMBER : m));
}

export async function scrubCustomerMessagingData(tx: Prisma.TransactionClient, customerId: number) {
  const stopped = await tx.$executeRawUnsafe(
    `UPDATE "OutboundMessage" SET status = 'SKIPPED', "skipReason" = $2, "nextAttemptAt" = now(), "updatedAt" = now()
     WHERE "customerId" = $1 AND status IN ('QUEUED', 'RETRY_WAIT')`,
    customerId,
    PURGED_SKIP_REASON
  );
  const scrubbed = await tx.$executeRawUnsafe(
    `UPDATE "OutboundMessage" SET
       "toPhone" = NULL, "toPhoneId" = NULL, params = NULL, snapshot = NULL,
       "lastError" = CASE WHEN "lastError" IS NULL THEN NULL ELSE $2 END,
       "lateResponseNote" = CASE WHEN "lateResponseNote" IS NULL THEN NULL ELSE $2 END,
       "updatedAt" = now()
     WHERE "customerId" = $1`,
    customerId,
    PURGED_TEXT
  );
  const events = await tx.$executeRawUnsafe(
    `UPDATE "MessageStatusEvent" e SET raw = jsonb_build_object('removed', 'customer permanently deleted')
     FROM "OutboundMessage" m WHERE e."messageId" = m.id AND m."customerId" = $1`,
    customerId
  );
  const activities = await tx.customerActivity.updateMany({
    where: { customerId, activity: BACKFILL_PHONE_ACTIVITY },
    data: { metadata: { field: 'phones', from: PURGED_TEXT, to: PURGED_TEXT, source: 'BACKFILL' } },
  });
  const staffEntries = await tx.customerActivity.findMany({
    where: { customerId, activity: STAFF_PHONE_ACTIVITY },
    select: { id: true, metadata: true },
  });
  let phoneHistory = 0;
  for (const e of staffEntries) {
    const md = e.metadata as Record<string, unknown> | null;
    if (!md || typeof md !== 'object') continue;
    const cleaned = Object.fromEntries(Object.entries(md).map(([k, v]) => [k, typeof v === 'string' ? removePhoneNumbers(v) : v]));
    if (JSON.stringify(cleaned) === JSON.stringify(md)) continue;
    await tx.customerActivity.update({ where: { id: e.id }, data: { metadata: cleaned as Prisma.InputJsonValue } });
    phoneHistory++;
  }
  let personalHistory = 0;
  const personal = await tx.customerActivity.findMany({
    where: { customerId, activity: { in: Object.keys(PERSONAL_HISTORY) } },
    select: { id: true, activity: true, metadata: true },
  });
  for (const e of personal) {
    const md = e.metadata as Record<string, unknown> | null;
    if (!md || typeof md !== 'object') continue;
    const marker = PERSONAL_HISTORY[e.activity];
    // Only the old/new values are personal; any other key (none today) is kept as is.
    const cleaned = Object.fromEntries(
      Object.entries(md).map(([k, v]) => [k, (k === 'from' || k === 'to') && v !== null && v !== undefined && v !== '' ? marker : v])
    );
    if (JSON.stringify(cleaned) === JSON.stringify(md)) continue;
    await tx.customerActivity.update({ where: { id: e.id }, data: { metadata: cleaned as Prisma.InputJsonValue } });
    personalHistory++;
  }
  return { stopped, scrubbed, events, activities: activities.count, phoneHistory, personalHistory };
}
