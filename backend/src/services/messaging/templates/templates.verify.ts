/**
 * Standalone verification for Phase 32 B4: template definitions, parameter builders,
 * sanitizing, units/money formatting, the exact Q12 wording and the frozen language
 * rules (names/products/order numbers/units/amounts never translated).
 *
 * This project has no test runner, so this is a plain script:
 *     npx ts-node src/services/messaging/templates/templates.verify.ts [--write-review <file.md>]
 * Exits 0 when every case passes, 1 otherwise. With --write-review it also writes the
 * rendered sample messages (for the user's B6 review) to the given file.
 */
import fs from 'node:fs';
import { buildConfirmationParams, buildDispatchParams, DispatchSnapshot, MessageItem } from './builders';
import { BODY_MAX, renderTemplate, TEMPLATES, templateProblems } from './definitions';
import { formatQuantity, formatRupees } from './format';
import { PAYMENT_METHOD, TRACKING_FALLBACK } from './i18n';
import { graphemes, paramProblem, sanitizeParam, truncateGraphemes } from './sanitize';
import { summarizeOrderPayment } from '../../../utils/paymentSummary';

let failures = 0;
let total = 0;
function check(name: string, ok: boolean, detail = '') {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  — ' + detail : ''}`);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── template definitions ─────────────────────────────────────────────────────
for (const key of ['confirmation', 'dispatched'] as const) {
  for (const lang of ['EN', 'HI'] as const) {
    const def = TEMPLATES[key][lang];
    const problems = templateProblems(def);
    check(`template ${key}/${lang}: Meta structure rules (vars in order, not at start/end, not adjacent, lengths)`, problems.length === 0, problems.join('; '));
    check(`template ${key}/${lang}: Meta language code`, def.metaLanguage === (lang === 'EN' ? 'en' : 'hi'));
  }
}
check('English templates are the approved §4.1/§4.2 text; Hindi marked DRAFT until B6',
  TEMPLATES.confirmation.EN.status === 'APPROVED_TEXT' && TEMPLATES.dispatched.EN.status === 'APPROVED_TEXT' &&
  TEMPLATES.confirmation.HI.status === 'DRAFT' && TEMPLATES.dispatched.HI.status === 'DRAFT');
check('dispatch templates state the 5–7 day estimate as an estimate',
  TEMPLATES.dispatched.EN.body.includes('approximately 5–7 days') && TEMPLATES.dispatched.EN.body.includes('estimate, not guaranteed') &&
  TEMPLATES.dispatched.HI.body.includes('5–7') && TEMPLATES.dispatched.HI.body.includes('अनुमान'));
check('confirmation templates contain no price / payment / delivery-date wording',
  !/₹|payment|paid|delivery:/i.test(TEMPLATES.confirmation.EN.body) && !/₹|भुगतान/.test(TEMPLATES.confirmation.HI.body));

// ── Q12: exact payment-method wording (user decision) ────────────────────────
const Q12 = {
  EN: { UNPAID: 'Cash on Delivery', PARTIAL: 'Part prepaid, balance due on delivery', PAID: 'Prepaid', FREE: 'Free order' },
  HI: { UNPAID: 'कैश ऑन डिलीवरी', PARTIAL: 'कुछ एडवांस, बाकी डिलीवरी पर।', PAID: 'पूरा भुगतान हो चुका है', FREE: 'निःशुल्क ऑर्डर' },
};
for (const lang of ['EN', 'HI'] as const) {
  for (const kind of ['UNPAID', 'PARTIAL', 'PAID', 'FREE'] as const) {
    check(`Q12 ${lang} ${kind} = "${Q12[lang][kind]}"`, PAYMENT_METHOD[lang][kind] === Q12[lang][kind], PAYMENT_METHOD[lang][kind]);
  }
}

// ── sanitize ─────────────────────────────────────────────────────────────────
const ZWJ = '\u200D';
const NBSP = '\u00A0';
check('sanitize: newline / tab / CR → single space', sanitizeParam('Ram\nLal\tji\r\nX') === 'Ram Lal ji X');
check('sanitize: 5+ spaces → one space', sanitizeParam('Ram      Lal') === 'Ram Lal');
check('sanitize: NBSP → space', sanitizeParam(`Ram${NBSP}Lal`) === 'Ram Lal');
check('sanitize: control characters removed', sanitizeParam(`Ram${String.fromCharCode(7)}Lal${String.fromCharCode(0x85)}`) === 'Ram Lal');
check('sanitize: zero-width JOINER kept (Devanagari needs it)', sanitizeParam(`क${ZWJ}ष`) === `क${ZWJ}ष`);
check('sanitize: zero-width space / BOM removed', sanitizeParam('\uFEFFRam\u200BLal') === 'RamLal');
check('sanitize: empty / whitespace-only → "-" (Meta rejects empty params)', sanitizeParam('') === '-' && sanitizeParam('  \n ') === '-' && sanitizeParam(null) === '-');
check('sanitize: does NOT change case, spelling or script', sanitizeParam('RAM lal') === 'RAM lal' && sanitizeParam('रामलाल') === 'रामलाल');
const conjunct = 'क्षत्रिय'; // conjuncts must not be split
const cut = truncateGraphemes(conjunct + conjunct, graphemes(conjunct).length + 1);
check('truncate: never splits a Devanagari conjunct', cut.endsWith('…') && graphemes(cut.slice(0, -1)).every((g) => graphemes(conjunct + conjunct).includes(g)), cut);
const family = '👨\u200D👩\u200D👧';
check('truncate: never splits an emoji sequence', truncateGraphemes(`${family}${family}${family}`, 2) === `${family}…`, truncateGraphemes(`${family}${family}${family}`, 2));

// ── units + money (always English) ───────────────────────────────────────────
check('units: enum values, singular/plural', formatQuantity(2, 'BAG') === '2 Bags' && formatQuantity(1, 'PACKET') === '1 Packet' && formatQuantity(3, 'BOX') === '3 Boxes' && formatQuantity(1, 'BOTTLE') === '1 Bottle' && formatQuantity(5, 'PIECE') === '5 Pieces');
check('units: legacy "Bag"/"Packet" text read the same', formatQuantity(2, 'Bag') === '2 Bags' && formatQuantity(1, 'Packet') === '1 Packet');
check('units: other stored text kept as-is in brackets', formatQuantity(2, '10 kg') === '2 (10 kg)');
check('units: no unit → number only', formatQuantity(2, null) === '2' && formatQuantity(2, '  ') === '2');
check('money: Indian grouping, no decimals for whole rupees', formatRupees(1250) === '1,250' && formatRupees(125000) === '1,25,000' && formatRupees(0) === '0');
check('money: 2 decimals when fractional', formatRupees(1234.5) === '1,234.50' && formatRupees(999.999) === '1,000');

// ── builders: the frozen language rules ──────────────────────────────────────
const items: MessageItem[] = [
  { productName: 'Satvik Shahi Mixer Feed', quantity: 2, unit: 'BAG', lineTotal: 500 },
  { productName: 'Milk Booster Powder', quantity: 1, unit: 'PACKET', lineTotal: 450 },
  { productName: 'Liquid Calcium', quantity: 2, unit: 'BOTTLE', lineTotal: 300 },
];
const base = { customerName: 'Ram Lal', orderNumber: 'ORD-2026-001025', items };
const cEN = buildConfirmationParams(base, 'EN');
const cHI = buildConfirmationParams(base, 'HI');
check('confirmation: name / order number / products+units IDENTICAL in EN and HI (E19a)', eq(cEN.params, cHI.params), JSON.stringify([cEN.params, cHI.params]));
check('confirmation: params exactly as stored', eq(cEN.params, ['Ram Lal', 'ORD-2026-001025', 'Satvik Shahi Mixer Feed × 2 Bags  |  Milk Booster Powder × 1 Packet  |  Liquid Calcium × 2 Bottles']), JSON.stringify(cEN.params));
check('confirmation HI rendered: Hindi wording + English name/products', cHI.renderedBody.includes('नमस्ते Ram Lal जी') && cHI.renderedBody.includes('Satvik Shahi Mixer Feed × 2 Bags'));

const pay = (t: number, p: number, s: 'PENDING' | 'PARTIAL' | 'PAID' | 'REFUNDED') => summarizeOrderPayment(t, p, s);
const disp = (payment: ReturnType<typeof pay>, articleNumber: string | null = 'EK123456789IN'): DispatchSnapshot => ({ ...base, payment, articleNumber });
const dEN = buildDispatchParams(disp(pay(1250, 0, 'PENDING')), 'EN');
const dHI = buildDispatchParams(disp(pay(1250, 0, 'PENDING')), 'HI');
check('dispatch: name, order no, items+prices, total, Article No. IDENTICAL in EN and HI',
  eq([0, 1, 2, 3, 7].map((i) => dEN.params[i]), [0, 1, 2, 3, 7].map((i) => dHI.params[i])), JSON.stringify([dEN.params, dHI.params]));
check('dispatch: items carry exact line prices', dEN.params[2] === 'Satvik Shahi Mixer Feed × 2 Bags – ₹500  |  Milk Booster Powder × 1 Packet – ₹450  |  Liquid Calcium × 2 Bottles – ₹300', dEN.params[2]);
check('dispatch: only {{5}} {{6}} {{7}} differ between languages', dEN.params[4] !== dHI.params[4] && dEN.params[5] !== dHI.params[5] && dEN.params[6] !== dHI.params[6]);

const cases: [string, ReturnType<typeof pay>, 'UNPAID' | 'PARTIAL' | 'PAID' | 'FREE', string, string][] = [
  ['COD unpaid', pay(1250, 0, 'PENDING'), 'UNPAID', 'Amount to pay on delivery: ₹1,250', 'Unpaid'],
  ['partially paid', pay(1250, 500, 'PARTIAL'), 'PARTIAL', 'Paid ₹500, balance due on delivery: ₹750', 'Partially paid'],
  ['fully prepaid', pay(1250, 1250, 'PAID'), 'PAID', 'Amount paid: ₹1,250', 'Paid'],
  ['free ₹0 order', pay(0, 0, 'PAID'), 'FREE', 'Nothing to pay', 'Paid'],
  ['payment reversed to ₹0', pay(1250, 0, 'PENDING'), 'UNPAID', 'Amount to pay on delivery: ₹1,250', 'Unpaid'],
  ['overpaid (clamped)', pay(1000, 1200, 'PAID'), 'PAID', 'Amount paid: ₹1,000', 'Paid'],
];
for (const [name, p, kind, line, status] of cases) {
  const en = buildDispatchParams(disp(p), 'EN');
  const hi = buildDispatchParams(disp(p), 'HI');
  check(`dispatch ${name}: {{5}} = Q12 (EN+HI), {{6}}, {{7}}`,
    en.params[4] === Q12.EN[kind] && hi.params[4] === Q12.HI[kind] && en.params[5] === status && en.params[6] === line,
    JSON.stringify([en.params[4], hi.params[4], en.params[5], en.params[6]]));
}
check('dispatch: never shows a negative balance', !/-₹|₹-/.test(buildDispatchParams(disp(pay(1000, 1200, 'PAID')), 'EN').params.join(' ')));
check('dispatch: no Article No. → "Will be shared soon" / Hindi fallback',
  buildDispatchParams(disp(pay(100, 0, 'PENDING'), null), 'EN').params[7] === TRACKING_FALLBACK.EN &&
  buildDispatchParams(disp(pay(100, 0, 'PENDING'), '   '), 'HI').params[7] === TRACKING_FALLBACK.HI);
check('dispatch: REFUNDED (defensive) builds without error', buildDispatchParams(disp(pay(1200, 0, 'REFUNDED')), 'EN').params[5] === 'Refunded');

// ── extremes: limits, dirty data ─────────────────────────────────────────────
const longName = 'Satvik Shahi Super Premium Mineral Mixture Feed For Dairy Cattle 25 kg';
const many: MessageItem[] = Array.from({ length: 40 }, (_, i) => ({ productName: `${longName} ${i + 1}`, quantity: i + 1, unit: 'BAG', lineTotal: 12345.5 }));
const bigCustomer = 'श्रीमती क्षत्राणी देवी Very Long Customer Name With Many Words For Testing Limits';
for (const lang of ['EN', 'HI'] as const) {
  const c = buildConfirmationParams({ customerName: bigCustomer, orderNumber: 'ORD-2026-999999', items: many }, lang);
  const d = buildDispatchParams({ customerName: bigCustomer, orderNumber: 'ORD-2026-999999', items: many, payment: pay(493820, 1000, 'PARTIAL'), articleNumber: 'EK123456789IN' }, lang);
  for (const [label, m] of [['confirmation', c], ['dispatch', d]] as const) {
    check(`${lang} ${label} with 40 long items: body ≤ ${BODY_MAX}, "+N more" shown, all params valid`,
      m.renderedBody.length <= BODY_MAX && /\+\d+ (more items|और उत्पाद)/.test(m.params[2]) && m.params.every((p) => paramProblem(p) === null),
      `len ${m.renderedBody.length}`);
  }
}
const huge = buildDispatchParams({ ...base, items: [{ productName: 'X'.repeat(3000), quantity: 1, unit: null, lineTotal: 10 }], payment: pay(10, 0, 'PENDING'), articleNumber: null }, 'HI');
check('one 3000-char product name → shortened, body ≤ 1024', huge.renderedBody.length <= BODY_MAX, `len ${huge.renderedBody.length}`);
const dirty = buildConfirmationParams({ customerName: '  Ram\n\tLal     ji  ', orderNumber: ' ORD-2026-000001 ', items: [{ productName: 'Feed\nPlus', quantity: 2, unit: '10 kg', lineTotal: 0 }, { productName: '', quantity: 1, unit: null, lineTotal: 0 }] }, 'EN');
check('dirty data → cleaned only (no translation), legacy unit kept, empty name → "-"',
  eq(dirty.params, ['Ram Lal ji', 'ORD-2026-000001', 'Feed Plus × 2 (10 kg)  |  - × 1']), JSON.stringify(dirty.params));
check('no items → "-" (never an empty parameter)', buildConfirmationParams({ ...base, items: [] }, 'EN').params[2] === '-');

console.log(`\n${total - failures}/${total} template checks passed`);

// ── optional: write rendered samples for the user's B6 review ────────────────
const reviewIdx = process.argv.indexOf('--write-review');
if (reviewIdx > 0 && process.argv[reviewIdx + 1]) {
  const out: string[] = [];
  const block = (title: string, def: typeof TEMPLATES.confirmation.EN, params: string[]) => {
    const r = renderTemplate(def, params);
    out.push(`### ${title}`, '', `Status: **${def.status === 'DRAFT' ? 'DRAFT — needs your approval (B6)' : 'approved text (§4.1/§4.2)'}** · Meta language \`${def.metaLanguage}\` · ${r.body.length}/${BODY_MAX} characters`, '', '```', `[Header] ${r.header}`, '', r.body, '', `[Footer] ${r.footer}`, '```', '');
  };
  out.push('# Phase 32 — WhatsApp message samples for review (B6)', '', 'Generated from `backend/src/services/messaging/templates` by `templates.verify.ts --write-review`.', 'Example order: Ram Lal, ORD-2026-001025, 3 items. Names, products, order numbers, units and amounts are inserted exactly as stored, in English, in both languages.', '');
  block('Order confirmation — English (`ps_order_confirmation`, `en`)', TEMPLATES.confirmation.EN, cEN.params);
  block('Order confirmation — Hindi (`ps_order_confirmation`, `hi`)', TEMPLATES.confirmation.HI, cHI.params);
  block('Dispatch notification — English, Cash on Delivery (`ps_order_dispatched`, `en`)', TEMPLATES.dispatched.EN, dEN.params);
  block('Dispatch notification — Hindi, Cash on Delivery (`ps_order_dispatched`, `hi`)', TEMPLATES.dispatched.HI, dHI.params);
  const partHI = buildDispatchParams(disp(pay(1250, 500, 'PARTIAL'), null), 'HI');
  block('Dispatch notification — Hindi, part prepaid, no Article No. yet', TEMPLATES.dispatched.HI, partHI.params);
  const paidEN = buildDispatchParams(disp(pay(1250, 1250, 'PAID')), 'EN');
  block('Dispatch notification — English, fully prepaid', TEMPLATES.dispatched.EN, paidEN.params);
  fs.writeFileSync(process.argv[reviewIdx + 1], out.join('\n'), 'utf-8');
  console.log(`review samples written to ${process.argv[reviewIdx + 1]}`);
}
process.exit(failures ? 1 : 0);
