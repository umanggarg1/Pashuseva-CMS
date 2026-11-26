import { z } from 'zod';

// Phase 32 C6 (PHASE32_TODO.md §13, §14): request validation for the WhatsApp message
// routes. Message types use the plan's short names in URLs/bodies.

export const messageTypeSchema = z.enum(['confirmation', 'dispatched']);

export const resendReasonSchema = z.enum(['NOT_RECEIVED', 'NUMBER_CHANGED', 'CUSTOMER_ASKED', 'OTHER']);

export const previewQuerySchema = z.object({ type: messageTypeSchema });

export const resendBodySchema = z
  .object({
    type: messageTypeSchema,
    reason: resendReasonSchema,
    /** Free text; required when reason is OTHER. */
    note: z.string().trim().max(200).optional(),
    /** From the preview the user confirmed — the message is only sent if it still matches. */
    previewHash: z.string().regex(/^[0-9a-f]{64}$/, 'previewHash must come from the preview'),
  })
  .refine((b) => b.reason !== 'OTHER' || (b.note && b.note.length >= 3), {
    message: 'Please write the reason (at least 3 characters)',
    path: ['note'],
  });

export const messageIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const messagingListQuerySchema = z.object({
  status: z.enum(['UNKNOWN', 'FAILED', 'QUEUED', 'RETRY_WAIT', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'SKIPPED']).optional(),
  needsAttention: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// Phase 32 D6: the Admin's reason is MANDATORY (stored in resolutionNote).
export const RESOLUTION_REASON_REQUIRED = 'A reason is required to resolve this message (at least 3 characters)';
export const resolveBodySchema = z.object({
  action: z.enum(['mark-sent', 'mark-failed', 'mark-failed-and-resend'], {
    errorMap: () => ({ message: 'Choose "mark-sent", "mark-failed" or "mark-failed-and-resend"' }),
  }),
  reason: z
    .string({ required_error: RESOLUTION_REASON_REQUIRED, invalid_type_error: RESOLUTION_REASON_REQUIRED })
    .trim()
    .min(3, RESOLUTION_REASON_REQUIRED)
    .max(300, 'The reason can be at most 300 characters'),
});

export type MessageTypeParam = z.infer<typeof messageTypeSchema>;
export type ResendBody = z.infer<typeof resendBodySchema>;
