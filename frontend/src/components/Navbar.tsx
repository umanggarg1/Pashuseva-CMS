import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Menu, LogOut, KeyRound, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { NavLinks } from './Sidebar';
import { useCurrentUser, useLogout } from '@/lib/auth';

// Bundled as a static frontend asset (frontend/public/) rather than served by the
// backend — it's site branding, not user-uploaded content, so it doesn't need to
// exist on the backend at all, and Vercel serves it directly with no proxy hop.
const LOGO_URL = '/pashuseva-logo.jpeg';

export default function Navbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="print-hide flex items-center justify-between gap-4 border-b bg-card p-4">
      <div className="flex items-center gap-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <img src={LOGO_URL} alt="Pashuseva" className="h-7 w-7 rounded-full object-cover" />
                Pashuseva
              </SheetTitle>
            </SheetHeader>
            <NavLinks className="mt-4" onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="hidden items-center gap-2 sm:flex">
          <img src={LOGO_URL} alt="Pashuseva" className="h-8 w-8 rounded-full object-cover" />
          <h2 className="text-lg font-medium">Pashuseva</h2>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex flex-1 max-w-md items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search customers, orders, products…</span>
        <span className="sm:hidden">Search…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </button>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {user && (
          <span>
            {user.name} <span className="text-xs">({user.role})</span>
          </span>
        )}
        <Button variant="ghost" size="icon" asChild>
          <Link to="/change-password">
            <KeyRound className="h-4 w-4" />
            <span className="sr-only">Change password</span>
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
        >
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Log out</span>
        </Button>
      </div>
    </div>
  );
}
