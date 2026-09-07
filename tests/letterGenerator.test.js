const assert = require('node:assert/strict');
const test = require('node:test');
const { loadEnglishContent } = require('../dist/modules/game/content');
const {
  drawWeightedLetter,
  generateLetterBatch,
  generateLetterOptions,
  generateRotatingLetterOptions,
  generateThematicLetterOptions,
} = require('../dist/modules/game/letterGenerator');

test('draws a letter according to the configured weight interval', () => {
  const letters = [
    { value: 'A', weight: 2 },
    { value: 'B', weight: 1 },
  ];

  assert.equal(drawWeightedLetter(letters, () => 0), 'A');
  assert.equal(drawWeightedLetter(letters, () => 1), 'A');
  assert.equal(drawWeightedLetter(letters, () => 2), 'B');
});

test('generates thematic choices using letters from a guide word', async () => {
  const content = await loadEnglishContent();
  const words = new Map([
    ['cat', { translations: {}, description: {}, score: 30 }],
  ]);
  const options = generateThematicLetterOptions(content.letters, words, 0, () => 0);

  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.ok(options.includes('C'));
  assert.ok(options.includes('A'));
  assert.ok(options.includes('T'));
  assert.ok(options.some((letter) => 'AEIOU'.includes(letter)));
});

test('generates four unique server-side choices with at least one vowel', async () => {
  const content = await loadEnglishContent();

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const options = generateLetterOptions(content.letters);

    assert.equal(options.length, 4);
    assert.equal(new Set(options).size, 4);
    assert.ok(options.some((letter) => 'AEIOU'.includes(letter)));
  }
});

test('rotates through every letter while preserving valid choices', async () => {
  const content = await loadEnglishContent();
  const appeared = new Set();

  for (let index = 0; index < 26; index += 1) {
    const options = generateRotatingLetterOptions(content.letters, index);
    options.forEach((letter) => appeared.add(letter));
    assert.equal(new Set(options).size, 4);
    assert.ok(options.some((letter) => 'AEIOU'.includes(letter)));
  }

  assert.equal(appeared.size, 26);
});

test('generates batches that satisfy the gameplay constraints', async () => {
  const content = await loadEnglishContent();

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const batch = generateLetterBatch(content.letters);
    const vowels = batch.filter((letter) => 'AEIOU'.includes(letter));

    assert.equal(batch.length, 10);
    assert.ok(vowels.length >= 3);
    assert.doesNotMatch(batch.join(''), /(.)\1\1/);
  }
});
