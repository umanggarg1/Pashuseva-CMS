import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import healthRouter from './routes/health';
import apiRouter from './routes/api';
import { errorHandler } from './middleware/errorHandler';
import config from './config';

const app = express();

// The frontend runs on a different origin (Vite dev server) and uses HttpOnly-cookie
// auth (`credentials: 'include'` in lib/api.ts), so both an explicit origin (not `*`)
// and `credentials: true` are required — the browser rejects wildcard-origin CORS
// responses on credentialed requests.
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Publicly-servable static files (product images, store logo) — a scaffold only for
// now, nothing writes here yet (no upload endpoint exists). Deliberately excluded
// from git (public/uploads/.gitignore): only images belong here, nothing that could
// ever be sensitive — customer records, exports, etc. must never be routed through
// this, per the security review that flagged what a "public" folder actually means.
app.use('/public', express.static(path.join(__dirname, '../public')));

app.use('/api/health', healthRouter);
app.use('/api', apiRouter);

app.use(errorHandler);

export default app;
