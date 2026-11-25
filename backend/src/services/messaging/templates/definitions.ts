import type { Lang } from './i18n';

// Phase 32 B4 (PHASE32_TODO.md §4): the four WhatsApp templates — the single source of
// truth used to (a) render the exact text for previews / the resend dialog and (b)
// submit to Meta (B6 / setup step 8). Category: Utility. Positional variables.
//
// Status: English = as approved in §4.1/§4.2; Hindi wording = approved by the user in
// B6 (2026-11-25). Names/products/order numbers/units/amounts are variables and are
// never translated (frozen language rules).
// PENDING (user decision, see PHASE32_TODO.md §20): the "every product on its own
// line" layout — the product list is still a single {{3}} line here.
//
// Meta limits (official docs, read 2026-11-24): body ≤ 1024 chars, text header ≤ 60,
// footer ≤ 60; template names lowercase letters/digits/underscores. Meta also rejects
// a body that starts or ends with a variable (error 2388299) — checked in the verify.

export type TemplateKey = 'confirmation' | 'dispatched';

export interface TemplateDefinition {
  key: TemplateKey;
  language: Lang;
  /** Meta language code (supported-languages list: "en", "hi"). */
  metaLanguage: 'en' | 'hi';
  status: 'APPROVED_TEXT' | 'DRAFT';
  header: string;
  body: string;
  footer: string;
  paramCount: number;
}

const CONFIRMATION_EN = `Namaste {{1}} ji! 🙏

Thank you for placing your order with PashuSeva.

Your order {{2}} has been successfully received.

Your ordered products:
{{3}}

We are processing your order and will notify you once it is dispatched.

Thank you for choosing PashuSeva! ❤️`;

const DISPATCHED_EN = `Namaste {{1}} ji! 🙏

Good news! Your PashuSeva order {{2}} has been dispatched. 🚚

Order details:
{{3}}

Order summary
• Total amount: ₹{{4}}
• Payment method: {{5}}
• Payment status: {{6}}
• {{7}}
• Tracking number: {{8}}

Expected delivery: approximately 5–7 days from dispatch (estimate, not guaranteed).

Please keep your phone available for delivery updates.

Thank you for choosing PashuSeva! ❤️`;

// Hindi wording approved by the user in B6 (2026-11-25).
const CONFIRMATION_HI = `नमस्ते {{1}} जी! 🙏

पशुसेवा से ऑर्डर करने के लिए धन्यवाद।

आपका ऑर्डर {{2}} सफलतापूर्वक बुक हो गया है।

आपके ऑर्डर में शामिल सामान:
{{3}}

हम आपका ऑर्डर तैयार कर रहे हैं। ऑर्डर भेजे जाने पर आपको सूचना दे दी जाएगी।

पशुसेवा चुनने के लिए धन्यवाद! ❤️`;

const DISPATCHED_HI = `नमस्ते {{1}} जी! 🙏

खुशखबरी! आपका पशुसेवा ऑर्डर {{2}} भेज दिया गया है। 🚚

ऑर्डर का विवरण:
{{3}}

ऑर्डर का हिसाब:
• कुल राशि: ₹{{4}}
• भुगतान का तरीका: {{5}}
• भुगतान की स्थिति: {{6}}
• {{7}}
• ट्रैकिंग नंबर: {{8}}

अनुमानित डिलीवरी: ऑर्डर भेजे जाने के लगभग 5–7 दिनों में पहुंचने की उम्मीद है। यह केवल अनुमान है, पक्की तारीख नहीं।

डिलीवरी अपडेट के लिए कृपया अपना फ़ोन चालू रखें।

पशुसेवा चुनने के लिए धन्यवाद! ❤️`;

export const TEMPLATES: Record<TemplateKey, Record<Lang, TemplateDefinition>> = {
  confirmation: {
    EN: { key: 'confirmation', language: 'EN', metaLanguage: 'en', status: 'APPROVED_TEXT', header: 'PashuSeva', body: CONFIRMATION_EN, footer: 'Order confirmation', paramCount: 3 },
    HI: { key: 'confirmation', language: 'HI', metaLanguage: 'hi', status: 'APPROVED_TEXT', header: 'पशुसेवा', body: CONFIRMATION_HI, footer: 'ऑर्डर की पुष्टि', paramCount: 3 },
  },
  dispatched: {
    EN: { key: 'dispatched', language: 'EN', metaLanguage: 'en', status: 'APPROVED_TEXT', header: 'PashuSeva', body: DISPATCHED_EN, footer: 'Dispatch notification', paramCount: 8 },
    HI: { key: 'dispatched', language: 'HI', metaLanguage: 'hi', status: 'APPROVED_TEXT', header: 'पशुसेवा', body: DISPATCHED_HI, footer: 'डिस्पैच सूचना', paramCount: 8 },
  },
};

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
  if (/\}\}\s*\{\{/.test(def.body)) problems.push('two variables are adjacent');
  if (def.body.length > BODY_MAX) problems.push(`body template is ${def.body.length} > ${BODY_MAX} chars`);
  if (def.header.length > HEADER_MAX) problems.push('header too long');
  if (def.footer.length > FOOTER_MAX) problems.push('footer too long');
  if (/\{\{/.test(def.header) || /\{\{/.test(def.footer)) problems.push('header/footer must have no variables');
  return problems;
}
