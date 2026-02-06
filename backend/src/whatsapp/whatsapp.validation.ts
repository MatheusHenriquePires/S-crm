import { z } from 'zod';

export const SendMessageSchema = z.object({
  accountId: z.string().uuid(),
  body: z.string().min(1, 'Message body cannot be empty'),
  replyToWamid: z.string().optional().nullable(),
});

export type SendMessageDto = z.infer<typeof SendMessageSchema>;
