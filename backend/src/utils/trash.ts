export const TRASH_RETENTION_DAYS = 10;

export function computeDeletionExpiry(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + TRASH_RETENTION_DAYS);
  return expires;
}
