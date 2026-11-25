import type { OrderPaymentSummary } from '../../../utils/paymentSummary';
import { BODY_MAX, getTemplate, MAX_PRODUCT_LINES, renderTemplate, Slot, TemplateDefinition, TemplateKey } from './definitions';
import { formatQuantity, formatRupees } from './format';
import { amountLine, Lang, moreItems, PAYMENT_METHOD, PAYMENT_STATUS, TRACKING_FALLBACK } from './i18n';
import { graphemeLength, paramProblem, sanitizeParam, truncateGraphemes } from './sanitize';

// Phase 32 B4 + Q17 (PHASE32_TODO.md §4, §20.1): order snapshot → template parameters.
//
// FROZEN RULES enforced here:
//   - customer name, product names, order number, quantities, units, amounts and the
//     Article No. are inserted exactly as stored (only whitespace/control cleanup) —
//     never translated or transliterated, identical in English and Hindi messages;
//   - only the fixed words from i18n.ts change with the language;
//   - {{5}}-style payment method uses the exact Q12 strings.
// Q17 product layout:
//   - 1–5 products → template size = product count, one product per line;
//   - more than 5 → size 5: lines 1–4 = products 1–4, line 5 = product 5 + every
//     remaining product joined by "; " (one line, no line breaks);
//   - no product is omitted and no product name is shortened — EXCEPT if the whole
//     message would exceed WhatsApp's 1024-character body limit: then line 5 keeps as
//     many whole products as fit and ends "… +N more items"; and (last resort, never
//     seen in real data) a single product line too long to fit at all is shortened.
// Pure functions: the snapshot is built from the database elsewhere (B5); the returned
// params are stored on the OutboundMessage row at enqueue so retries send exactly the
// same text.

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
  /** Number of product lines = template size (1–5); Meta name is `<base>_<size>`. */
  size: number;
  params: string[];
  /** The same values by slot (ITEMS = one entry per product line). */
  values: Partial<Record<Slot, string[]>>;
  /** Products not shown because the 1024 limit was reached (0 in practice). */
  omittedProducts: number;
  /** True only in the last-resort case where a product line itself was shortened. */
  shortenedLine: boolean;
  /** The exact body the customer would see — for previews, audit and tests. */
  renderedBody: string;
}

const NAME_MAX = 60; // customer name
const ORDER_NO_MAX = 40;
const NO_SHORTENING = 100_000; // product names are never shortened by the sanitizer
const LINE5_SEPARATOR = '; ';
const SAFETY_MARGIN = 16;

function itemText(item: MessageItem, withPrice: boolean): string {
  const name = sanitizeParam(item.productName, NO_SHORTENING);
  const qty = formatQuantity(item.quantity, item.unit === null ? null : sanitizeParam(item.unit, NO_SHORTENING));
  return withPrice ? `${name} × ${qty} – ₹${formatRupees(item.lineTotal)}` : `${name} × ${qty}`;
}

/** Last resort only: shorten on grapheme boundaries (ending "…") until `maxUnits` fits. */
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

const sum = (lines: string[]) => lines.reduce((n, l) => n + l.length, 0);

/** Shorten the longest lines (last resort) until the lines fit `budget` units in total. */
function shrinkToFit(lines: string[], budget: number): { lines: string[]; shortened: boolean } {
  const out = [...lines];
  let shortened = false;
  while (sum(out) > budget) {
    let longest = 0;
    out.forEach((l, i) => { if (l.length > out[longest].length) longest = i; });
    const over = sum(out) - budget;
    const target = Math.max(out[longest].length - over, 10);
    const next = fitLength(out[longest], target);
    if (next === out[longest]) break; // can't shorten further
    out[longest] = next;
    shortened = true;
  }
  return { lines: out, shortened };
}

/**
 * The product lines for a template: exactly min(products, 5) lines. `budget` is the
 * room (in UTF-16 units — never less than the character count Meta uses) left for
 * all product lines together.
 */
