import type { OrderPaymentSummary } from '../../../utils/paymentSummary';
import { BODY_MAX, renderTemplate, TEMPLATES, TemplateDefinition, TemplateKey } from './definitions';
import { formatQuantity, formatRupees } from './format';
import { amountLine, Lang, moreItems, PAYMENT_METHOD, PAYMENT_STATUS, TRACKING_FALLBACK } from './i18n';
import { graphemeLength, paramProblem, sanitizeParam, truncateGraphemes } from './sanitize';

// Phase 32 B4 (PHASE32_TODO.md §4): order snapshot → template parameters.
//
// FROZEN RULES enforced here:
//   - customer name, product names, order number, quantities, units, amounts and the
//     Article No. are inserted exactly as stored (only whitespace/control cleanup) —
//     never translated or transliterated, identical in English and Hindi messages;
//   - only the fixed words from i18n.ts change with the language;
//   - {{5}} payment method uses the exact Q12 strings.
// Pure functions: the snapshot is built from the database elsewhere (B5), and the
// returned params are stored on the OutboundMessage row at enqueue so retries send
// exactly the same text.

export interface MessageItem {
  productName: string; // OrderItem.productName (snapshot taken when ordered)
  quantity: number;
  unit: string | null; // OrderItem.unit
  lineTotal: number; // OrderItem.totalPrice
}

export interface ConfirmationSnapshot {
  customerName: string;
  orderNumber: string;
  items: MessageItem[];
}

export interface DispatchSnapshot extends ConfirmationSnapshot {
  payment: OrderPaymentSummary; // from getOrderPaymentSummary (B0) — never recomputed here
  articleNumber: string | null;
}

export interface BuiltMessage {
  templateKey: TemplateKey;
  language: Lang;
  params: string[];
  /** The exact body the customer would see — for previews, audit and tests. */
  renderedBody: string;
}

const NAME_MAX = 60;
const ORDER_NO_MAX = 40;
const ITEM_NAME_MAX = 80;
const ITEMS_HARD_MAX = 600;
const ITEM_SEPARATOR = '  |  '; // 2 spaces each side — within Meta's "max 4 spaces"
const SAFETY_MARGIN = 16;

function itemText(item: MessageItem, withPrice: boolean): string {
  const name = sanitizeParam(item.productName, ITEM_NAME_MAX);
  const qty = formatQuantity(item.quantity, item.unit === null ? null : sanitizeParam(item.unit, 30));
  return withPrice ? `${name} × ${qty} – ₹${formatRupees(item.lineTotal)}` : `${name} × ${qty}`;
}

/** Shorten text (on grapheme boundaries, ending with an ellipsis) until it fits `maxUnits`. */
function fitLength(text: string, maxUnits: number): string {
  if (text.length <= maxUnits) return text;
  let g = graphemeLength(text);
  let out = text;
  while (out.length > maxUnits && g > 1) {
    g--;
    out = truncateGraphemes(text, g);
  }
  return out;
}

/**
 * Join item lines into one parameter of at most `budget` UTF-16 units (the same unit
 * the 1024-character body limit is checked in, and never fewer than graphemes), adding
 * "+N more items" when not everything fits.
 */
function itemsParam(items: MessageItem[], withPrice: boolean, lang: Lang, budget: number): string {
  if (items.length === 0) return '-';
  const lines = items.map((i) => itemText(i, withPrice));
  for (let count = lines.length; count >= 1; count--) {
    const shown = lines.slice(0, count).join(ITEM_SEPARATOR);
    const rest = lines.length - count;
    const candidate = rest > 0 ? `${shown}${ITEM_SEPARATOR}${moreItems(lang, rest)}` : shown;
    if (candidate.length <= budget) return candidate;
  }
  // Even the first item alone doesn't fit: shorten that one line.
  const rest = lines.length - 1;
  const suffix = rest > 0 ? `${ITEM_SEPARATOR}${moreItems(lang, rest)}` : '';
  return fitLength(lines[0], Math.max(budget - suffix.length, 10)) + suffix;
}

function finish(def: TemplateDefinition, params: string[]): BuiltMessage {
  if (params.length !== def.paramCount) {
    throw new Error(`template ${def.key}/${def.language} needs ${def.paramCount} params, got ${params.length}`);
  }
  params.forEach((p, i) => {
    const problem = paramProblem(p);
    if (problem) throw new Error(`param {{${i + 1}}} of ${def.key}/${def.language}: ${problem}`);
  });
  const renderedBody = renderTemplate(def, params).body;
  if (renderedBody.length > BODY_MAX) {
    throw new Error(`${def.key}/${def.language} body is ${renderedBody.length} > ${BODY_MAX} chars`);
  }
  return { templateKey: def.key, language: def.language, params, renderedBody };
}

/** Room left for the items parameter once everything else is filled in. */
function itemsBudget(def: TemplateDefinition, paramsWithoutItems: string[], itemsIndex: number): number {
  const probe = [...paramsWithoutItems];
  probe.splice(itemsIndex, 0, '');
  const lengthWithoutItems = renderTemplate(def, probe).body.length;
  // Counted in UTF-16 units, which is never less than the character count Meta uses.
  return Math.min(ITEMS_HARD_MAX, BODY_MAX - lengthWithoutItems - SAFETY_MARGIN);
}

export function buildConfirmationParams(s: ConfirmationSnapshot, lang: Lang): BuiltMessage {
  const def = TEMPLATES.confirmation[lang];
  const name = sanitizeParam(s.customerName, NAME_MAX);
  const orderNo = sanitizeParam(s.orderNumber, ORDER_NO_MAX);
  const budget = itemsBudget(def, [name, orderNo], 2);
  return finish(def, [name, orderNo, itemsParam(s.items, false, lang, budget)]);
}

export function buildDispatchParams(s: DispatchSnapshot, lang: Lang): BuiltMessage {
  const def = TEMPLATES.dispatched[lang];
  const { kind, total, paid, due } = s.payment;
  const name = sanitizeParam(s.customerName, NAME_MAX);
  const orderNo = sanitizeParam(s.orderNumber, ORDER_NO_MAX);
  const others = [
    name,
    orderNo,
    formatRupees(total),
    PAYMENT_METHOD[lang][kind],
    PAYMENT_STATUS[lang][kind],
    amountLine(lang, kind, { total, paid, due }),
    s.articleNumber && s.articleNumber.trim() !== '' ? sanitizeParam(s.articleNumber, 40) : TRACKING_FALLBACK[lang],
  ];
  const budget = itemsBudget(def, others, 2);
  const params = [...others];
  params.splice(2, 0, itemsParam(s.items, true, lang, budget));
  return finish(def, params);
}
