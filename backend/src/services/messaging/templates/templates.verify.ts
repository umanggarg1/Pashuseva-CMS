/**
 * Standalone verification for Phase 32 B4 / B6 / Q17: template definitions (20 sized
 * templates), parameter builders, sanitizing, units/money formatting, the exact Q12
 * and B6 wording, the frozen language rules (names/products/order numbers/units/amounts
 * never translated) and the Q17 product layout (one product per line; line 5 joins the
 * rest with "; "; nothing omitted unless the 1024 limit forces it).
 *
 * This project has no test runner, so this is a plain script:
 *     npx ts-node src/services/messaging/templates/templates.verify.ts [--write-review <file.md>]
 * Exits 0 when every case passes, 1 otherwise. With --write-review it also writes the
 * rendered sample messages for review to the given file.
 */
import fs from 'node:fs';
import { buildConfirmationParams, buildDispatchParams, BuiltMessage, DispatchSnapshot, MessageItem } from './builders';
import { allTemplates, BODY_MAX, getTemplate, metaTemplateName, renderTemplate, TemplateDefinition, templateProblems } from './definitions';
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
type AnySlot = 'NAME' | 'ORDER' | 'ITEMS' | 'TOTAL' | 'METHOD' | 'STATUS' | 'AMOUNT' | 'TRACKING';
const v = (m: BuiltMessage, slot: AnySlot) => m.values[slot] ?? [];
const one = (m: BuiltMessage, slot: Exclude<AnySlot, 'ITEMS'>) => v(m, slot)[0];

// ── the 20 templates (Q17) ───────────────────────────────────────────────────
const all = allTemplates();
check('exactly 20 templates: sizes 1–5 × {confirmation, dispatched} × {EN, HI}', all.length === 20 &&
  new Set(all.map((d) => `${d.key}/${d.language}/${d.size}`)).size === 20);
for (const d of all) {
  const problems = templateProblems(d);
  const expectedParams = d.key === 'confirmation' ? 2 + d.size : 7 + d.size;
  check(`template ${d.key}_${d.size}/${d.metaLanguage}: Meta structure rules + ${expectedParams} params, ${d.size} product line(s)`,
    problems.length === 0 && d.paramCount === expectedParams && (d.slots.ITEMS ?? []).length === d.size &&
    d.metaLanguage === (d.language === 'EN' ? 'en' : 'hi'),
    problems.join('; '));
  const lines = d.body.split('\n');
  const productLineIdx = (d.slots.ITEMS ?? []).map((pi) => lines.findIndex((l) => l === `{{${pi + 1}}}`));
  check(`template ${d.key}_${d.size}/${d.metaLanguage}: each product placeholder alone on its own line, consecutive`,
    productLineIdx.every((li, i) => li >= 0 && (i === 0 || li === productLineIdx[i - 1] + 1)));
}
check('Meta names are <base>_<size>', metaTemplateName('ps_order_confirmation', 3) === 'ps_order_confirmation_3' && metaTemplateName('ps_order_dispatched', 5) === 'ps_order_dispatched_5');
let sizeErr = false;
try { getTemplate('confirmation', 'EN', 6); } catch { sizeErr = true; }
check('there is no size 6+ template (more than 5 products use size 5)', sizeErr);

// ── wording (EN §4.1/§4.2, HI B6) ────────────────────────────────────────────
const cHI1 = getTemplate('confirmation', 'HI', 1);
const dHI1 = getTemplate('dispatched', 'HI', 1);
const dEN1 = getTemplate('dispatched', 'EN', 1);
check('B6 Hindi wording present (confirmation)', ['पशुसेवा से ऑर्डर करने के लिए धन्यवाद।', 'आपके ऑर्डर में शामिल सामान:', 'हम आपका ऑर्डर तैयार कर रहे हैं। ऑर्डर भेजे जाने पर आपको सूचना दे दी जाएगी।'].every((t) => cHI1.body.includes(t)));
check('B6 Hindi wording present (dispatch)', ['ऑर्डर का विवरण:', 'ऑर्डर का हिसाब:', 'अनुमानित डिलीवरी: ऑर्डर भेजे जाने के लगभग 5–7 दिनों में पहुंचने की उम्मीद है। यह केवल अनुमान है, पक्की तारीख नहीं।'].every((t) => dHI1.body.includes(t)));
check('B6 Hindi header/footers', cHI1.header === 'पशुसेवा' && dHI1.header === 'पशुसेवा' && cHI1.footer === 'ऑर्डर की पुष्टि' && dHI1.footer === 'डिस्पैच सूचना');
check('dispatch states the 5–7 day estimate as an estimate', dEN1.body.includes('approximately 5–7 days') && dEN1.body.includes('estimate, not guaranteed'));
check('confirmation templates contain no price / payment / delivery-date wording',
  !/₹|payment|paid|delivery:/i.test(getTemplate('confirmation', 'EN', 5).body) && !/₹|भुगतान/.test(getTemplate('confirmation', 'HI', 5).body));
