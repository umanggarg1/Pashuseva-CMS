import { toast } from 'sonner';

// PHASE7_TODO.md addendum, 2026-09-14 — the India Post homepage, per explicit
// user instruction (revised from the deep-linked consignment-tracking page).
// No API integration: this opens the site and the user pastes the Article
// Number themselves (per the requested manual flow) — never autofilled, never
// scraped.
export const INDIA_POST_TRACKING_URL = 'https://www.indiapost.gov.in/';

// Shared by Orders.tsx and OrderDetail.tsx. Opens the India Post tracking tab
// FIRST, synchronously within the click's user gesture, then copies the article
// number to the clipboard — calling window.open after an awaited clipboard write
// risks some browsers' popup blocker treating it as outside the original gesture.
// The tab still opens even if the clipboard write fails (tracking must still work).
export function openArticleNumberTracking(articleNumber: string) {
  window.open(INDIA_POST_TRACKING_URL, '_blank', 'noopener,noreferrer');
  navigator.clipboard
    .writeText(articleNumber)
    .then(() => toast.success('Article number copied. Opening India Post...'))
    .catch(() => toast.error('Could not copy the article number — opening India Post anyway'));
}
