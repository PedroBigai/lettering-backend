const assert = require('node:assert/strict');
const test = require('node:test');
const {
  findEnglishWord,
  loadEnglishContent,
  normalizeEnglishWord,
} = require('../dist/game/content');
const { lettersFileSchema } = require('../dist/game/contentSchemas');

test('loads and validates the English content files', async () => {
  const content = await loadEnglishContent();

  assert.equal(content.letters.length, 26);
  assert.equal(content.words.size, 5);
  assert.deepEqual(findEnglishWord(content, ' APPLE ')?.translations, ['maçã']);
  assert.equal(findEnglishWord(content, 'APPLE')?.score, 50);
});

test('normalizes an English word for dictionary lookup', () => {
  assert.equal(normalizeEnglishWord('  FaLl  '), 'fall');
});

test('rejects duplicate letter definitions', () => {
  const result = lettersFileSchema.safeParse({
    letters: [
      { value: 'A', weight: 1 },
      { value: 'A', weight: 2 },
    ],
  });

  assert.equal(result.success, false);
});

