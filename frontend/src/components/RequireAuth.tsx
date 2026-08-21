import { Navigate, Outlet } from 'react-router-dom';

import { useCurrentUser } from '@/lib/auth';
import { Skeleton } from '@/components/ui/skeleton';
import PendingApproval from '@/pages/PendingApproval';

export default function RequireAuth() {
  const { data: user, isPending, isError } = useCurrentUser();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />;
  }

  // A PENDING account authenticates fine but never reaches the app shell — every
  // real route is blocked server-side regardless, this is just what they see
  // instead of a blank/broken dashboard (Phase 15).
  if (user.status === 'PENDING') {
    return <PendingApproval />;
  }

  return <Outlet />;
}
