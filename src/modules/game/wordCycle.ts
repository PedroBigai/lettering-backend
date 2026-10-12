import type { BoardCell, LetterDefinition, RandomInt } from '../../interfaces/game';
import { drawWeightedLetter } from './letterGenerator';

export const ACTIVE_WORD_COUNT = 3;
export const WORD_DROP_INTERVALS = [0, 4, 10, 22, 46, 70, 100] as const;
export const KNOWLEDGE_THRESHOLDS = [0, 1, 5, 10, 15, 20, 25] as const;
export const KNOWLEDGE_WEIGHTS = [100, 55, 30, 16, 8, 3, 0] as const;
export const WORD_MASTERY_LEVEL = KNOWLEDGE_THRESHOLDS.length - 1;

export function knowledgeLevelForSuccesses(successes: number): number {
  const safeSuccesses = Math.max(0, Math.floor(Number(successes) || 0));
  let level = 0;
  for (let index = 1; index < KNOWLEDGE_THRESHOLDS.length; index += 1) {
    if (safeSuccesses < KNOWLEDGE_THRESHOLDS[index]) break;
    level = index;
  }
  return level;
}

export function knowledgeWeightForSuccesses(successes: number): number {
  return KNOWLEDGE_WEIGHTS[knowledgeLevelForSuccesses(successes)];
}

export interface ActiveCycleWord {
  word: string;
  theme: string;
  level: number;
  dueDrop: number;
  appearances: number;
  successes: number;
}

export interface WordCycle {
  schemaVersion: 1;
  dropNumber: number;
  activeWords: ActiveCycleWord[];
}

export function createWordCycle(
  words: readonly string[],
  theme: string,
  successes: ReadonlyMap<string, number> = new Map(),
): WordCycle {
  return {
    schemaVersion: 1,
    dropNumber: 0,
    activeWords: words.slice(0, ACTIVE_WORD_COUNT).map((word, index) => ({
      word: word.toUpperCase(), theme,
      level: knowledgeLevelForSuccesses(successes.get(word.toUpperCase()) ?? 0),
      dueDrop: index, appearances: 0, successes: successes.get(word.toUpperCase()) ?? 0,
    })),
  };
}

export function parseWordCycle(value: unknown): WordCycle | null {
  try {
    const parsed = (typeof value === 'string' ? JSON.parse(value) : value) as WordCycle;
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.activeWords)) return null;
    return parsed;
  } catch { return null; }
}

export function selectFocusWord(cycle: WordCycle): ActiveCycleWord | undefined {
  return [...cycle.activeWords].sort((a, b) =>
    Number(a.dueDrop > cycle.dropNumber) - Number(b.dueDrop > cycle.dropNumber)
    || a.dueDrop - b.dueDrop || a.level - b.level || a.appearances - b.appearances,
  )[0];
}

export function generateCycleLetterOptions(
  cycle: WordCycle,
  _board: readonly BoardCell[],
  letters: readonly LetterDefinition[],
  randomInt: RandomInt,
): string[] {
  if (!cycle.activeWords.length) return [];
  const options: string[] = [];
  const add = (letter?: string) => { if (letter && !options.includes(letter)) options.push(letter); };
  const addRandom = (vowelOnly = false) => {
    const candidates = letters.filter(({ value }) =>
      !options.includes(value) && (!vowelOnly || 'AEIOU'.includes(value)),
    );
    if (candidates.length) add(drawWeightedLetter(candidates, randomInt));
  };

  const availableWords = [...cycle.activeWords];
  const selectedWords: ActiveCycleWord[] = [];
  while (selectedWords.length < 2 && availableWords.length) {
    selectedWords.push(availableWords.splice(randomInt(availableWords.length), 1)[0]);
  }
  for (const item of selectedWords) {
    const candidates = [...new Set(item.word)].filter(letter => !options.includes(letter));
    if (candidates.length) add(candidates[randomInt(candidates.length)]);
    item.appearances += 1;
  }
  while (options.length < 3) addRandom(!options.some(letter => 'AEIOU'.includes(letter)));
  while (options.length < 4) addRandom(!options.some(letter => 'AEIOU'.includes(letter)));

  cycle.dropNumber += 1;
  for (let index = options.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [options[index], options[other]] = [options[other], options[index]];
  }
  return options;
}

export function registerCycleSuccess(
  cycle: WordCycle,
  word: string,
  replacement?: { word: string; successes: number },
) {
  const active = cycle.activeWords.find((item) => item.word === word.toUpperCase());
  if (!active) return null;
  const previousLevel = active.level;
  active.successes += 1;
  const understandingScore = active.successes;
  active.level = knowledgeLevelForSuccesses(active.successes);
  active.dueDrop = cycle.dropNumber + WORD_DROP_INTERVALS[active.level];
  const mastered = active.level === WORD_MASTERY_LEVEL;
  if (replacement) {
    Object.assign(active, {
      word: replacement.word.toUpperCase(),
      level: knowledgeLevelForSuccesses(replacement.successes),
      dueDrop: Math.max(...cycle.activeWords.map(item => item.dueDrop)) + 1,
      appearances: 0,
      successes: replacement.successes,
    });
  }
  return {
    previousLevel,
    nextLevel: knowledgeLevelForSuccesses(understandingScore),
    understandingScore,
    mastered,
  };
}
