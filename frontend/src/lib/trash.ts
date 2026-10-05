// How long a deleted item stays recoverable in Trash. Must match the backend's
// TRASH_RETENTION_DAYS (backend/src/utils/trash.ts) — kept in sync manually, same as
// parcelSettings. Phase 27 Part B: was 10.
export const TRASH_RETENTION_DAYS = 30;
