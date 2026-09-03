import { z } from 'zod';

export const VALID_THEMES = [
  'animals',
  'objects',
  'verbs',
  'food',
  'places',
  'adjectives',
  'colors',
  'nature',
  'professions',
] as const;

export type ValidTheme = (typeof VALID_THEMES)[number];

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

const translationListSchema = z.array(z.string().trim().min(1)).min(1);
const localizedTranslationsSchema = z.object({
  'pt-BR': translationListSchema,
  'es-ES': translationListSchema,
});
const localizedDescriptionSchema = z.object({
  'pt-BR': z.string().trim().min(1),
  'en-US': z.string().trim().min(1),
  'es-ES': z.string().trim().min(1),
});

export const wordDefinitionSchema = z.object({
  word: z.string().regex(/^[A-Z]+$/, 'Word must contain only uppercase A-Z characters'),
  translations: localizedTranslationsSchema,
  description: localizedDescriptionSchema,
  score: z.number().int().positive(),
});

const themeSchema = z.object({
  words: z.array(wordDefinitionSchema).min(1),
});

export const wordsFileSchema = z.object({
  schemaVersion: z.literal(1),
  language: z.literal('en-US'),
  general: z.record(z.string().trim().min(1), themeSchema),
});
