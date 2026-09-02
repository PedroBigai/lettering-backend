import { z } from 'zod';

export const letterDefinitionSchema = z.object({
  value: z.string().regex(/^[A-Z]$/, 'Letter must be one uppercase A-Z character'),
  weight: z.number().int().positive(),
});

export const lettersFileSchema = z
  .object({
    letters: z.array(letterDefinitionSchema).min(1),
  })
  .superRefine(({ letters }, context) => {
    const values = new Set<string>();

    letters.forEach((letter, index) => {
      if (values.has(letter.value)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate letter: ${letter.value}`,
          path: ['letters', index, 'value'],
        });
      }

      values.add(letter.value);
    });
  });

export const wordDefinitionSchema = z.object({
  translations: z.array(z.string().trim().min(1)).min(1),
  description: z.string().trim().min(1),
  score: z.number().int().positive(),
});

export const wordsFileSchema = z.object({
  words: z.record(z.string().regex(/^[a-z]+$/), wordDefinitionSchema),
});
