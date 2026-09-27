import type { BoardCell, LetterDefinition, RandomInt } from '../../interfaces/game';
import { drawWeightedLetter } from './letterGenerator';

export const ACTIVE_WORD_COUNT = 5;
export const WORD_DROP_INTERVALS = [0, 4, 10, 22, 46] as const;
export const WORD_MASTERY_LEVEL = WORD_DROP_INTERVALS.length - 1;

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
      level: Math.min(WORD_MASTERY_LEVEL, successes.get(word.toUpperCase()) ?? 0),
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

function missingLetters(word: string, board: readonly BoardCell[]): string[] {
  const counts = new Map<string, number>();
  board.forEach(({ letter }) => counts.set(letter, (counts.get(letter) ?? 0) + 1));
  return [...word].filter((letter) => {
    const count = counts.get(letter) ?? 0;
    if (count === 0) return true;
    counts.set(letter, count - 1);
    return false;
  });
}

export function generateCycleLetterOptions(
  cycle: WordCycle,
  board: readonly BoardCell[],
  letters: readonly LetterDefinition[],
  randomInt: RandomInt,
): string[] {
  const focus = selectFocusWord(cycle);
  if (!focus) return [];
  const options: string[] = [];
  const add = (letter?: string) => { if (letter && !options.includes(letter)) options.push(letter); };
  const pick = (values: readonly string[]) => values.length ? values[randomInt(values.length)] : undefined;
  add(pick(missingLetters(focus.word, board)));
  const others = cycle.activeWords.filter((item) => item !== focus && item.dueDrop <= cycle.dropNumber);
  const other = others.length ? others[randomInt(others.length)] : undefined;
  add(pick([...(other?.word ?? '')]));
  const available = [...new Set(cycle.activeWords.flatMap((item) => [...item.word]))];
  add(pick(available));
  while (options.length < 4) {
    const candidates = letters.filter(
      ({ value }) => available.includes(value) && !options.includes(value),
    );
    if (!candidates.length) break;
    add(drawWeightedLetter(
      candidates,
      randomInt,
    ));
  }
  while (options.length < 4 && available.length) options.push(available[randomInt(available.length)]);
  if (!options.some((letter) => 'AEIOU'.includes(letter))) {
    const vowels = available.filter((value) => 'AEIOU'.includes(value));
    if (vowels.length) options[options.length - 1] = vowels[randomInt(vowels.length)];
  }
  focus.appearances += 1;
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
  active.level = Math.min(WORD_MASTERY_LEVEL, active.successes);
  active.dueDrop = cycle.dropNumber + WORD_DROP_INTERVALS[active.level];
  const mastered = active.level === WORD_MASTERY_LEVEL;
  if (replacement) {
    Object.assign(active, {
      word: replacement.word.toUpperCase(),
      level: Math.min(WORD_MASTERY_LEVEL, replacement.successes),
      dueDrop: Math.max(...cycle.activeWords.map(item => item.dueDrop)) + 1,
      appearances: 0,
      successes: replacement.successes,
    });
  }
  return {
    previousLevel,
    nextLevel: Math.min(WORD_MASTERY_LEVEL, understandingScore),
    understandingScore,
    mastered,
  };
}
