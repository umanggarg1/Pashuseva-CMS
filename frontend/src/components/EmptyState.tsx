import { Inbox } from 'lucide-react';

// Phase 14 §18: same visual language as ErrorState.tsx (border-dashed box, icon,
// muted text) so an empty list and a failed list read as the same family of state,
// not two different ad-hoc looks depending on which page you're on.
export default function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
