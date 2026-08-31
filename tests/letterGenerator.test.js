const assert = require('node:assert/strict');
const test = require('node:test');
const { loadEnglishContent } = require('../dist/game/content');
const {
  drawWeightedLetter,
  generateLetterBatch,
} = require('../dist/game/letterGenerator');

test('draws a letter according to the configured weight interval', () => {
  const letters = [
    { value: 'A', weight: 2 },
    { value: 'B', weight: 1 },
  ];

  assert.equal(drawWeightedLetter(letters, () => 0), 'A');
  assert.equal(drawWeightedLetter(letters, () => 1), 'A');
  assert.equal(drawWeightedLetter(letters, () => 2), 'B');
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

