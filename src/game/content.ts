import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  lettersFileSchema,
  type LetterDefinition,
  type WordDefinition,
  wordsFileSchema,
} from './contentSchemas';

export type EnglishContent = {
  letters: readonly LetterDefinition[];
  words: ReadonlyMap<string, WordDefinition>;
};

const englishDataDirectory = path.resolve(__dirname, '../../data/english');

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

  cachedContent = Object.freeze({
    letters: Object.freeze(lettersFile.letters),
    words: new Map(Object.entries(wordsFile.words)),
  });

  return cachedContent;
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
