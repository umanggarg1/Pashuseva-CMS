// Phase 29: was 10 days. Items already in Trash were extended by the
// 20261005120000_trash_retention_30_days migration (expiry = deletedAt + 30 days).
export const TRASH_RETENTION_DAYS = 30;

export function computeDeletionExpiry(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + TRASH_RETENTION_DAYS);
  return expires;
}
