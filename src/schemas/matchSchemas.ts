import { z } from 'zod';

import { VALID_THEMES } from '../modules/game/contentSchemas';

export const createMatchSchema = z
  .object({
    mode: z.enum(['classic', 'learning', 'hardcore']).default('classic'),
    language: z.literal('en-US').default('en-US'),
    theme: z.enum(VALID_THEMES).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.mode === 'learning') {
        return Boolean(data.theme);
      }
      return true;
    },
    {
      message: 'Theme is required for learning mode',
      path: ['theme'],
    },
  );

export const matchIdParamsSchema = z.object({
  matchId: z.string().uuid(),
});

export const placePieceSchema = z.object({
  pieceId: z.string().uuid(),
  column: z.number().int().min(0).max(8),
  boardVersion: z.number().int().nonnegative(),
});

export const confirmWordSchema = z.object({
  boardVersion: z.number().int().nonnegative(),
});

export const matchHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});
