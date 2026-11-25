import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../../config';
import logger from '../../logger';
import { processWebhook, verifySignature, webhookPayloadSchema } from '../../services/messaging/webhook.service';

// Phase 32 C7 (PHASE32_TODO.md §12): Meta's WhatsApp webhook — public (Meta calls
// it), so it is protected by Meta's own mechanisms instead of a login:
//   GET  — subscription handshake: echo hub.challenge only for our verify token;
//   POST — the X-Hub-Signature-256 HMAC is checked over the RAW body (this router is
//          mounted BEFORE express.json() in app.ts so the exact bytes are available).
// Its own generous rate limit (Meta sends bursts), separate from the app's.
const router = Router();

router.use(rateLimit({ windowMs: 60_000, limit: 2000, standardHeaders: true, legacyHeaders: false }));

router.get('/', (req, res) => {
  const token = config.whatsapp.webhookVerifyToken;
  if (token && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token && typeof req.query['hub.challenge'] === 'string') {
    res.status(200).type('text/plain').send(req.query['hub.challenge']);
    return;
  }
  res.sendStatus(403);
});

router.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const secret = config.whatsapp.appSecret;
  if (!secret) {
    res.status(503).json({ error: 'WhatsApp webhook is not configured' });
    return;
  }
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySignature(raw, req.get('X-Hub-Signature-256'), secret)) {
    logger.warn('[whatsapp:webhook] rejected: invalid or missing signature');
    res.sendStatus(401);
    return;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    logger.warn('[whatsapp:webhook] signed body is not valid JSON — ignored');
    res.sendStatus(200); // Meta would otherwise retry garbage forever
    return;
  }
  const parsed = webhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn('[whatsapp:webhook] unexpected payload shape — ignored');
    res.sendStatus(200);
    return;
  }
  try {
    const result = await processWebhook(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    // Database trouble: answer non-2xx so Meta retries; reports are de-duplicated,
    // so a retry is always safe.
    logger.error('[whatsapp:webhook] processing failed, Meta will retry:', err instanceof Error ? err.message : err);
    res.sendStatus(500);
  }
});

export default router;
