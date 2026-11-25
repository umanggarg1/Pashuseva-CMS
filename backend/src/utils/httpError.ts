export class HttpError extends Error {
  status: number;
  /** Optional structured extras returned alongside `error` (Phase 32: e.g. a new preview). */
  details?: Record<string, unknown>;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}
