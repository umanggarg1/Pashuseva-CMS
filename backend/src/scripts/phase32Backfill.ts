// Phase 32 A5 (PHASE32_TODO.md §18 A5): ONE-TIME backfill for customers that existed
// before Phase 32. OPTION 2 (owner decision 2026-11-26): mark the WhatsApp NUMBER only.
//
// What it does, per eligible customer: marks the PRIMARY phone as the customer's WhatsApp
// number, ONLY if it is a valid Indian mobile (toWhatsappNumber), plus a customer-activity
// entry. It does NOT touch WhatsApp consent: a phone number stored in the CRM is not proof
// that the customer agreed to WhatsApp messages. Consent stays NO (never recorded) until
// staff record the customer's actual answer. Without consent YES nothing is ever sent.
//
// Eligible = not in Trash, not purged, consent NEVER recorded (whatsappConsentSource IS
// NULL: a customer from before Phase 32 that staff haven't recorded anything for), no
// WhatsApp number yet, and no phone edit by staff since Phase 32 went live (staff saw the
// WhatsApp toggle then, so their choice stands). Consent recorded by staff, a STOP reply,
// and consent history are never touched. Re-running changes nothing (a customer that has a
// WhatsApp number is skipped).
//
// It touches ONLY CustomerPhone.isWhatsapp and CustomerActivity. It never creates an
// OutboundMessage and never sends anything.
//
// SAFETY
// - It never reads backend/.env (which points at production). DATABASE_URL must be given
//   explicitly; the target host is printed before anything else.
// - Dry run is the default and writes nothing (it runs in a read-only transaction).
// - --apply refuses unless --expect-phones equals the count of the plan computed at that
//   moment (i.e. the dry run that was reviewed), and unless WHATSAPP_ENABLED is unset/false.
// - Output never contains customer names; phone numbers are masked (98XXXX3210).
//
// Usage (from backend/):
//   DATABASE_URL=<url> npx ts-node src/scripts/phase32Backfill.ts [--csv <file>]
//   DATABASE_URL=<url> npx ts-node src/scripts/phase32Backfill.ts --apply --expect-phones=N
// --csv writes the full per-customer plan (customer id, decision, masked number).

import { writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { toWhatsappNumber, maskWhatsappNumber } from '../utils/phone';

export const BACKFILL_PHONE_ACTIVITY = 'WhatsApp number set (one-time backfill, Phase 32)';
/** Activity text customer.service writes when staff change a customer's phones. */
export const STAFF_PHONE_ACTIVITY = 'Phone numbers updated';
/** Phase 32 (commit 2b461f3) went live in production: from then on staff saw the WhatsApp toggle. */
export const PHASE32_LIVE_AT = new Date('2026-11-26T10:58:22Z');

type Tx = Prisma.TransactionClient;
type PhoneRow = { id: number; phone: string; label: string | null; isPrimary: boolean; isWhatsapp: boolean };

export type PhoneDecision =
  | { kind: 'FLAG'; phoneId: number }
  | { kind: 'ALREADY_HAS_WHATSAPP' }
  | { kind: 'NO_PRIMARY' }
  | { kind: 'MULTIPLE_PRIMARY' }
  | { kind: 'INVALID_PRIMARY' };

export interface CustomerPlan {
  customerId: number;
  phones: PhoneRow[];
  phone: PhoneDecision;
}

export interface Plan {
  considered: CustomerPlan[];
  skipped: { consentRecorded: number; phonesEditedByStaff: number; trashed: number; purged: number };
  totalCustomers: number;
}

/** Same one-line phone summary the Customer Details activity panel uses for phone changes. */
function formatPhones(phones: { phone: string; isPrimary: boolean; isWhatsapp: boolean }[]): string {
  return phones
    .slice()
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((p) => {
      const tags = [p.isPrimary ? 'primary' : null, p.isWhatsapp ? 'WhatsApp' : null].filter(Boolean);
      return `${p.phone}${tags.length ? ` (${tags.join(', ')})` : ''}`;
    })
    .join(', ');
}

export function decidePhone(phones: PhoneRow[]): PhoneDecision {
  if (phones.some((p) => p.isWhatsapp)) return { kind: 'ALREADY_HAS_WHATSAPP' };
  const primaries = phones.filter((p) => p.isPrimary);
  if (primaries.length === 0) return { kind: 'NO_PRIMARY' };
  if (primaries.length > 1) return { kind: 'MULTIPLE_PRIMARY' };
  return toWhatsappNumber(primaries[0].phone) ? { kind: 'FLAG', phoneId: primaries[0].id } : { kind: 'INVALID_PRIMARY' };
}

const customerEligibleWhere = (since: Date): Prisma.CustomerWhereInput => ({
  deletedAt: null,
  purgedAt: null,
  whatsappConsentSource: null,
  activities: { none: { activity: STAFF_PHONE_ACTIVITY, createdAt: { gte: since } } },
});

export async function buildPlan(db: Tx | PrismaClient, since = PHASE32_LIVE_AT): Promise<Plan> {
  const customers = await db.customer.findMany({
    select: {
      id: true,
      deletedAt: true,
      purgedAt: true,
      whatsappConsentSource: true,
      activities: { where: { activity: STAFF_PHONE_ACTIVITY, createdAt: { gte: since } }, select: { id: true }, take: 1 },
      phones: { select: { id: true, phone: true, label: true, isPrimary: true, isWhatsapp: true }, orderBy: { id: 'asc' } },
    },
    orderBy: { id: 'asc' },
  });
  const plan: Plan = { considered: [], skipped: { consentRecorded: 0, phonesEditedByStaff: 0, trashed: 0, purged: 0 }, totalCustomers: customers.length };
  for (const c of customers) {
    if (c.purgedAt) plan.skipped.purged++;
    else if (c.deletedAt) plan.skipped.trashed++;
    else if (c.whatsappConsentSource !== null) plan.skipped.consentRecorded++;
    else if (c.activities.length) plan.skipped.phonesEditedByStaff++;
    else plan.considered.push({ customerId: c.id, phones: c.phones, phone: decidePhone(c.phones) });
  }
  return plan;
}

export function planCounts(plan: Plan) {
  const by = (k: PhoneDecision['kind']) => plan.considered.filter((e) => e.phone.kind === k).length;
  return {
    phonesToFlag: by('FLAG'),
    phonesAlreadyWhatsapp: by('ALREADY_HAS_WHATSAPP'),
    phonesInvalidPrimary: by('INVALID_PRIMARY'),
    phonesNoPrimary: by('NO_PRIMARY'),
    phonesMultiplePrimary: by('MULTIPLE_PRIMARY'),
  };
}

export type ApplyResult = { phonesFlagged: number; skippedChangedMeanwhile: number; errors: { customerId: number; error: string }[] };

/**
 * Applies the plan, one transaction per customer. Each write re-checks, inside the
 * transaction, the conditions the plan was built on (customer still eligible, still no
 * WhatsApp number, same valid primary), so a customer edited by staff in the meantime is
 * skipped, not overwritten, and a re-run finds nothing to do.
 */
export async function applyPlan(prisma: PrismaClient, plan: Plan, since = PHASE32_LIVE_AT): Promise<ApplyResult> {
  const result: ApplyResult = { phonesFlagged: 0, skippedChangedMeanwhile: 0, errors: [] };
  for (const e of plan.considered) {
    if (e.phone.kind !== 'FLAG') continue;
    const plannedPhoneId = e.phone.phoneId;
    try {
      const flagged = await prisma.$transaction(async (tx) => {
        // Lock the customer row so a concurrent staff save is ordered before or after us.
        const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Customer" WHERE id = ${e.customerId} FOR UPDATE`;
        if (locked.length !== 1) return false;
        const stillEligible = await tx.customer.count({ where: { id: e.customerId, ...customerEligibleWhere(since) } });
        if (stillEligible !== 1) return false;
        const now = await tx.customerPhone.findMany({
          where: { customerId: e.customerId },
          select: { id: true, phone: true, label: true, isPrimary: true, isWhatsapp: true },
          orderBy: { id: 'asc' },
        });
        const d = decidePhone(now);
        if (d.kind !== 'FLAG' || d.phoneId !== plannedPhoneId) return false;
        const p = await tx.customerPhone.updateMany({ where: { id: d.phoneId, customerId: e.customerId, isWhatsapp: false }, data: { isWhatsapp: true } });
        if (p.count !== 1) return false;
        const after = now.map((x) => (x.id === d.phoneId ? { ...x, isWhatsapp: true } : x));
        await tx.customerActivity.create({
          data: {
            customerId: e.customerId,
            activity: BACKFILL_PHONE_ACTIVITY,
            createdById: null,
            metadata: { field: 'phones', from: formatPhones(now), to: formatPhones(after), source: 'BACKFILL' },
          },
        });
        return true;
      });
      if (flagged) result.phonesFlagged++;
      else result.skippedChangedMeanwhile++;
    } catch (err) {
      // e.g. a staff member flagged a WhatsApp number at the same moment (the partial
      // unique index rejects a second one). This customer's transaction is rolled back
      // completely; a re-run picks it up if it is still eligible.
      result.errors.push({ customerId: e.customerId, error: err instanceof Error ? err.message.split('\n').slice(-1)[0] : String(err) });
    }
  }
  return result;
}

function csvLines(plan: Plan): string[] {
  const lines = ['customerId,phoneDecision,primaryMasked,phoneCount'];
  for (const e of plan.considered) {
    const primary = e.phones.find((p) => p.isPrimary);
    const masked = primary ? maskWhatsappNumber(primary.phone) || '(not a valid mobile)' : '(none)';
    lines.push([e.customerId, e.phone.kind, masked, e.phones.length].join(','));
  }
  return lines;
}

function arg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i < 0) return undefined;
  const a = process.argv[i];
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : process.argv[i + 1];
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL must be set explicitly (this script never reads backend/.env).');
    process.exit(2);
  }
  const apply = process.argv.includes('--apply');
  let host = '?';
  try {
    host = new URL(url).hostname;
  } catch {
    /* printed as ? */
  }
  console.log(`Phase 32 A5 WhatsApp-number backfill (Option 2: consent is NOT changed) — ${apply ? 'APPLY' : 'DRY RUN (no changes)'}`);
  console.log(`Target database host: ${host}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const consentBefore = await prisma.customer.groupBy({ by: ['whatsappConsent', 'whatsappConsentSource'], _count: true });
    const outboundBefore = await prisma.outboundMessage.count();
    // The plan is read in a read-only transaction: a dry run cannot write anything.
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return buildPlan(tx);
    });
    const counts = planCounts(plan);
    console.log(`\nCustomers in the database: ${plan.totalCustomers}`);
    console.log(`  skipped — purged: ${plan.skipped.purged}, in Trash: ${plan.skipped.trashed}, consent recorded by staff/STOP: ${plan.skipped.consentRecorded}, phones edited by staff since Phase 32 went live: ${plan.skipped.phonesEditedByStaff}`);
    console.log(`  considered (consent never recorded): ${plan.considered.length}`);
    console.log(`\nPLAN (WhatsApp consent is not changed for anyone)`);
    console.log(`  primary phones → marked WhatsApp:          ${counts.phonesToFlag}`);
    console.log(`  not marked — primary not a valid mobile:   ${counts.phonesInvalidPrimary}`);
    console.log(`  not marked — already has a WhatsApp number: ${counts.phonesAlreadyWhatsapp}`);
    console.log(`  not marked — no primary phone:             ${counts.phonesNoPrimary}`);
    console.log(`  not marked — more than one primary phone:  ${counts.phonesMultiplePrimary}`);
    const notFlagged = plan.considered.filter((e) => e.phone.kind !== 'FLAG' && e.phone.kind !== 'ALREADY_HAS_WHATSAPP');
    if (notFlagged.length) {
      console.log(`\n  customers whose phone is NOT marked:`);
      for (const e of notFlagged.slice(0, 50)) {
        const primary = e.phones.find((p) => p.isPrimary);
        console.log(`    customer #${e.customerId}: ${e.phone.kind}${primary ? ` (primary has ${primary.phone.replace(/[^0-9]/g, '').length} digits)` : ''}`);
      }
    }
    const sample = plan.considered.filter((e) => e.phone.kind === 'FLAG').slice(0, 5);
    if (sample.length) {
      console.log(`\n  sample of phones to mark:`);
      for (const e of sample) {
        const p = e.phones.find((x) => x.isPrimary)!;
        console.log(`    customer #${e.customerId}: ${maskWhatsappNumber(p.phone)}`);
      }
    }
    const csv = arg('--csv');
    if (csv) {
      writeFileSync(csv, csvLines(plan).join('\n') + '\n', 'utf8');
      console.log(`\nFull plan written to ${csv} (${plan.considered.length} rows, masked numbers, no names).`);
    }

    if (!apply) {
      console.log(`\nDRY RUN: nothing was changed. To apply exactly this plan:`);
      console.log(`  --apply --expect-phones=${counts.phonesToFlag}`);
      return;
    }

    if (String(process.env.WHATSAPP_ENABLED ?? '').toLowerCase() === 'true') {
      console.error('\nREFUSED: WHATSAPP_ENABLED is true. The backfill runs only while WhatsApp is disabled.');
      process.exitCode = 2;
      return;
    }
    const expP = Number(arg('--expect-phones'));
    if (!Number.isInteger(expP) || expP !== counts.phonesToFlag) {
      console.error(`\nREFUSED: --expect-phones=${arg('--expect-phones')} does not match the current plan (${counts.phonesToFlag}). Run the dry run again and review it.`);
      process.exitCode = 2;
      return;
    }

    const result = await applyPlan(prisma, plan);
    const outboundAfter = await prisma.outboundMessage.count();
    const consentAfter = await prisma.customer.groupBy({ by: ['whatsappConsent', 'whatsappConsentSource'], _count: true });
    const key = (g: typeof consentBefore) => JSON.stringify(g.map((x) => [x.whatsappConsent, x.whatsappConsentSource, x._count]).sort());
    console.log(`\nAPPLIED at ${new Date().toISOString()}`);
    console.log(`  phones marked WhatsApp:                  ${result.phonesFlagged}`);
    console.log(`  skipped (changed by staff meanwhile):    ${result.skippedChangedMeanwhile}`);
    console.log(`  errors (rolled back, re-run to retry):   ${result.errors.length}`);
    for (const e of result.errors) console.log(`    customer #${e.customerId}: ${e.error}`);
    console.log(`  OutboundMessage rows before/after:       ${outboundBefore} / ${outboundAfter} (must be equal)`);
    console.log(`  consent values before/after identical:   ${key(consentBefore) === key(consentAfter) ? 'yes' : 'NO (staff may have recorded consent meanwhile; check)'}`);
    if (result.errors.length || outboundAfter !== outboundBefore) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