check('no template uses "|" between products', all.every((d) => !d.body.includes('|')));

// ── Q12: exact payment-method wording ────────────────────────────────────────
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
const conjunct = 'क्षत्रिय';
const cut = truncateGraphemes(conjunct + conjunct, graphemes(conjunct).length + 1);
check('truncate: never splits a Devanagari conjunct', cut.endsWith('…') && graphemes(cut.slice(0, -1)).every((g) => graphemes(conjunct + conjunct).includes(g)), cut);
const family = '👨\u200D👩\u200D👧';
check('truncate: never splits an emoji sequence', truncateGraphemes(`${family}${family}${family}`, 2) === `${family}…`);

// ── units + money (always English) ───────────────────────────────────────────
check('units: enum values, singular/plural', formatQuantity(2, 'BAG') === '2 Bags' && formatQuantity(1, 'PACKET') === '1 Packet' && formatQuantity(3, 'BOX') === '3 Boxes' && formatQuantity(1, 'BOTTLE') === '1 Bottle' && formatQuantity(5, 'PIECE') === '5 Pieces');
check('units: legacy "Bag"/"Packet" text read the same', formatQuantity(2, 'Bag') === '2 Bags' && formatQuantity(1, 'Packet') === '1 Packet');
check('units: other stored text kept as-is in brackets', formatQuantity(2, '10 kg') === '2 (10 kg)');
check('units: no unit → number only', formatQuantity(2, null) === '2' && formatQuantity(2, '  ') === '2');
check('money: Indian grouping, no decimals for whole rupees', formatRupees(1250) === '1,250' && formatRupees(125000) === '1,25,000' && formatRupees(0) === '0');
check('money: 2 decimals when fractional', formatRupees(1234.5) === '1,234.50' && formatRupees(999.999) === '1,000');

// ── builders: frozen language rules ──────────────────────────────────────────
const items: MessageItem[] = [
  { productName: 'Satvik Shahi Mixer Feed', quantity: 2, unit: 'BAG', lineTotal: 500 },
  { productName: 'Milk Booster Powder', quantity: 1, unit: 'PACKET', lineTotal: 450 },
  { productName: 'Liquid Calcium', quantity: 2, unit: 'BOTTLE', lineTotal: 300 },
];
const base = { customerName: 'Ram Lal', orderNumber: 'ORD-2026-001025', items };
const cEN = buildConfirmationParams(base, 'EN');
const cHI = buildConfirmationParams(base, 'HI');
check('confirmation: name / order number / product lines IDENTICAL in EN and HI (E19a)', eq(cEN.params, cHI.params), JSON.stringify([cEN.params, cHI.params]));
check('confirmation (3 products): size 3, params exactly as stored, one product per param',
  cEN.size === 3 && eq(cEN.params, ['Ram Lal', 'ORD-2026-001025', 'Satvik Shahi Mixer Feed × 2 Bags', 'Milk Booster Powder × 1 Packet', 'Liquid Calcium × 2 Bottles']), JSON.stringify(cEN.params));
check('confirmation (3 products): each product on its own line in the rendered message',
  cEN.renderedBody.includes('Your ordered products:\nSatvik Shahi Mixer Feed × 2 Bags\nMilk Booster Powder × 1 Packet\nLiquid Calcium × 2 Bottles\n'));
check('confirmation HI rendered: Hindi wording + English name/products, one per line',
  cHI.renderedBody.includes('नमस्ते Ram Lal जी') && cHI.renderedBody.includes('आपके ऑर्डर में शामिल सामान:\nSatvik Shahi Mixer Feed × 2 Bags\nMilk Booster Powder × 1 Packet\n'));

