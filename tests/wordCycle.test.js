const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createWordCycle,
  generateCycleLetterOptions,
  registerCycleSuccess,
  selectFocusWord,
} = require('../dist/modules/game/wordCycle');

const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(value => ({ value, weight: 1 }));

test('creates five staggered active words and prioritizes the first due word', () => {
  const cycle = createWordCycle(['CHAIR', 'TABLE', 'PHONE', 'BOTTLE', 'WINDOW'], 'objects');
  assert.equal(cycle.activeWords.length, 5);
  assert.deepEqual(cycle.activeWords.map(item => item.dueDrop), [0, 1, 2, 3, 4]);
  assert.equal(selectFocusWord(cycle).word, 'CHAIR');
});

test('generates unique choices with a useful letter and a vowel', () => {
  const cycle = createWordCycle(['CHAIR', 'TABLE', 'PHONE', 'BOTTLE', 'WINDOW'], 'objects');
  const options = generateCycleLetterOptions(cycle, [], letters, () => 0);
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.ok(options.some(letter => 'CHAIR'.includes(letter)));
  assert.ok(options.some(letter => 'AEIOU'.includes(letter)));
  assert.equal(cycle.dropNumber, 1);
  const allowed = new Set(cycle.activeWords.flatMap(item => [...item.word]));
  assert.ok(options.every(letter => allowed.has(letter)));
});

test('every success rotates the word and increments its understanding score', () => {
  const cycle = createWordCycle(['CHAIR', 'TABLE', 'PHONE', 'BOTTLE', 'WINDOW'], 'objects');
  cycle.dropNumber = 10;
  const result = registerCycleSuccess(cycle, 'CHAIR', { word: 'LAMP', successes: 2 });
  assert.equal(result.understandingScore, 1);
  assert.equal(result.nextLevel, 1);
  assert.equal(cycle.activeWords[0].word, 'LAMP');
  assert.equal(cycle.activeWords[0].successes, 2);
  assert.equal(cycle.activeWords[0].level, 2);
});
