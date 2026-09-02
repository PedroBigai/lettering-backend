import type { z } from 'zod';
import type {
  letterDefinitionSchema,
  lettersFileSchema,
  wordDefinitionSchema,
  wordsFileSchema,
} from '../modules/game/contentSchemas';

export type LetterDefinition = z.infer<typeof letterDefinitionSchema>;
export type LettersFile = z.infer<typeof lettersFileSchema>;
export type WordDefinition = z.infer<typeof wordDefinitionSchema>;
export type WordsFile = z.infer<typeof wordsFileSchema>;
export type RandomInt = (maxExclusive: number) => number;
export type WordDirection = 'horizontal' | 'vertical';

export interface EnglishContent {
  letters: readonly LetterDefinition[];
  words: ReadonlyMap<string, WordDefinition>;
}

export interface BatchRules {
  size: number;
  minVowels: number;
  maxConsecutiveEqual: number;
  uniqueLetters?: boolean;
  maxAttempts?: number;
}

export interface BoardCell {
  pieceId: string;
  letter: string;
  row: number;
  column: number;
}

export interface MovedCell {
  pieceId: string;
  letter: string;
  fromRow: number;
  toRow: number;
  column: number;
}

export interface FoundWord {
  word: string;
  direction: WordDirection;
  definition: WordDefinition;
  cells: BoardCell[];
}
