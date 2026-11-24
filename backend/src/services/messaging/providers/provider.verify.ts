/**
 * Standalone verification for Phase 32 B2/B3: providers, error classification,
 * provider selection and WhatsApp config validation.
 *
 * NO REAL WHATSAPP TRAFFIC: the Meta provider is pointed at a fake Meta server on
 * 127.0.0.1, and global fetch is wrapped so ANY request to a non-localhost host aborts
 * the run.
 *
 * This project has no test runner, so this is a plain script:
 *     npx ts-node src/services/messaging/providers/provider.verify.ts
 * Exits 0 when every case passes, 1 otherwise.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { MetaCloudProvider } from './metaCloud';
import { DryRunProvider } from './dryRun';
import { createWhatsAppProvider } from './index';
import { classifyMetaError, META_ERROR_RULES } from './metaErrors';
import { parseWhatsappEnv } from '../whatsappConfig';
import type { SendResult, SendTemplateRequest } from './types';

// ── hard guard: nothing may leave this machine ────────────────────────────────
const realFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    console.error(`BLOCKED non-local request to ${url.hostname} — aborting`);
    process.exit(3);
  }
  fetchCalls++;
  return realFetch(input, init);
}) as typeof fetch;

let failures = 0;
let total = 0;
function check(name: string, ok: boolean, detail = '') {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const show = (r: SendResult) => JSON.stringify(r);

const TOKEN = 'TEST-TOKEN-must-never-appear-in-results';
const REQ: SendTemplateRequest = {
  to: '919876543210',
  templateName: 'ps_order_confirmation',
  language: 'hi',
  bodyParams: ['Ram Lal', 'ORD-2026-001025', 'Satvik Shahi Mixer Feed × 2 Bags'],
  callbackData: 'ORDER_CREATED:1025',
};

type Behaviour = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;
let behaviour: Behaviour = () => {};
let lastBody = '';
let lastAuth = '';
let lastPath = '';

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    lastBody = body;
    lastAuth = String(req.headers.authorization ?? '');
    lastPath = req.url ?? '';
    behaviour(req, res, body);
  });
});

const json = (status: number, obj: unknown, headers: Record<string, string> = {}): Behaviour => (_q, res) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
};
const metaError = (status: number, code: number, headers: Record<string, string> = {}) =>
  json(status, { error: { message: `(#${code}) test`, type: 'OAuthException', code, error_data: { messaging_product: 'whatsapp', details: 'test details' }, fbtrace_id: 'x' } }, headers);

async function main() {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const meta = new MetaCloudProvider({ accessToken: TOKEN, phoneNumberId: '123456', apiVersion: 'v26.0', baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 400 });

  async function scenario(name: string, b: Behaviour, expect: (r: SendResult) => boolean) {
    behaviour = b;
    const r = await meta.sendTemplate(REQ);
    check(name, expect(r) && !show(r).includes(TOKEN), show(r));
    return r;
  }

  // ── B2: request shape ────────────────────────────────────────────────────────
  await scenario('200 valid → ACCEPTED with wamid', json(200, { messaging_product: 'whatsapp', contacts: [{ input: '919876543210', wa_id: '919876543210' }], messages: [{ id: 'wamid.HBgLtest123' }] }),
    (r) => r.outcome === 'ACCEPTED' && r.providerMessageId === 'wamid.HBgLtest123');
  const sent = JSON.parse(lastBody);
  check('request: POST /v26.0/123456/messages', lastPath === '/v26.0/123456/messages', lastPath);
  check('request: Bearer token header', lastAuth === `Bearer ${TOKEN}`);
  check('request: template body shape per Meta docs',
    sent.messaging_product === 'whatsapp' && sent.recipient_type === 'individual' && sent.to === '919876543210' && sent.type === 'template' &&
    sent.template.name === 'ps_order_confirmation' && sent.template.language.code === 'hi' &&
    sent.template.components[0].type === 'body' &&
    JSON.stringify(sent.template.components[0].parameters) === JSON.stringify(REQ.bodyParams.map((text) => ({ type: 'text', text }))));
  check('request: biz_opaque_callback_data = eventKey', sent.biz_opaque_callback_data === 'ORDER_CREATED:1025');
  check('request: names/products sent exactly as given (UTF-8 ×, Hindi language untouched)', sent.template.components[0].parameters[2].text === 'Satvik Shahi Mixer Feed × 2 Bags');

  await scenario('200 with pacing status → ACCEPTED + pacingStatus', json(200, { messages: [{ id: 'wamid.paced1', message_status: 'held_for_quality_assessment' }] }),
    (r) => r.outcome === 'ACCEPTED' && r.pacingStatus === 'held_for_quality_assessment');

  // ── B3: ambiguous successes are never SENT ───────────────────────────────────
  await scenario('200 malformed JSON → AMBIGUOUS', (_q, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"messages":[{"id":'); }, (r) => r.outcome === 'AMBIGUOUS');
  await scenario('200 empty body → AMBIGUOUS', (_q, res) => { res.writeHead(200); res.end(); }, (r) => r.outcome === 'AMBIGUOUS');
  await scenario('200 without messages[] → AMBIGUOUS', json(200, { messaging_product: 'whatsapp' }), (r) => r.outcome === 'AMBIGUOUS');
  await scenario('200 with id not starting wamid. → AMBIGUOUS', json(200, { messages: [{ id: '12345' }] }), (r) => r.outcome === 'AMBIGUOUS');
  await scenario('200 headers then body cut off → AMBIGUOUS', (_q, res) => { res.writeHead(200, { 'content-type': 'application/json', 'content-length': '200' }); res.write('{"messages":[{"id":"wamid.x'); setTimeout(() => res.socket?.destroy(), 20); }, (r) => r.outcome === 'AMBIGUOUS');

  // ── B3: Meta error objects ───────────────────────────────────────────────────
  await scenario('131026 not on WhatsApp → PERMANENT', metaError(400, 131026), (r) => r.outcome === 'REJECTED' && r.kind === 'PERMANENT' && r.code === '131026');
  await scenario('131009 invalid parameter → PERMANENT', metaError(400, 131009), (r) => r.outcome === 'REJECTED' && r.kind === 'PERMANENT');
  await scenario('190 token expired → CONFIGURATION', metaError(401, 190), (r) => r.outcome === 'REJECTED' && r.kind === 'CONFIGURATION' && !r.templateScoped);
  await scenario('368 account restricted → CONFIGURATION', metaError(400, 368), (r) => r.outcome === 'REJECTED' && r.kind === 'CONFIGURATION');
  await scenario('132015 template paused → CONFIGURATION, template-scoped', metaError(400, 132015), (r) => r.outcome === 'REJECTED' && r.kind === 'CONFIGURATION' && r.templateScoped === true);
  await scenario('132001 template not approved in language → template-scoped', metaError(404, 132001), (r) => r.outcome === 'REJECTED' && r.templateScoped === true);
  await scenario('130429 throughput + Retry-After: 7 → TEMPORARY, rateLimited, 7 s', metaError(429, 130429, { 'retry-after': '7' }), (r) => r.outcome === 'REJECTED' && r.kind === 'TEMPORARY' && r.rateLimited === true && r.retryAfterSeconds === 7);
  await scenario('131056 same-recipient pair limit → TEMPORARY, NOT account-wide', metaError(400, 131056), (r) => r.outcome === 'REJECTED' && r.kind === 'TEMPORARY' && !r.rateLimited);
  await scenario('131000 unknown error ("Try again") → TEMPORARY', metaError(500, 131000), (r) => r.outcome === 'REJECTED' && r.kind === 'TEMPORARY');
  await scenario('unknown code with HTTP 400 → PERMANENT (fail safe)', metaError(400, 999001), (r) => r.outcome === 'REJECTED' && r.kind === 'PERMANENT');
  await scenario('unknown code with HTTP 503 → TEMPORARY (explicit rejection)', metaError(503, 999002), (r) => r.outcome === 'REJECTED' && r.kind === 'TEMPORARY');
  await scenario('HTTP 500 without body → AMBIGUOUS', (_q, res) => { res.writeHead(500); res.end(); }, (r) => r.outcome === 'AMBIGUOUS');
  await scenario('HTTP 502 HTML gateway page → AMBIGUOUS', (_q, res) => { res.writeHead(502, { 'content-type': 'text/html' }); res.end('<html>Bad gateway</html>'); }, (r) => r.outcome === 'AMBIGUOUS');
  await scenario('HTTP 429 without body → TEMPORARY rateLimited', (_q, res) => { res.writeHead(429, { 'retry-after': '3' }); res.end(); }, (r) => r.outcome === 'REJECTED' && r.kind === 'TEMPORARY' && r.rateLimited === true && r.retryAfterSeconds === 3);
  await scenario('HTTP 401 without body → CONFIGURATION', (_q, res) => { res.writeHead(401); res.end(); }, (r) => r.outcome === 'REJECTED' && r.kind === 'CONFIGURATION');

  // ── B3: network trouble ──────────────────────────────────────────────────────
  await scenario('no response within timeout → AMBIGUOUS (never retried)', () => { /* never answer */ }, (r) => r.outcome === 'AMBIGUOUS' && r.code === 'TIMEOUT');
  await scenario('socket destroyed after request received → AMBIGUOUS', (_q, res) => res.socket?.destroy(), (r) => r.outcome === 'AMBIGUOUS');

  const closed = http.createServer();
  await new Promise<void>((r) => closed.listen(0, '127.0.0.1', () => r()));
  const closedPort = (closed.address() as AddressInfo).port;
  await new Promise<void>((r) => closed.close(() => r()));
  const refused = await new MetaCloudProvider({ accessToken: TOKEN, phoneNumberId: '1', apiVersion: 'v26.0', baseUrl: `http://127.0.0.1:${closedPort}`, timeoutMs: 400 }).sendTemplate(REQ);
  check('connection refused (never sent) → TEMPORARY', refused.outcome === 'REJECTED' && refused.kind === 'TEMPORARY' && refused.code === 'NETWORK_ECONNREFUSED', show(refused));

  const beforeInvalid = fetchCalls;
  const invalid = await meta.sendTemplate({ ...REQ, bodyParams: ['Ram Lal', 'line1\nline2', 'x'] });
  check('invalid params rejected BEFORE any request (no fetch)', invalid.outcome === 'REJECTED' && invalid.kind === 'PERMANENT' && fetchCalls === beforeInvalid, show(invalid));

  server.close();

  // ── error table sanity ───────────────────────────────────────────────────────
  check('no Meta error code maps to AMBIGUOUS', Object.values(META_ERROR_RULES).every((r) => r.kind !== ('AMBIGUOUS' as never)));
  check('every rate-limit rule is TEMPORARY', Object.values(META_ERROR_RULES).filter((r) => r.rateLimited).every((r) => r.kind === 'TEMPORARY'));
  check('every template-scoped rule is CONFIGURATION', Object.values(META_ERROR_RULES).filter((r) => r.templateScoped).every((r) => r.kind === 'CONFIGURATION'));
  check('classifyMetaError marks unknown codes', classifyMetaError(424242, 400).known === false);

  // ── dry-run never touches the network ────────────────────────────────────────
  const before = fetchCalls;
  const dry = new DryRunProvider('verify');
  const d1 = await dry.sendTemplate(REQ);
  check('dry-run → ACCEPTED with fake wamid.DRYRUN id', d1.outcome === 'ACCEPTED' && d1.providerMessageId.startsWith('wamid.DRYRUN.'), show(d1));
  const d2 = await dry.sendTemplate({ ...REQ, bodyParams: ['', 'x', 'y'] });
  check('dry-run still rejects an invalid request (empty param)', d2.outcome === 'REJECTED' && d2.kind === 'PERMANENT');
  const d3 = await dry.sendTemplate({ ...REQ, to: '9876543210' });
  check('dry-run rejects a non-normalized recipient', d3.outcome === 'REJECTED');
  check('dry-run made ZERO network calls', fetchCalls === before, `${fetchCalls - before} calls`);

  // ── config validation + provider selection (the safety switches) ─────────────
  const env = (extra: Record<string, string>) => parseWhatsappEnv(extra);
  const creds = { WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_APP_SECRET: 's', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'v' };
  const def = env({});
  check('no WhatsApp env at all → valid, disabled, dryrun, v26.0, default template names',
    def.ok && !def.config.enabled && def.config.provider === 'dryrun' && def.config.apiVersion === 'v26.0' &&
    def.config.templates.confirmation === 'ps_order_confirmation' && def.config.templates.dispatched === 'ps_order_dispatched');
  const half = env({ WHATSAPP_ENABLED: 'true', WHATSAPP_PROVIDER: 'meta' });
  check('enabled + meta WITHOUT credentials → config error (app refuses to start)', !half.ok && Object.keys((half as { errors: object }).errors).length === 4, JSON.stringify(!half.ok && half.errors));
  check('WHATSAPP_ENABLED=yes → config error (only true/false)', !env({ WHATSAPP_ENABLED: 'yes' }).ok);
  check('bad template name → config error', !env({ WHATSAPP_TEMPLATE_CONFIRMATION: 'Order Confirmation' }).ok);

  const pick = (e: Record<string, string>, nodeEnv: string) => {
    const p = parseWhatsappEnv(e);
    if (!p.ok) throw new Error('unexpected config error');
    return createWhatsAppProvider(p.config, nodeEnv).provider;
  };
  check('default config → dry-run', pick({}, 'production').name === 'dryrun');
  check('meta selected but WHATSAPP_ENABLED unset → dry-run', pick({ WHATSAPP_PROVIDER: 'meta', ...creds }, 'production').name === 'dryrun');
  check('enabled + meta in DEVELOPMENT without the extra flag → dry-run (blocked)', pick({ WHATSAPP_ENABLED: 'true', WHATSAPP_PROVIDER: 'meta', ...creds }, 'development').sendsRealMessages === false);
  check('enabled + meta in TEST without the extra flag → dry-run (blocked)', pick({ WHATSAPP_ENABLED: 'true', WHATSAPP_PROVIDER: 'meta', ...creds }, 'test').sendsRealMessages === false);
  check('enabled + meta in development WITH WHATSAPP_ALLOW_NON_PRODUCTION_SEND=true → meta (E21 only)', pick({ WHATSAPP_ENABLED: 'true', WHATSAPP_PROVIDER: 'meta', WHATSAPP_ALLOW_NON_PRODUCTION_SEND: 'true', ...creds }, 'development').name === 'meta');
  check('enabled + meta in production → meta', pick({ WHATSAPP_ENABLED: 'true', WHATSAPP_PROVIDER: 'meta', ...creds }, 'production').name === 'meta');
  check('enabled + dryrun in production → dry-run', pick({ WHATSAPP_ENABLED: 'true', WHATSAPP_PROVIDER: 'dryrun' }, 'production').name === 'dryrun');

  console.log(`\n${total - failures}/${total} provider checks passed  (fake-server requests: ${fetchCalls}, real WhatsApp requests: 0)`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