const pay = (t: number, p: number, s: 'PENDING' | 'PARTIAL' | 'PAID' | 'REFUNDED') => summarizeOrderPayment(t, p, s);
const disp = (payment: ReturnType<typeof pay>, articleNumber: string | null = 'EK123456789IN', its: MessageItem[] = items): DispatchSnapshot => ({ ...base, items: its, payment, articleNumber });
const dEN = buildDispatchParams(disp(pay(1250, 0, 'PENDING')), 'EN');
const dHI = buildDispatchParams(disp(pay(1250, 0, 'PENDING')), 'HI');
check('dispatch: name, order no, product lines, total, Article No. IDENTICAL in EN and HI',
  eq([v(dEN, 'NAME'), v(dEN, 'ORDER'), v(dEN, 'ITEMS'), v(dEN, 'TOTAL'), v(dEN, 'TRACKING')], [v(dHI, 'NAME'), v(dHI, 'ORDER'), v(dHI, 'ITEMS'), v(dHI, 'TOTAL'), v(dHI, 'TRACKING')]));
check('dispatch: product lines carry exact line prices, one per line',
  eq(v(dEN, 'ITEMS'), ['Satvik Shahi Mixer Feed × 2 Bags – ₹500', 'Milk Booster Powder × 1 Packet – ₹450', 'Liquid Calcium × 2 Bottles – ₹300']) &&
  dEN.renderedBody.includes('Order details:\nSatvik Shahi Mixer Feed × 2 Bags – ₹500\nMilk Booster Powder × 1 Packet – ₹450\nLiquid Calcium × 2 Bottles – ₹300\n'));
check('dispatch: only payment method / status / amount line differ between languages', one(dEN, 'METHOD') !== one(dHI, 'METHOD') && one(dEN, 'STATUS') !== one(dHI, 'STATUS') && one(dEN, 'AMOUNT') !== one(dHI, 'AMOUNT'));

const cases: [string, ReturnType<typeof pay>, 'UNPAID' | 'PARTIAL' | 'PAID' | 'FREE', string, string][] = [
  ['COD unpaid', pay(1250, 0, 'PENDING'), 'UNPAID', 'Amount to pay on delivery: ₹1,250', 'Unpaid'],
  ['partially paid', pay(1250, 500, 'PARTIAL'), 'PARTIAL', 'Paid ₹500, balance due on delivery: ₹750', 'Partially paid'],
  ['fully prepaid', pay(1250, 1250, 'PAID'), 'PAID', 'Amount paid: ₹1,250', 'Paid'],
  ['free ₹0 order', pay(0, 0, 'PAID'), 'FREE', 'Nothing to pay', 'Free order'],
  ['payment reversed to ₹0', pay(1250, 0, 'PENDING'), 'UNPAID', 'Amount to pay on delivery: ₹1,250', 'Unpaid'],
  ['overpaid (clamped)', pay(1000, 1200, 'PAID'), 'PAID', 'Amount paid: ₹1,000', 'Paid'],
];
for (const [name, p, kind, line, status] of cases) {
  const en = buildDispatchParams(disp(p), 'EN');
  const hi = buildDispatchParams(disp(p), 'HI');
  check(`dispatch ${name}: method = Q12 (EN+HI), status, amount line`,
    one(en, 'METHOD') === Q12.EN[kind] && one(hi, 'METHOD') === Q12.HI[kind] && one(en, 'STATUS') === status && one(en, 'AMOUNT') === line,
    JSON.stringify([one(en, 'METHOD'), one(hi, 'METHOD'), one(en, 'STATUS'), one(en, 'AMOUNT')]));
}
const B6_HI: Record<string, [string, string]> = {
  UNPAID: ['भुगतान बाकी है', 'डिलीवरी पर देय राशि: ₹1,250'],
  PARTIAL: ['आंशिक भुगतान', '₹500 जमा, डिलीवरी पर बाकी: ₹750'],
  PAID: ['भुगतान हो चुका है', 'जमा की गई राशि: ₹1,250'],
  FREE: ['निःशुल्क ऑर्डर', 'कोई राशि देय नहीं'],
};
for (const [kind, p] of [['UNPAID', pay(1250, 0, 'PENDING')], ['PARTIAL', pay(1250, 500, 'PARTIAL')], ['PAID', pay(1250, 1250, 'PAID')], ['FREE', pay(0, 0, 'PAID')]] as const) {
  const hi = buildDispatchParams(disp(p), 'HI');
  check(`B6 Hindi ${kind}: status "${B6_HI[kind][0]}", amount "${B6_HI[kind][1]}"`, one(hi, 'STATUS') === B6_HI[kind][0] && one(hi, 'AMOUNT') === B6_HI[kind][1]);
}
for (const lang of ['EN', 'HI'] as const) {
  check(`free order is never called "Paid" (${lang})`, !/^(Paid|भुगतान हो चुका)/.test(one(buildDispatchParams(disp(pay(0, 0, 'PAID')), lang), 'STATUS')));
}
const paidHi = buildDispatchParams(disp(pay(1250, 1250, 'PAID')), 'HI');
check('Hindi paid order: payment method (Q12) and status differ (no repetition)', one(paidHi, 'METHOD') === 'पूरा भुगतान हो चुका है' && one(paidHi, 'STATUS') === 'भुगतान हो चुका है');
check('dispatch: never shows a negative balance', !/-₹|₹-/.test(buildDispatchParams(disp(pay(1000, 1200, 'PAID')), 'EN').params.join(' ')));
check('dispatch: no Article No. → "Will be shared soon" / Hindi fallback',
  one(buildDispatchParams(disp(pay(100, 0, 'PENDING'), null), 'EN'), 'TRACKING') === TRACKING_FALLBACK.EN &&
  one(buildDispatchParams(disp(pay(100, 0, 'PENDING'), '   '), 'HI'), 'TRACKING') === TRACKING_FALLBACK.HI);
