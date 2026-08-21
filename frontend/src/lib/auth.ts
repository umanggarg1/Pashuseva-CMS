import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'REJECTED';

export interface CurrentUser {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  // Null until an Admin approves a self-signed-up account (Phase 15) — a PENDING
  // account authenticates fine but has no role and no permissions yet.
  role: Role | null;
  status: AccountStatus;
  permissions: string[];
}

export const CURRENT_USER_KEY = ['auth', 'me'];

export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: () => apiFetch<CurrentUser>('/auth/me'),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiFetch<{ user: CurrentUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(CURRENT_USER_KEY, data.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: CURRENT_USER_KEY });
    },
  });
}

// Frontend permission checks are UX only — the backend independently enforces every
// permission and assignment rule. See phases.md Phase 3 §31. Only Admin bypasses
// unconditionally — Manager access became configurable in the Phase 15 addendum, so
// a Manager is checked against real grants exactly like an Employee, matching the
// backend's authorize()/hasPermission() rule exactly.
export function hasPermission(user: CurrentUser | null | undefined, permission: string) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return user.permissions.includes(permission);
}
