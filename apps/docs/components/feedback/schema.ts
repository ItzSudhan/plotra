import { z } from 'zod/mini';

export const blockFeedback = z.object({
  /** full URL of page where fired */
  url: z.string(),
  blockId: z.string().check(z.maxLength(200)),
  message: z.string().check(z.minLength(1), z.maxLength(2000)),

  /** the referenced text of block */
  blockBody: z.string().check(z.maxLength(2000)),
});

export const pageFeedback = z.object({
  opinion: z.enum(['good', 'bad']),
  /** full URL of page where fired */
  url: z.string(),
  message: z.string().check(z.minLength(1), z.maxLength(2000)),
});

export const actionResponse = z.object({
  githubUrl: z.optional(z.string()),
});

export type BlockFeedback = z.infer<typeof blockFeedback>;
export type PageFeedback = z.infer<typeof pageFeedback>;
export type ActionResponse = z.infer<typeof actionResponse>;
