import { randomInt as cryptoRandomInt } from 'node:crypto';
import type { BatchRules, LetterDefinition, RandomInt, WordDefinition } from '../../interfaces/game';

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
  if (rules.uniqueLetters && new Set(batch).size !== batch.length) return false;

  const vowelCount = batch.filter((letter) => englishVowels.has(letter)).length;
  if (vowelCount < rules.minVowels) return false;

  let consecutive = 1;

  for (let index = 1; index < batch.length; index += 1) {
    consecutive = batch[index] === batch[index - 1] ? consecutive + 1 : 1;
    if (consecutive > rules.maxConsecutiveEqual) return false;
  }

  return true;
}

export function generateLetterOptions(
  letters: readonly LetterDefinition[],
  randomInt: RandomInt = cryptoRandomInt,
): string[] {
  const vowels = letters.filter((letter) => englishVowels.has(letter.value));
  if (vowels.length === 0) throw new Error('The letter collection cannot satisfy the vowel rule');

  const batch = [vowels[randomInt(vowels.length)].value];
  while (batch.length < 4) {
    const candidates = letters.filter((letter) => !batch.includes(letter.value));
    batch.push(drawWeightedLetter(candidates, randomInt));
  }

  for (let index = batch.length - 1; index > 0; index -= 1) {
    const randomIndex = randomInt(index + 1);
    [batch[index], batch[randomIndex]] = [batch[randomIndex], batch[index]];
  }

  return batch;
}

export function generateThematicLetterOptions(
  letters: readonly LetterDefinition[],
  words: ReadonlyMap<string, WordDefinition>,
  rotationIndex = 0,
  randomInt: RandomInt = cryptoRandomInt,
): string[] {
  const guideWords = [...words.keys()];
  if (guideWords.length === 0) return generateLetterOptions(letters, randomInt);

  const guide = guideWords[randomInt(guideWords.length)].toUpperCase();
  const usefulLetters = [...new Set(guide)].filter((letter) =>
    letters.some((definition) => definition.value === letter),
  );

  for (let index = usefulLetters.length - 1; index > 0; index -= 1) {
    const randomIndex = randomInt(index + 1);
    [usefulLetters[index], usefulLetters[randomIndex]] = [usefulLetters[randomIndex], usefulLetters[index]];
  }

  const rotationLetter = letters[rotationIndex % letters.length].value;
  const batch = [rotationLetter];
  usefulLetters.forEach((letter) => {
    if (batch.length < 4 && !batch.includes(letter)) batch.push(letter);
  });
  if (!batch.some((letter) => englishVowels.has(letter))) {
    const guideVowel = [...guide].find((letter) => englishVowels.has(letter));
    if (guideVowel && !batch.includes(guideVowel)) {
      if (batch.length === 4) batch.pop();
      batch.push(guideVowel);
    }
  }

  while (batch.length < 4) {
    const candidates = letters.filter((letter) => !batch.includes(letter.value));
    batch.push(drawWeightedLetter(candidates, randomInt));
  }

  if (!batch.some((letter) => englishVowels.has(letter))) {
    const vowels = letters.filter((letter) => englishVowels.has(letter.value));
    batch[batch.length - 1] = vowels[randomInt(vowels.length)].value;
  }

  for (let index = batch.length - 1; index > 0; index -= 1) {
    const randomIndex = randomInt(index + 1);
    [batch[index], batch[randomIndex]] = [batch[randomIndex], batch[index]];
  }

  return batch;
}

export function generateRotatingLetterOptions(
  letters: readonly LetterDefinition[],
  rotationIndex = 0,
  randomInt: RandomInt = cryptoRandomInt,
): string[] {
  if (letters.length === 0) throw new Error('Cannot draw from an empty letter collection');
  const rotationLetter = letters[rotationIndex % letters.length].value;
  const batch = [rotationLetter];
  const vowels = letters.filter((letter) => englishVowels.has(letter.value));

  if (!englishVowels.has(rotationLetter)) {
    batch.push(vowels[randomInt(vowels.length)].value);
  }
  while (batch.length < 4) {
    const candidates = letters.filter((letter) => !batch.includes(letter.value));
    batch.push(drawWeightedLetter(candidates, randomInt));
  }
  for (let index = batch.length - 1; index > 0; index -= 1) {
    const randomIndex = randomInt(index + 1);
    [batch[index], batch[randomIndex]] = [batch[randomIndex], batch[index]];
  }
  return batch;
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
