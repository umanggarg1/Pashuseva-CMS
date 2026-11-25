import type { Lang } from './i18n';

// Phase 32 B4 + Q17 (PHASE32_TODO.md §4, §20.1): the WhatsApp templates — the single
// source of truth used to (a) render the exact text for previews / the resend dialog
// and (b) submit to Meta (setup step 8). Category: Utility. Positional variables.
//
// Wording: English = as approved in §4.1/§4.2; Hindi = approved by the user in B6
// (2026-11-25). Names/products/order numbers/units/amounts are variables and are
// never translated (frozen language rules).
//
// Q17 (user, 2026-11-25): EVERY PRODUCT ON ITS OWN LINE. A parameter can't contain a
// line break, so the line breaks live in the fixed template text and each product line
// is its own parameter. That needs one template per number of product lines:
// sizes 1–5 × {confirmation, dispatched} × {EN, HI} = 20 Meta templates, named
// `<base>_<size>` (e.g. ps_order_dispatched_3). Orders with more than 5 products use
// size 5: lines 1–4 = products 1–4, line 5 = product 5 + all the rest joined by "; ".
//
// Meta limits (official docs, read 2026-11-24): body ≤ 1024 chars, text header ≤ 60,
// footer ≤ 60; template names lowercase letters/digits/underscores; a body can't start
// or end with a variable (error 2388299); "too many variables for the length" (2388293)
// is checked by Meta at review — see templateProblems.

export type TemplateKey = 'confirmation' | 'dispatched';
/** Named slots, filled by the builders; their {{n}} numbers depend on the size. */
export type Slot = 'NAME' | 'ORDER' | 'ITEMS' | 'TOTAL' | 'METHOD' | 'STATUS' | 'AMOUNT' | 'TRACKING';

export const MAX_PRODUCT_LINES = 5;
export const TEMPLATE_SIZES = [1, 2, 3, 4, 5] as const;

export interface TemplateDefinition {
  key: TemplateKey;
  language: Lang;
  /** Meta language code (supported-languages list: "en", "hi"). */
  metaLanguage: 'en' | 'hi';
  /** Number of product lines (1–5). */
  size: number;
  header: string;
  body: string;
  footer: string;
  paramCount: number;
  /** Slot → 0-based parameter indices (ITEMS has `size` of them, the others one). */
  slots: Partial<Record<Slot, number[]>>;
}

// Base texts. {{ITEMS}} expands to `size` lines, one product parameter per line.
const BASE: Record<TemplateKey, Record<Lang, { header: string; footer: string; body: string }>> = {
  confirmation: {
    EN: {
      header: 'PashuSeva',
      footer: 'Order confirmation',
      body: `Namaste {{NAME}} ji! 🙏

Thank you for placing your order with PashuSeva.

Your order {{ORDER}} has been successfully received.

Your ordered products:
{{ITEMS}}

We are processing your order and will notify you once it is dispatched.

Thank you for choosing PashuSeva! ❤️`,
    },
    HI: {
      header: 'पशुसेवा',
      footer: 'ऑर्डर की पुष्टि',
      body: `नमस्ते {{NAME}} जी! 🙏

पशुसेवा से ऑर्डर करने के लिए धन्यवाद।

आपका ऑर्डर {{ORDER}} सफलतापूर्वक बुक हो गया है।

आपके ऑर्डर में शामिल सामान:
{{ITEMS}}

हम आपका ऑर्डर तैयार कर रहे हैं। ऑर्डर भेजे जाने पर आपको सूचना दे दी जाएगी।

पशुसेवा चुनने के लिए धन्यवाद! ❤️`,
    },
  },
  dispatched: {
    EN: {
      header: 'PashuSeva',
      footer: 'Dispatch notification',
      body: `Namaste {{NAME}} ji! 🙏

Good news! Your PashuSeva order {{ORDER}} has been dispatched. 🚚

Order details:
{{ITEMS}}

Order summary
• Total amount: ₹{{TOTAL}}
• Payment method: {{METHOD}}
• Payment status: {{STATUS}}
• {{AMOUNT}}
• Tracking number: {{TRACKING}}

Expected delivery: approximately 5–7 days from dispatch (estimate, not guaranteed).

Please keep your phone available for delivery updates.

Thank you for choosing PashuSeva! ❤️`,
    },
    HI: {
      header: 'पशुसेवा',
      footer: 'डिस्पैच सूचना',
      body: `नमस्ते {{NAME}} जी! 🙏

खुशखबरी! आपका पशुसेवा ऑर्डर {{ORDER}} भेज दिया गया है। 🚚

ऑर्डर का विवरण:
{{ITEMS}}

ऑर्डर का हिसाब:
• कुल राशि: ₹{{TOTAL}}
• भुगतान का तरीका: {{METHOD}}
• भुगतान की स्थिति: {{STATUS}}
• {{AMOUNT}}
• ट्रैकिंग नंबर: {{TRACKING}}

अनुमानित डिलीवरी: ऑर्डर भेजे जाने के लगभग 5–7 दिनों में पहुंचने की उम्मीद है। यह केवल अनुमान है, पक्की तारीख नहीं।

डिलीवरी अपडेट के लिए कृपया अपना फ़ोन चालू रखें।

पशुसेवा चुनने के लिए धन्यवाद! ❤️`,
    },
  },
};

