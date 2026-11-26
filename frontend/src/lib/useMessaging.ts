import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';
import {
  hasActiveMessages,
  invalidateAfterRefreshTemplatesOrResume,
  invalidateAfterResolve,
  MESSAGING_PAGE_REFRESH_MS,
  messagingApi,
  messagingKeys,
  ORDER_MESSAGES_REFRESH_MS,
  type ResolveDecision,
} from '@/lib/messaging';

// Phase 32 D7: React Query hooks for the WhatsApp messaging screens. Every mutation
// invalidates exactly the cached data it can change (see lib/messaging.ts).

/** A permission problem or a missing record won't fix itself: don't retry those. */
export function retryUnlessDenied(failureCount: number, error: unknown) {
  if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false;
  return failureCount < 2;
}

export function isPermissionDenied(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/** Order Details → WhatsApp messages; refreshes every 10 s while a message is still active. */
export function useOrderMessages(orderId: number) {
  return useQuery({
    queryKey: messagingKeys.orderMessages(orderId),
    queryFn: () => messagingApi.orderMessages(orderId),
    retry: retryUnlessDenied,
    refetchInterval: (q) => (hasActiveMessages(q.state.data) ? ORDER_MESSAGES_REFRESH_MS : false),
  });
}

/** Settings → WhatsApp Messaging: state, queue, templates (refreshes every 30 s). */
export function useMessagingStatus() {
  return useQuery({
    queryKey: messagingKeys.status(),
    queryFn: messagingApi.status,
    retry: retryUnlessDenied,
    refetchInterval: MESSAGING_PAGE_REFRESH_MS,
  });
}

export function useNeedsAttention(page: number, pageSize: number) {
  return useQuery({
    queryKey: messagingKeys.needsAttention(page, pageSize),
    queryFn: () => messagingApi.needsAttention(page, pageSize),
    retry: retryUnlessDenied,
    refetchInterval: MESSAGING_PAGE_REFRESH_MS,
  });
}

export function useResumeSending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: messagingApi.resume,
    onSettled: () => invalidateAfterRefreshTemplatesOrResume(qc),
  });
}

export function useRefreshTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: messagingApi.refreshTemplates,
    onSettled: () => invalidateAfterRefreshTemplatesOrResume(qc),
  });
}

/**
 * Resolve an UNKNOWN message. Invalidates on success AND on error: a 409 means
 * another Admin resolved it meanwhile, so the list behind the dialog must refresh.
 */
export function useResolveMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { messageId: number; orderId: number | null; decision: ResolveDecision; reason: string }) =>
      messagingApi.resolve(v.messageId, v.decision, v.reason),
    onSettled: (_data, _err, v) => invalidateAfterResolve(qc, v.orderId),
  });
}