check('dispatch: REFUNDED (defensive) builds without error', one(buildDispatchParams(disp(pay(1200, 0, 'REFUNDED')), 'EN'), 'STATUS') === 'Refunded');

// ── Q17 / E42: product layout ────────────────────────────────────────────────
const mk = (n: number, nameLen = 0): MessageItem[] => Array.from({ length: n }, (_, i) => ({
  productName: `Product ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? i : ''}${nameLen ? ' ' + 'x'.repeat(nameLen) : ''}`,
  quantity: (i % 3) + 1,
  unit: 'BAG',
  lineTotal: 100 * (i + 1),
}));
for (const n of [1, 2, 3, 4, 5]) {
  for (const lang of ['EN', 'HI'] as const) {
    const c = buildConfirmationParams({ ...base, items: mk(n) }, lang);
    const d = buildDispatchParams(disp(pay(1000, 0, 'PENDING'), 'EK1', mk(n)), lang);
    const ok = (m: BuiltMessage) => m.size === n && v(m, 'ITEMS').length === n && v(m, 'ITEMS').every((l) => !l.includes(';')) &&
      mk(n).every((it, i) => v(m, 'ITEMS')[i].startsWith(`${it.productName} × `)) && m.omittedProducts === 0 && !m.shortenedLine;
    check(`${n} product(s) ${lang}: template size ${n}, one product per line, none joined, none omitted`, ok(c) && ok(d));
  }
}
const seven = buildDispatchParams(disp(pay(2150, 0, 'PENDING'), null, [
  { productName: 'Product A', quantity: 1, unit: 'BAG', lineTotal: 200 },
  { productName: 'Product B', quantity: 1, unit: 'BAG', lineTotal: 300 },
  { productName: 'Product C', quantity: 1, unit: 'BAG', lineTotal: 250 },
  { productName: 'Product D', quantity: 1, unit: 'BAG', lineTotal: 400 },
  { productName: 'Product E', quantity: 1, unit: 'BAG', lineTotal: 350 },
  { productName: 'Product F', quantity: 2, unit: 'BAG', lineTotal: 500 },
  { productName: 'Product G', quantity: 1, unit: 'BAG', lineTotal: 150 },
]), 'EN');
check("7 products (the user's example): size 5; lines 1–4 single; line 5 = E; F; G exactly",
  seven.size === 5 && eq(v(seven, 'ITEMS'), [
    'Product A × 1 Bag – ₹200', 'Product B × 1 Bag – ₹300', 'Product C × 1 Bag – ₹250', 'Product D × 1 Bag – ₹400',
    'Product E × 1 Bag – ₹350; Product F × 2 Bags – ₹500; Product G × 1 Bag – ₹150',
  ]) && seven.omittedProducts === 0, JSON.stringify(v(seven, 'ITEMS')));
