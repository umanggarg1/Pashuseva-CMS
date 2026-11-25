import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { startTrashPurgeScheduler } from './services/trash.service';
import { startWhatsappWorker, stopWhatsappWorker } from './services/messaging/dispatcher';

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`CRM backend (TypeScript) listening on ${port}`);
  // Hourly sweep for Trash items past their recovery window (TRASH_RETENTION_DAYS) — see
  // PHASE16_TODO.md for why this is an in-process interval, not a real cron.
  startTrashPurgeScheduler();
  // Phase 32 B9: WhatsApp sending worker — only runs when WHATSAPP_ENABLED=true;
  // with WhatsApp off nothing is started and nothing is ever sent.
  startWhatsappWorker().catch((err) => console.error('[whatsapp] worker failed to start:', err));
});

// Phase 32 B9: on shutdown (Render sends SIGTERM) stop claiming new WhatsApp messages
// and let in-flight sends finish (max ~10 s) before exiting.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    stopWhatsappWorker().finally(() => process.exit(0));
  });
}
