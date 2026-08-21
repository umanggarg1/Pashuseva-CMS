import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { startTrashPurgeScheduler } from './services/trash.service';

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`CRM backend (TypeScript) listening on ${port}`);
  // Hourly sweep for Trash items past their 10-day recovery window — see
  // PHASE16_TODO.md for why this is an in-process interval, not a real cron.
  startTrashPurgeScheduler();
});
