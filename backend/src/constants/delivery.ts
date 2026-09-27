// Phase 22: where every parcel is handed to India Post — used as the tracking
// location when saving an order's first Article No. auto-dispatches it.
export const DEFAULT_DISPATCH_LOCATION = 'Kanina Post Office';

// India Post article number: 2 letters, 9 digits, "IN" (e.g. AB123456789IN).
// Checked against the already trimmed + uppercased value.
export const INDIA_POST_ARTICLE_NUMBER_REGEX = /^[A-Z]{2}\d{9}IN$/;
