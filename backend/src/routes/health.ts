import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Keep-alive target for the scheduled GitHub Actions ping
// (.github/workflows/keep-alive.yml) — deliberately a separate route from the
// plain check above. That one stays DB-independent since Render's own platform
// health monitoring may hit it and expects a fast response regardless of DB
// state. This one also runs a trivial query, so a single scheduled ping here
// keeps both Render's web service AND Neon's autosuspending compute warm,
// instead of only Render. See PHASE20_TODO.md's cold-start note — the one
// factor that prior performance work explicitly flagged as unfixed.
router.get(
  '/warm',
  asyncHandler(async (req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
  })
);

export default router;
