import { Outlet } from 'react-router-dom';

import { useCurrentUser, type Role } from '@/lib/auth';
import ErrorState from '@/components/ErrorState';

export default function RequireRole({ roles }: { roles: Role[] }) {
  const { data: user } = useCurrentUser();

  if (!user || !user.role || !roles.includes(user.role)) {
    return (
      <div className="p-6">
        <ErrorState message="You don't have access to this page." />
      </div>
    );
  }

  return <Outlet />;
}
