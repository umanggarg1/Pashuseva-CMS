import { Request, Response } from 'express';
import { orderIdParamSchema } from '../schemas/order.schema';
import {
  messageIdParamSchema,
  messagingListQuerySchema,
  previewQuerySchema,
  resendBodySchema,
  resolveBodySchema,
} from '../schemas/messaging.schema';
import { HttpError } from '../utils/httpError';
import { hasPermission } from '../utils/permissions';
import { listOrderMessages, previewResend, createResend, resendReasonText } from '../services/messaging/resend.service';
import * as admin from '../services/messaging/admin.service';

// Phase 32 C6 (PHASE32_TODO.md §14). Route permissions + order Data Scope are applied
// in the routers (authorize + checkOrderAccess); handlers only validate and call.

function actingUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

function readRequestKey(req: Request): string | undefined {
  const raw = req.get('Idempotency-Key');
  if (raw === undefined || raw === '') return undefined;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(raw)) throw new HttpError(400, 'Invalid Idempotency-Key header (8–128 letters, digits, "-" or "_")');
  return raw;
}

export const messagingController = {
  async listForOrder(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const user = actingUser(req);
    res.json(await listOrderMessages(id, { includeAdminNotes: hasPermission(user, 'message:manage') }));
  },

  async preview(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const { type } = previewQuerySchema.parse(req.query);
    res.json(await previewResend(id, type));
  },

  async resend(req: Request, res: Response) {
    const { id } = orderIdParamSchema.parse(req.params);
    const body = resendBodySchema.parse(req.body);
    const user = actingUser(req);
    const result = await createResend(
      id,
      { type: body.type, reasonText: resendReasonText(body.reason, body.note), previewHash: body.previewHash, requestKey: readRequestKey(req) },
      user
    );
    res.status(result.replay ? 200 : 201).json(result);
  },

  // ── Admin Messaging page (message:manage) ──
  async status(_req: Request, res: Response) {
    res.json(await admin.messagingStatus());
  },

  async list(req: Request, res: Response) {
    res.json(await admin.listMessages(messagingListQuerySchema.parse(req.query)));
  },

  async resolve(req: Request, res: Response) {
    const { id } = messageIdParamSchema.parse(req.params);
    const { action, note } = resolveBodySchema.parse(req.body);
    res.json(await admin.resolveUnknown(id, action, note, actingUser(req)));
  },

  async resume(req: Request, res: Response) {
    res.json(await admin.resume(actingUser(req)));
  },

  async refreshTemplates(req: Request, res: Response) {
    res.json(await admin.refreshTemplates(actingUser(req)));
  },
};
