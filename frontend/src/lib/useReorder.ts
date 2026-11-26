import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, ApiError } from '@/lib/api';
import {
  clearSubmissionKey,
  existingOrderFrom,
  orderSavedToast,
  reorderScope,
  retryNetworkErrors,
  submissionKey,
  type CreatedOrderResponse,
} from '@/lib/orderSubmit';

/**
 * Phase 32 D3: the Reorder button (Order Detail and Customer Detail's order history).
 * Each Reorder action is one submission with its own Idempotency-Key (scoped to the
 * source order, kept in sessionStorage until the server confirms):
 *  - a double-click or an automatic network retry reuses the key → one order;
 *  - pressing Reorder again after a failure reuses it → the server either creates the
 *    order (the first attempt never got through) or returns the one it already made;
 *  - after success the key is cleared, so the next Reorder is a new, separate order.
 */
export function useReorder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inFlight = useRef<number | null>(null);

  const mutation = useMutation({
    retry: retryNetworkErrors,
    retryDelay: 1000,
    mutationFn: (sourceOrderId: number) =>
      apiFetch<CreatedOrderResponse>(`/orders/${sourceOrderId}/reorder`, {
        method: 'POST',
        headers: { 'Idempotency-Key': submissionKey(reorderScope(sourceOrderId)) },
      }),
    onSuccess: (order, sourceOrderId) => {
      clearSubmissionKey(reorderScope(sourceOrderId));
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      orderSavedToast(order);
      navigate(`/orders/${order.orderNumber}`);
    },
    onError: (err, sourceOrderId) => {
      const existing = existingOrderFrom(err);
      if (existing) {
        // Can't normally happen for Reorder (same source → same details), but if the
        // source order changed in between, start a fresh submission next time.
        clearSubmissionKey(reorderScope(sourceOrderId));
        toast.error(`This order may already exist: ${existing}`, {
          description: 'Open it to check. Press Reorder again to create a new order.',
          action: { label: 'Open it', onClick: () => navigate(`/orders/${existing}`) },
          duration: 15000,
        });
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Failed to reorder');
    },
    onSettled: () => {
      inFlight.current = null;
    },
  });

  return {
    reorder(sourceOrderId: number) {
      if (inFlight.current !== null) return; // a Reorder is already being submitted
      inFlight.current = sourceOrderId;
      mutation.mutate(sourceOrderId);
    },
    isPending: mutation.isPending,
  };
}
