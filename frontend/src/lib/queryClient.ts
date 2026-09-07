import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query';
import { ApiError } from './api';

// Phase 20 Step 2: a single place that reacts to ANY query/mutation getting a 401
// — needed now that RequireAuth no longer gates every other page's queries behind
// /auth/me resolving first (a stale/missing session used to only ever surface via
// that one gate; now any protected query can hit it directly). A full reload
// rather than a client-side navigate is deliberate here — it also clears every
// now-invalid cached query, not just the one that failed.
//
// Without the removal of the RequireAuth waterfall, a 401 only ever came from one
// query at a time. Now several protected requests can be in flight together (e.g.
// /auth/me and /dashboard/summary firing in parallel), so an expired session can
// make more than one of them 401 in the same tick — this guard makes sure that
// only triggers a single redirect, not one per failing query.
let redirectingToLogin = false;
function redirectToLoginOn401(error: unknown) {
  if (
    redirectingToLogin ||
    !(error instanceof ApiError) ||
    error.status !== 401 ||
    window.location.pathname === '/login'
  ) {
    return;
  }
  redirectingToLogin = true;
  window.location.assign('/login');
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: redirectToLoginOn401 }),
  mutationCache: new MutationCache({ onError: redirectToLoginOn401 }),
  defaultOptions: {
    queries: {
      // Retrying a 401 is pointless — it'll just fail again — and only delays the
      // redirect above. Every other error keeps the previous 1-retry behavior.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 1;
      },
      staleTime: 30_000,
    },
  },
});
