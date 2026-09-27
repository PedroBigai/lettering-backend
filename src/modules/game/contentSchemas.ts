import { z } from 'zod';

export const VALID_THEMES = [
  'animals',
  'verbs',
  'adjectives',
  'objects',
  'nouns',
  'food',
  'nature',
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
export const wordDefinitionSchema = z.object({
  word: z.string().regex(/^[A-Z]+$/, 'Word must contain only uppercase A-Z characters'),
  translations: localizedTranslationsSchema,
  score: z.number().int().positive(),
  themes: z.array(z.enum(VALID_THEMES)).min(1),
});

export const wordsFileSchema = z.object({
  schemaVersion: z.literal(2),
  language: z.literal('en-US'),
  themes: z.array(z.enum(VALID_THEMES)).length(VALID_THEMES.length),
  words: z.array(wordDefinitionSchema).min(1),
}).superRefine(({ words }, context) => {
  const seen = new Set<string>();
  words.forEach((entry, index) => {
    if (seen.has(entry.word)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate word: ${entry.word}`,
        path: ['words', index, 'word'],
      });
    }
    seen.add(entry.word);
  });
});
