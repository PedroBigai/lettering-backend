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
const wordsData = require('../data/english/words.json');

test('loads and validates the English content files', async () => {
  const content = await loadEnglishContent();

  assert.equal(content.letters.length, 26);
  assert.ok(content.words.size > 1_000);
  assert.deepEqual(findEnglishWord(content, ' CAT ')?.translations['pt-BR'], ['gato', 'gata']);
  assert.equal(findEnglishWord(content, 'CAT')?.translations['en-US'], undefined);
  assert.equal(findEnglishWord(content, 'CAT')?.score, 30);
  assert.deepEqual(findEnglishWord(content, 'ALLIGATOR')?.translations['pt-BR'], ['jacaré']);
  assert.deepEqual(findEnglishWord(content, 'WARTHOG')?.translations['pt-BR'], ['javali-africano', 'facócero']);
  assert.deepEqual(findEnglishWord(content, 'YAK')?.translations['pt-BR'], ['iaque']);
  assert.deepEqual(findEnglishWord(content, 'DREAM')?.translations['pt-BR'], ['sonho']);
  assert.deepEqual(findEnglishWord(content, 'FALL')?.translations['pt-BR'], ['caio']);
  assert.deepEqual(findEnglishWord(content, 'FALLING')?.translations['pt-BR'], ['caindo']);
  assert.deepEqual(findEnglishWord(content, 'FAILED')?.translations['pt-BR'], ['falhei', 'fracassei']);
  assert.deepEqual(findEnglishWord(content, 'WRITTEN')?.translations['pt-BR'], ['escrito']);
  assert.deepEqual(findEnglishWord(content, 'WATCH')?.translations['pt-BR'], ['assisto', 'observo', 'relógio de pulso']);
  assert.deepEqual(findEnglishWord(content, 'WATCHED')?.translations['pt-BR'], ['assisti', 'observei']);
});

test('keeps every theme dictionary in alphabetical order', () => {
  const entriesFor = theme => wordsData.words.filter(entry => entry.themes.includes(theme));
  const wordsFor = theme => entriesFor(theme).map(entry => entry.word.toLowerCase());
  const find = (theme, word) => entriesFor(theme).find(entry => entry.word === word);
  const animals = wordsFor('animals');
  const verbs = wordsFor('verbs');
  const adjectives = wordsFor('adjectives');
  const objects = wordsFor('objects');
  const nouns = wordsFor('nouns');
  const food = wordsFor('food');
  const nature = wordsFor('nature');
  assert.deepEqual(animals, [...animals].sort());
  assert.deepEqual(verbs, [...verbs].sort());
  assert.deepEqual(adjectives, [...adjectives].sort());
  assert.deepEqual(objects, [...objects].sort());
  assert.deepEqual(nouns, [...nouns].sort());
  assert.deepEqual(food, [...food].sort());
  assert.deepEqual(nature, [...nature].sort());
  assert.equal(animals.length, 300);
  assert.ok(verbs.length > 2_000);
  assert.ok(adjectives.length >= 250);
  assert.ok(objects.length >= 400);
  assert.ok(nouns.length >= 1_000);
  assert.ok(food.length >= 500);
  assert.ok(nature.length >= 500);
  assert.equal(verbs[0], 'abandon');
  assert.equal(verbs.at(-1), 'zips');
  assert.equal(adjectives[0], 'able');
  assert.equal(adjectives.at(-1), 'young');
  assert.equal(objects[0], 'abacus');
  assert.equal(objects.at(-1), 'zipper');
  assert.equal(nouns[0], 'aardvark');
  assert.equal(nouns.at(-1), 'zucchini');
  assert.equal(wordsData.words.length, new Set(wordsData.words.map(entry => entry.word)).size);
  assert.equal(entriesFor('verbs').some(entry => 'forms' in entry), false);
  assert.equal(find('verbs', 'FAIL').score, 40);
  assert.equal(find('verbs', 'FAILING').score, 70);
  assert.deepEqual(find('verbs', 'DIG').translations['pt-BR'], ['cavo']);
  assert.deepEqual(find('verbs', 'DUG').translations['pt-BR'], ['cavei']);
  assert.deepEqual(find('adjectives', 'HAPPY').translations['pt-BR'], ['feliz']);
  assert.deepEqual(find('objects', 'KEYBOARD').translations['pt-BR'], ['teclado']);
  assert.deepEqual(find('nouns', 'LIFE').translations['pt-BR'], ['vida']);
  assert.deepEqual(find('food', 'APPLE').translations['pt-BR'], ['maçã']);
  assert.deepEqual(find('nature', 'TREE').translations['pt-BR'], ['árvore']);
  assert.deepEqual(wordsData.words.find(entry => entry.word === 'APPLE').themes, ['nouns', 'food']);
  assert.deepEqual(wordsData.words.find(entry => entry.word === 'CAT').themes, ['nouns', 'animals', 'nature']);
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
    schemaVersion: 2,
    language: 'en-US',
    themes: ['animals', 'verbs', 'adjectives', 'objects', 'nouns', 'food', 'nature'],
    words: [{
      word: 'CAT',
      translations: { 'pt-BR': ['gato'] },
      score: 30,
      themes: ['animals'],
    }],
  });

  assert.equal(result.success, false);
});