function productLines(items: MessageItem[], withPrice: boolean, lang: Lang, budget: number):
  { lines: string[]; omitted: number; shortened: boolean } {
  if (items.length === 0) return { lines: ['-'], omitted: 0, shortened: false };
  const texts = items.map((i) => itemText(i, withPrice));

  if (texts.length <= MAX_PRODUCT_LINES) {
    const r = shrinkToFit(texts, budget);
    return { lines: r.lines, omitted: 0, shortened: r.shortened };
  }

  // More than 5: lines 1–4 individually, line 5 = all the rest joined by "; ".
  const first = shrinkToFit(texts.slice(0, MAX_PRODUCT_LINES - 1), Math.max(budget - 40, 40));
  const rest = texts.slice(MAX_PRODUCT_LINES - 1);
  const room = budget - sum(first.lines);
  const all = rest.join(LINE5_SEPARATOR);
  if (all.length <= room) return { lines: [...first.lines, all], omitted: 0, shortened: first.shortened };
  for (let shown = rest.length - 1; shown >= 1; shown--) {
    const candidate = `${rest.slice(0, shown).join(LINE5_SEPARATOR)}${LINE5_SEPARATOR}${moreItems(lang, rest.length - shown)}`;
    if (candidate.length <= room) {
      return { lines: [...first.lines, candidate], omitted: rest.length - shown, shortened: first.shortened };
    }
  }
  // Even product 5 alone doesn't fit next to "+N more": last resort, shorten it.
  const suffix = `${LINE5_SEPARATOR}${moreItems(lang, rest.length - 1)}`;
  const line5 = fitLength(rest[0], Math.max(room - suffix.length, 10)) + suffix;
  return { lines: [...first.lines, line5], omitted: rest.length - 1, shortened: true };
}

function assemble(def: TemplateDefinition, values: Partial<Record<Slot, string[]>>): string[] {
  const params = new Array<string>(def.paramCount);
  for (const [slot, indices] of Object.entries(def.slots) as [Slot, number[]][]) {
    const v = values[slot];
    if (!v || v.length !== indices.length) {
      throw new Error(`${def.key}/${def.language}/${def.size}: slot ${slot} needs ${indices.length} value(s)`);
    }
    indices.forEach((paramIndex, i) => { params[paramIndex] = v[i]; });
  }
  return params;
}

/** Room for the product lines once every other value is in place. */
function productBudget(def: TemplateDefinition, values: Partial<Record<Slot, string[]>>): number {
  const probe = assemble(def, { ...values, ITEMS: Array.from({ length: def.size }, () => '') });
  return BODY_MAX - renderTemplate(def, probe).body.length - SAFETY_MARGIN;
}

function build(
  key: TemplateKey,
  lang: Lang,
  items: MessageItem[],
  withPrice: boolean,
  values: Partial<Record<Slot, string[]>>
): BuiltMessage {
  const size = Math.min(Math.max(items.length, 1), MAX_PRODUCT_LINES);
  const def = getTemplate(key, lang, size);
  const products = productLines(items, withPrice, lang, productBudget(def, values));
  const allValues = { ...values, ITEMS: products.lines };
  const params = assemble(def, allValues);
  params.forEach((p, i) => {
    const problem = paramProblem(p);
    if (problem) throw new Error(`param {{${i + 1}}} of ${key}/${lang}/${size}: ${problem}`);
  });
  const renderedBody = renderTemplate(def, params).body;
  if (renderedBody.length > BODY_MAX) {
    throw new Error(`${key}/${lang}/${size} body is ${renderedBody.length} > ${BODY_MAX} chars`);
  }
  return {
    templateKey: key,
    language: lang,
    size,
    params,
    values: allValues,
    omittedProducts: products.omitted,
    shortenedLine: products.shortened,
    renderedBody,
  };
}

export function buildConfirmationParams(s: ConfirmationSnapshot, lang: Lang): BuiltMessage {
  return build('confirmation', lang, s.items, false, {
    NAME: [sanitizeParam(s.customerName, NAME_MAX)],
    ORDER: [sanitizeParam(s.orderNumber, ORDER_NO_MAX)],
  });
}

export function buildDispatchParams(s: DispatchSnapshot, lang: Lang): BuiltMessage {
  const { kind, total, paid, due } = s.payment;
  return build('dispatched', lang, s.items, true, {
    NAME: [sanitizeParam(s.customerName, NAME_MAX)],
    ORDER: [sanitizeParam(s.orderNumber, ORDER_NO_MAX)],
    TOTAL: [formatRupees(total)],
    METHOD: [PAYMENT_METHOD[lang][kind]],
    STATUS: [PAYMENT_STATUS[lang][kind]],
    AMOUNT: [amountLine(lang, kind, { total, paid, due })],
    TRACKING: [s.articleNumber && s.articleNumber.trim() !== '' ? sanitizeParam(s.articleNumber, 40) : TRACKING_FALLBACK[lang]],
  });
}
