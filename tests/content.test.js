const assert = require('node:assert/strict');
const test = require('node:test');
const {
  findEnglishWord,
  loadEnglishContent,
  normalizeEnglishWord,
} = require('../dist/modules/game/content');
const {
  lettersFileSchema,
  wordsFileSchema,
} = require('../dist/modules/game/contentSchemas');

test('loads and validates the English content files', async () => {
  const content = await loadEnglishContent();

  assert.equal(content.letters.length, 26);
  assert.equal(content.words.size, 89);
  assert.deepEqual(findEnglishWord(content, ' APPLE ')?.translations['pt-BR'], ['maçã']);
  assert.equal(findEnglishWord(content, 'APPLE')?.translations['en-US'], undefined);
  assert.equal(findEnglishWord(content, 'APPLE')?.score, 50);
});

test('merges meanings when the same word belongs to multiple themes', async () => {
  const content = await loadEnglishContent();
  const watch = findEnglishWord(content, 'WATCH');

  assert.deepEqual(watch?.description['en-US'], ['wristwatch', 'to watch']);
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

test('requires every target translation locale in word content', () => {
  const result = wordsFileSchema.safeParse({
    schemaVersion: 1,
    language: 'en-US',
    general: {
      animals: {
        words: [{
          word: 'CAT',
          translations: { 'pt-BR': ['gato'] },
          description: {
            'pt-BR': 'gato',
            'en-US': 'cat',
            'es-ES': 'gato',
          },
          score: 30,
        }],
      },
    },
  });

  assert.equal(result.success, false);
});