check('7 products: rendered with lines 1–5 on separate lines, line 5 has no line break',
  seven.renderedBody.includes('Order details:\nProduct A × 1 Bag – ₹200\nProduct B × 1 Bag – ₹300\nProduct C × 1 Bag – ₹250\nProduct D × 1 Bag – ₹400\nProduct E × 1 Bag – ₹350; Product F × 2 Bags – ₹500; Product G × 1 Bag – ₹150\n'));
for (const n of [6, 12]) {
  for (const lang of ['EN', 'HI'] as const) {
    for (const kind of ['confirmation', 'dispatch'] as const) {
      const its = mk(n);
      const m = kind === 'confirmation' ? buildConfirmationParams({ ...base, items: its }, lang) : buildDispatchParams(disp(pay(5000, 0, 'PENDING'), 'EK1', its), lang);
      const everyProductPresent = its.every((it) => m.renderedBody.includes(`${it.productName} × `));
      check(`${n} products ${kind} ${lang}: size 5, ALL ${n} products present in full, "; " only on line 5, body ≤ 1024`,
        m.size === 5 && everyProductPresent && m.omittedProducts === 0 && !m.shortenedLine &&
        v(m, 'ITEMS').slice(0, 4).every((l) => !l.includes(';')) && v(m, 'ITEMS')[4].split('; ').length === n - 4 &&
        m.renderedBody.length <= BODY_MAX, `len ${m.renderedBody.length}, omitted ${m.omittedProducts}`);
    }
  }
}
for (const lang of ['EN', 'HI'] as const) {
  const its = mk(40, 30);
  const m = buildDispatchParams(disp(pay(99999, 0, 'PENDING'), 'EK1', its), lang);
  const shown = its.filter((it) => m.renderedBody.includes(`${it.productName} × `)).length;
  const suffix = lang === 'EN' ? `… +${m.omittedProducts} more items` : `… +${m.omittedProducts} और उत्पाद`;
  check(`40 long products dispatch ${lang}: body ≤ 1024, "+N more" only on line 5 with the exact count, shown names complete`,
    m.renderedBody.length <= BODY_MAX && m.omittedProducts > 0 && shown + m.omittedProducts === 40 && v(m, 'ITEMS')[4].endsWith(suffix) &&
    !m.shortenedLine && v(m, 'ITEMS').slice(0, 4).every((l) => !l.includes('…')), `len ${m.renderedBody.length}, shown ${shown}, omitted ${m.omittedProducts}`);
}
const huge = buildDispatchParams(disp(pay(10, 0, 'PENDING'), null, [{ productName: 'X'.repeat(3000), quantity: 1, unit: null, lineTotal: 10 }]), 'HI');
check('last resort: one 3000-char product name → that line shortened, body ≤ 1024, flagged', huge.renderedBody.length <= BODY_MAX && huge.shortenedLine);
const longName = 'Satvik Shahi Super Premium Mineral Mixture Feed For Dairy Cattle Twenty Five Kilogram Bag Extra Long Name';
check('a 107-char product name is NOT shortened (the old 80-char cap is gone)', buildConfirmationParams({ ...base, items: [{ productName: longName, quantity: 1, unit: 'BAG', lineTotal: 1 }] }, 'EN').params[2] === `${longName} × 1 Bag`);
check('no product line ever contains a line break or tab (all sizes, both types, both languages)',
  [1, 3, 5, 7, 12].every((n) => (['EN', 'HI'] as const).every((lang) =>
    [buildConfirmationParams({ ...base, items: mk(n) }, lang), buildDispatchParams(disp(pay(1, 0, 'PENDING'), null, mk(n)), lang)]
      .every((m) => m.params.every((p) => paramProblem(p) === null)))));
const dirty = buildConfirmationParams({ customerName: '  Ram\n\tLal     ji  ', orderNumber: ' ORD-2026-000001 ', items: [{ productName: 'Feed\nPlus', quantity: 2, unit: '10 kg', lineTotal: 0 }, { productName: '', quantity: 1, unit: null, lineTotal: 0 }] }, 'EN');
check('dirty data → cleaned only (no translation), legacy unit kept, empty name → "-"',
  eq(dirty.params, ['Ram Lal ji', 'ORD-2026-000001', 'Feed Plus × 2 (10 kg)', '- × 1']), JSON.stringify(dirty.params));
