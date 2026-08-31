import { randomInt as cryptoRandomInt } from 'node:crypto';
import type { LetterDefinition } from './contentSchemas';

export type RandomInt = (maxExclusive: number) => number;

export type BatchRules = {
  size: number;
  minVowels: number;
  maxConsecutiveEqual: number;
  maxAttempts?: number;
};

const englishVowels = new Set(['A', 'E', 'I', 'O', 'U']);

export function drawWeightedLetter(
  letters: readonly LetterDefinition[],
  randomInt: RandomInt = cryptoRandomInt,
): string {
  if (letters.length === 0) {
    throw new Error('Cannot draw from an empty letter collection');
  }

  const totalWeight = letters.reduce((total, letter) => total + letter.weight, 0);
  let draw = randomInt(totalWeight);

  for (const letter of letters) {
    if (draw < letter.weight) return letter.value;
    draw -= letter.weight;
  }

  throw new Error('Weighted letter draw produced an invalid result');
}

function respectsBatchRules(batch: readonly string[], rules: BatchRules): boolean {
  const vowelCount = batch.filter((letter) => englishVowels.has(letter)).length;
  if (vowelCount < rules.minVowels) return false;

  let consecutive = 1;

  for (let index = 1; index < batch.length; index += 1) {
    consecutive = batch[index] === batch[index - 1] ? consecutive + 1 : 1;
    if (consecutive > rules.maxConsecutiveEqual) return false;
  }

  return true;
}

export function generateLetterBatch(
  letters: readonly LetterDefinition[],
  rules: BatchRules = {
    size: 10,
    minVowels: 3,
    maxConsecutiveEqual: 2,
  },
  randomInt: RandomInt = cryptoRandomInt,
): string[] {
  if (!Number.isInteger(rules.size) || rules.size <= 0) {
    throw new Error('Batch size must be a positive integer');
  }

  if (
    !Number.isInteger(rules.minVowels) ||
    rules.minVowels < 0 ||
    rules.minVowels > rules.size
  ) {
    throw new Error('minVowels must be between zero and the batch size');
  }

  if (!Number.isInteger(rules.maxConsecutiveEqual) || rules.maxConsecutiveEqual <= 0) {
    throw new Error('maxConsecutiveEqual must be a positive integer');
  }

  const hasVowel = letters.some((letter) => englishVowels.has(letter.value));
  if (rules.minVowels > 0 && !hasVowel) {
    throw new Error('The letter collection cannot satisfy the vowel rule');
  }

  const maxAttempts = rules.maxAttempts ?? 1_000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const batch = Array.from({ length: rules.size }, () =>
      drawWeightedLetter(letters, randomInt),
    );

    if (respectsBatchRules(batch, rules)) return batch;
  }

  throw new Error(`Unable to generate a valid letter batch after ${maxAttempts} attempts`);
}