function generate(key: TemplateKey, language: Lang, size: number): TemplateDefinition {
  const base = BASE[key][language];
  const slots: Partial<Record<Slot, number[]>> = {};
  let next = 0;
  const body = base.body.replace(/\{\{([A-Z]+)\}\}/g, (_m, name: string) => {
    const slot = name as Slot;
    if (slot === 'ITEMS') {
      const indices = Array.from({ length: size }, () => next++);
      slots.ITEMS = indices;
      return indices.map((i) => `{{${i + 1}}}`).join('\n');
    }
    slots[slot] = [next];
    return `{{${++next}}}`;
  });
  return {
    key,
    language,
    metaLanguage: language === 'EN' ? 'en' : 'hi',
    size,
    header: base.header,
    body,
    footer: base.footer,
    paramCount: next,
    slots,
  };
}

const CACHE = new Map<string, TemplateDefinition>();

/** The template for this message type, language and number of product lines (1–5). */
export function getTemplate(key: TemplateKey, language: Lang, size: number): TemplateDefinition {
  if (!Number.isInteger(size) || size < 1 || size > MAX_PRODUCT_LINES) {
    throw new Error(`template size must be 1..${MAX_PRODUCT_LINES}, got ${size}`);
  }
  const k = `${key}/${language}/${size}`;
  let def = CACHE.get(k);
  if (!def) {
    def = generate(key, language, size);
    CACHE.set(k, def);
  }
  return def;
}

/** All 20 templates, for verification, the review document and Meta submission. */
export function allTemplates(): TemplateDefinition[] {
  const out: TemplateDefinition[] = [];
  for (const key of ['confirmation', 'dispatched'] as const) {
    for (const size of TEMPLATE_SIZES) {
      for (const lang of ['EN', 'HI'] as const) out.push(getTemplate(key, lang, size));
    }
  }
  return out;
}

/** Meta template name for a size: `<configured base name>_<size>` (e.g. ps_order_confirmation_3). */
export function metaTemplateName(baseName: string, size: number): string {
  return `${baseName}_${size}`;
}

export const BODY_MAX = 1024;
export const HEADER_MAX = 60;
export const FOOTER_MAX = 60;

/** The exact text the customer will see for these parameters (header, body, footer). */
export function renderTemplate(def: TemplateDefinition, params: string[]): { header: string; body: string; footer: string } {
  const body = def.body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => params[Number(n) - 1] ?? `{{${n}}}`);
  return { header: def.header, body, footer: def.footer };
}

/** Structural problems Meta would reject (used by the verify script). */
export function templateProblems(def: TemplateDefinition): string[] {
  const problems: string[] = [];
  const vars = Array.from(def.body.matchAll(/\{\{(\d+)\}\}/g), (m) => Number(m[1]));
  const expected = Array.from({ length: def.paramCount }, (_, i) => i + 1);
  if (JSON.stringify(vars) !== JSON.stringify(expected)) problems.push(`variables ${JSON.stringify(vars)} are not exactly {{1}}..{{${def.paramCount}}} in order`);
  if (/^\s*\{\{\d+\}\}/.test(def.body)) problems.push('body starts with a variable');
  if (/\{\{\d+\}\}\s*$/.test(def.body)) problems.push('body ends with a variable');
  // Two variables with nothing between them on the SAME line would read as one; the
  // product lines are deliberately separated only by a line break (Q17 layout).
  if (/\}\}[ \t]*\{\{/.test(def.body)) problems.push('two variables are adjacent on one line');
  if (/\{\{[A-Z]+\}\}/.test(def.body)) problems.push('an unexpanded named slot remains');
  if (def.body.length > BODY_MAX) problems.push(`body template is ${def.body.length} > ${BODY_MAX} chars`);
  if (def.header.length > HEADER_MAX) problems.push('header too long');
  if (def.footer.length > FOOTER_MAX) problems.push('footer too long');
  if (/\{\{/.test(def.header) || /\{\{/.test(def.footer)) problems.push('header/footer must have no variables');
  return problems;
}
