import { Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useCurrentUser, useLogout } from '@/lib/auth';

// Shown instead of the normal app shell for a PENDING account — Phase 15. The
// account can log in, but every real route is still blocked server-side
// (authorize()/requireRole() both reject a role-less user), so this is purely
// informational, not an access boundary itself.
export default function PendingApproval() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Clock className="mb-2 h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Waiting for approval</h1>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            {user?.name ? `Hi ${user.name}, y` : 'Y'}our account is waiting for approval from
            an administrator. You&apos;ll be able to access the CRM once your account has
            been approved.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
