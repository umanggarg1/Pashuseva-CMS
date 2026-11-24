// Phase 32 B4 (PHASE32_TODO.md §3, §4.4, E37): make any stored text safe to use as a
// WhatsApp template parameter WITHOUT changing what it says. Names, product names,
// order numbers stay exactly as stored apart from whitespace/control characters —
// nothing is translated, transliterated, re-cased or re-spelled.
//
// Meta rules for body parameters: no newlines/tabs, not more than 4 consecutive
// spaces, never empty. We collapse every whitespace run to ONE space (the only
// multi-space text we emit is our own item separator, added after sanitizing).

// Control characters (C0, DEL and C1) are all removed. The zero-width joiner and
// non-joiner (U+200C/U+200D) are not control characters and are deliberately KEPT —
// Devanagari text needs them.
// The pattern is built from code points so the source holds no literal control bytes.
const CONTROL = new RegExp(
  '[' + String.fromCharCode(0) + '-' + String.fromCharCode(0x1f) + String.fromCharCode(0x7f) + '-' + String.fromCharCode(0x9f) + ']',
  'g'
);
const INVISIBLE = /[\u200B\u2060\uFEFF]/g; // zero-width space, word joiner, BOM

// Intl.Segmenter exists at runtime on Node 20+ (package.json "engines"), but its
// typings live in TypeScript's ES2022 lib while this project targets ES2020 — a local
// declaration avoids changing the project-wide tsconfig for one API.
type GraphemeSegmenter = { segment(text: string): Iterable<{ segment: string }> };
const SegmenterCtor = (Intl as unknown as {
  Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => GraphemeSegmenter;
}).Segmenter;
const segmenter = new SegmenterCtor('en', { granularity: 'grapheme' });

export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** Length in user-perceived characters (a Devanagari conjunct or an emoji = 1). */
export function graphemeLength(text: string): number {
  return graphemes(text).length;
}

/**
 * Truncate to at most `max` graphemes, ending with '…' when cut. Never splits a
 * conjunct, an emoji or a combining mark.
 */
export function truncateGraphemes(text: string, max: number): string {
  const g = graphemes(text);
  if (g.length <= max) return text;
  return g.slice(0, Math.max(max - 1, 1)).join('').trimEnd() + '…';
}

/**
 * Whitespace/control cleanup only. Returns '-' for something that ends up empty,
 * because Meta rejects empty parameters.
 */
export function sanitizeParam(value: unknown, maxGraphemes = 200): string {
  const text = String(value ?? '')
    .normalize('NFC')
    .replace(/[\r\n\t\f\v]/g, ' ')
    .replace(CONTROL, ' ')
    .replace(INVISIBLE, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (text === '') return '-';
  return truncateGraphemes(text, maxGraphemes);
}

/** Meta's rules, used by the builders as a final self-check. Returns a problem or null. */
export function paramProblem(p: string): string | null {
  if (p.trim() === '') return 'empty';
  if (/[\r\n\t]/.test(p)) return 'newline or tab';
  if (/ {5,}/.test(p)) return 'more than 4 consecutive spaces';
  return null;
}