check('no items → size 1 with "-" (never an empty parameter)', (() => { const m = buildConfirmationParams({ ...base, items: [] }, 'EN'); return m.size === 1 && m.params[2] === '-'; })());

console.log(`\n${total - failures}/${total} template checks passed`);

// ── optional: rendered samples for review ────────────────────────────────────
const reviewIdx = process.argv.indexOf('--write-review');
if (reviewIdx > 0 && process.argv[reviewIdx + 1]) {
  const out: string[] = [];
  const block = (title: string, m: BuiltMessage, def: TemplateDefinition, baseName: string) => {
    const r = renderTemplate(def, m.params);
    out.push(`### ${title}`, '', `Template **\`${metaTemplateName(baseName, m.size)}\`** · language \`${def.metaLanguage}\` · ${m.size} product line(s) · ${r.body.length}/${BODY_MAX} characters`, '', '```', `[Header] ${r.header}`, '', r.body, '', `[Footer] ${r.footer}`, '```', '');
  };
  out.push(
    '# Phase 32 — WhatsApp message samples (B6 wording + Q17 layout)',
    '',
    'Generated from `backend/src/services/messaging/templates` by `templates.verify.ts --write-review`.',
    'Names, products, order numbers, units and amounts are inserted exactly as stored, in English, in both languages.',
    'Q17: every product on its own line (templates for 1–5 product lines); orders with more than 5 products use the',
    '5-line template, whose line 5 holds product 5 and every remaining product separated by "; ".',
    '',
    '## The 20 Meta templates',
    '',
    '| Message | English | Hindi |',
    '|---|---|---|',
    ...[1, 2, 3, 4, 5].map((n) => `| Confirmation, ${n} product line(s) | \`ps_order_confirmation_${n}\` (en) | \`ps_order_confirmation_${n}\` (hi) |`),
    ...[1, 2, 3, 4, 5].map((n) => `| Dispatch, ${n} product line(s) | \`ps_order_dispatched_${n}\` (en) | \`ps_order_dispatched_${n}\` (hi) |`),
    '',
    '## Samples',
    '',
  );
  block('Order confirmation — English, 3 products', cEN, getTemplate('confirmation', 'EN', 3), 'ps_order_confirmation');
  block('Order confirmation — Hindi, 3 products', cHI, getTemplate('confirmation', 'HI', 3), 'ps_order_confirmation');
  block('Dispatch — English, Cash on Delivery, 3 products', dEN, getTemplate('dispatched', 'EN', 3), 'ps_order_dispatched');
  block('Dispatch — Hindi, Cash on Delivery, 3 products', dHI, getTemplate('dispatched', 'HI', 3), 'ps_order_dispatched');
  const partHI = buildDispatchParams(disp(pay(1250, 500, 'PARTIAL'), null), 'HI');
  block('Dispatch — Hindi, part prepaid, no Article No. yet, 3 products', partHI, getTemplate('dispatched', 'HI', 3), 'ps_order_dispatched');
  block('Dispatch — English, 7 products (line 5 holds products 5–7)', seven, getTemplate('dispatched', 'EN', 5), 'ps_order_dispatched');
  const oneHI = buildConfirmationParams({ ...base, items: [items[0]] }, 'HI');
  block('Order confirmation — Hindi, 1 product', oneHI, getTemplate('confirmation', 'HI', 1), 'ps_order_confirmation');
  const freeEN = buildDispatchParams(disp(pay(0, 0, 'PAID'), 'EK123456789IN', [{ productName: 'Free Sample Pack', quantity: 1, unit: 'PACKET', lineTotal: 0 }]), 'EN');
  block('Dispatch — English, free order, 1 product', freeEN, getTemplate('dispatched', 'EN', 1), 'ps_order_dispatched');
  fs.writeFileSync(process.argv[reviewIdx + 1], out.join('\n'), 'utf-8');
  console.log(`review samples written to ${process.argv[reviewIdx + 1]}`);
}
process.exit(failures ? 1 : 0);
