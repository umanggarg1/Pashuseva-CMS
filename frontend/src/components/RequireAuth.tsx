import { Navigate, Outlet } from 'react-router-dom';

import { useCurrentUser } from '@/lib/auth';
import PendingApproval from '@/pages/PendingApproval';

// Phase 20 Step 1: no longer blocks <Outlet/> on /auth/me resolving first — every
// protected page's own queries (e.g. Home's dashboard summary) now fire the moment
// the route mounts, in parallel with this auth check, instead of waiting for it.
// The backend's authenticate middleware is the real access boundary regardless
// (see checkAccess.ts/authorize.ts) — this component only ever controlled *when
// the UI noticed* a bad session, never *what data was reachable*. An
// unauthenticated visitor's protected queries will 401 and get redirected by the
// shared handler in queryClient.ts, same outcome as before, just not gating
// everything else on this one query first.
export default function RequireAuth() {
  const { data: user, isPending, isError } = useCurrentUser();

  // Only redirect once we actually know this failed — isPending means we simply
  // don't have an answer yet, not that the user is logged out.
  if (!isPending && (isError || !user)) {
    return <Navigate to="/login" replace />;
  }

  // A PENDING account authenticates fine but never reaches the app shell — every
  // real route is blocked server-side regardless (Phase 15). This only takes
  // effect once /auth/me resolves; there's a brief flash of the normal shell
  // first, an accepted tradeoff for not blocking every other page's data fetch on
  // this resolving before anything else can start.
  if (user?.status === 'PENDING') {
    return <PendingApproval />;
  }

  return <Outlet />;
}
