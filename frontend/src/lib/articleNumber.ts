// Phase 22: mirrors backend/src/constants/delivery.ts's INDIA_POST_ARTICLE_NUMBER_REGEX
// (kept in sync manually, same as parcelSettings) — lets the editor reject a bad
// format instantly instead of waiting on a 400. The backend still re-checks.
export const INDIA_POST_ARTICLE_NUMBER_REGEX = /^[A-Z]{2}\d{9}IN$/;

export const ARTICLE_NUMBER_FORMAT_HINT =
  'Article No. must be 2 letters, 9 digits, then IN — e.g. AB123456789IN';

export function normalizeArticleNumber(value: string) {
  return value.trim().toUpperCase();
}
