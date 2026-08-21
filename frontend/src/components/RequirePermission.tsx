import { Outlet } from 'react-router-dom';

import { useCurrentUser, hasPermission } from '@/lib/auth';
import ErrorState from '@/components/ErrorState';

export default function RequirePermission({ permission }: { permission: string }) {
  const { data: user } = useCurrentUser();

  if (!hasPermission(user, permission)) {
    return (
      <div className="p-6">
        <ErrorState message="You don't have access to this page." />
      </div>
    );
  }

  return <Outlet />;
}
