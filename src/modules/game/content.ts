import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  lettersFileSchema,
  wordsFileSchema,
} from './contentSchemas';
import type { EnglishContent, WordDefinition } from '../../interfaces/game';

const englishDataDirectory = path.resolve(__dirname, '../../../data/english');

let cachedContent: EnglishContent | undefined;

async function readJson(filename: string): Promise<unknown> {
  const filePath = path.join(englishDataDirectory, filename);
  const contents = await readFile(filePath, 'utf8');

  try {
    return JSON.parse(contents) as unknown;
  } catch {
    throw new Error(`Invalid JSON in ${filePath}`);
  }
}

export async function loadEnglishContent(): Promise<EnglishContent> {
  if (cachedContent) return cachedContent;

  const [lettersJson, wordsJson] = await Promise.all([
    readJson('letters.json'),
    readJson('words.json'),
  ]);

  const lettersFile = lettersFileSchema.parse(lettersJson);
  const wordsFile = wordsFileSchema.parse(wordsJson);
  const words = new Map<string, WordDefinition>();
  const wordsByTheme = new Map<string, Map<string, WordDefinition>>();

  Object.entries(wordsFile.general).forEach(([themeName, theme]) => {
    const themeWords = new Map<string, WordDefinition>();

    theme.words.forEach((entry) => {
      const key = normalizeEnglishWord(entry.word);
      const definition: WordDefinition = {
        translations: copyLocalizedLists(entry.translations),
        description: Object.fromEntries(
          Object.entries(entry.description).map(([language, value]) => [language, [value]]),
        ),
        score: entry.score,
      };

      themeWords.set(key, definition);

      const current = words.get(key);
      if (!current) {
        words.set(key, {
          translations: copyLocalizedLists(entry.translations),
          description: Object.fromEntries(
            Object.entries(entry.description).map(([language, value]) => [language, [value]]),
          ),
          score: entry.score,
        });
        return;
      }

      mergeLocalizedLists(current.translations, entry.translations);
      mergeLocalizedLists(
        current.description,
        Object.fromEntries(
          Object.entries(entry.description).map(([language, value]) => [language, [value]]),
        ),
      );
      current.score = Math.max(current.score, entry.score);
    });

    wordsByTheme.set(themeName, themeWords);
  });

  cachedContent = Object.freeze({
    letters: Object.freeze(lettersFile.letters),
    words,
    wordsByTheme,
  });

  return cachedContent;
}

function copyLocalizedLists(values: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(values).map(([language, entries]) => [language, [...entries]]),
  );
}

function mergeLocalizedLists(
  target: Record<string, string[]>,
  source: Record<string, string[]>,
): void {
  Object.entries(source).forEach(([language, entries]) => {
    const current = target[language] ?? [];
    entries.forEach((entry) => {
      if (!current.includes(entry)) current.push(entry);
    });
    target[language] = current;
  });
}

export function normalizeEnglishWord(value: string): string {
  return value.trim().toLowerCase();
}

export function findEnglishWord(
  content: EnglishContent,
  value: string,
): WordDefinition | undefined {
  return content.words.get(normalizeEnglishWord(value));
}

export function getWordsForMatch(
  content: EnglishContent,
  theme?: string | null,
): ReadonlyMap<string, WordDefinition> {
  if (!theme) return content.words;
  return content.wordsByTheme.get(theme) ?? content.words;
}

