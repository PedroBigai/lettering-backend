const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createWordCycle,
  generateCycleLetterOptions,
  registerCycleSuccess,
  selectFocusWord,
  knowledgeLevelForSuccesses,
  knowledgeWeightForSuccesses,
} = require('../dist/modules/game/wordCycle');

const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(value => ({ value, weight: 1 }));

test('creates three staggered active words and prioritizes the first due word', () => {
  const cycle = createWordCycle(['CHAIR', 'TABLE', 'PHONE', 'BOTTLE', 'WINDOW'], 'objects');
  assert.equal(cycle.activeWords.length, 3);
  assert.deepEqual(cycle.activeWords.map(item => item.dueDrop), [0, 1, 2]);
  assert.equal(selectFocusWord(cycle).word, 'CHAIR');
});

test('moves words through knowledge groups and removes mastered words from selection', () => {
  assert.deepEqual(
    [0, 1, 4, 5, 9, 10, 14, 15, 19, 20, 24, 25].map(knowledgeLevelForSuccesses),
    [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6],
  );
  assert.deepEqual(
    [0, 1, 5, 10, 15, 20, 25].map(knowledgeWeightForSuccesses),
    [100, 55, 30, 16, 8, 3, 0],
  );
});

test('chooses two displayed words and adds two random unique letters', () => {
  const cycle = createWordCycle(['ACE', 'DEER', 'SPIDER'], 'objects');
  const batch = generateCycleLetterOptions(cycle, [], letters, () => 0);
  const selectedWords = cycle.activeWords.filter(item => item.appearances === 1);

  assert.equal(selectedWords.length, 2);
  assert.ok(selectedWords.every(item => [...item.word].some(letter => batch.includes(letter))));
  assert.equal(batch.length, 4);
  assert.equal(new Set(batch).size, 4);
  assert.ok(batch.some(letter => 'AEIOU'.includes(letter)));
});

test('every success rotates the word and increments its understanding score', () => {
  const cycle = createWordCycle(['CHAIR', 'TABLE', 'PHONE', 'BOTTLE', 'WINDOW'], 'objects');
  cycle.dropNumber = 10;
  const result = registerCycleSuccess(cycle, 'CHAIR', { word: 'LAMP', successes: 2 });
  assert.equal(result.understandingScore, 1);
  assert.equal(result.nextLevel, 1);
  assert.equal(cycle.activeWords[0].word, 'LAMP');
  assert.equal(cycle.activeWords[0].successes, 2);
  assert.equal(cycle.activeWords[0].level, 1);
});
