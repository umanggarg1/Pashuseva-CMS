import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { logger } from '../logger';
import { HttpError } from '../utils/httpError';

// Phase 14 §7/§17: an error response must say what happened in plain language — never
// a raw internal error message (a Prisma constraint failure, a stack trace fragment).
// The zod branch below reuses whatever custom `.min(1, '...')`-style message a schema
// already defines (most of this app's schemas have one); when a field has no custom
// message, zod's own default is prefixed with the field name so at least *which*
// field is wrong is visible, instead of the previous literal "Validation failed" for
// every failure regardless of cause.
function zodMessage(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return 'Validation failed';
  const field = first.path.join('.');
  return field ? `${field}: ${first.message}` : first.message;
}

// Only the two Prisma error codes this app can actually hit from a genuine race
// (two requests passing the same application-level uniqueness pre-check at once) or a
// stale reference — not an exhaustive Prisma error catalog, just the ones worth a
// friendlier message than the generic 500 fallback.
function prismaMessage(err: Prisma.PrismaClientKnownRequestError): { status: number; message: string } | null {
  if (err.code === 'P2002') {
    const target = (err.meta?.target as string[] | undefined)?.[0];
    return { status: 409, message: target ? `This ${target} is already in use.` : 'This value is already in use.' };
  }
  if (err.code === 'P2025') {
    return { status: 404, message: 'The requested record could not be found.' };
  }
  return null;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  logger.error(err instanceof Error ? err.stack : err);

  if (err instanceof ZodError) {
    res.status(400).json({ error: zodMessage(err), issues: err.issues });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const known = prismaMessage(err);
    if (known) {
      res.status(known.status).json({ error: known.message });
      return;
    }
  }

  // Every other exception (including any other Prisma error class, or a genuine bug)
  // is logged above with its full detail — the client only ever gets a generic
  // message, never the raw error text.
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
}
