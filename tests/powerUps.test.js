const assert = require('node:assert/strict');
const test = require('node:test');
const {
  awardPower,
  COMBO_WINDOW_MS,
  findFullestLine,
  findMostFrequentLetter,
  parseGameplayState,
  registerCombo,
  releasePendingPower,
} = require('../dist/modules/game/powerUps');

test('power state uses 30/30/30/10 draws after five target words', () => {
  const cases = [[0, 'clearRow'], [.3, 'clearColumn'], [.6, 'clearLetter'], [.9, 'clearAll']];
  for (const [draw, expected] of cases) {
    const state = parseGameplayState(null);
    for (let index = 0; index < 4; index += 1) assert.equal(awardPower(state, draw), null);
    assert.equal(awardPower(state, draw), expected);
    assert.equal(state.powers[expected], 1);
  }
});

test('holds a completed second cycle until a stored power is used', () => {
  const state = parseGameplayState(null);
  for (let index = 0; index < 5; index += 1) awardPower(state, 0);
  assert.equal(state.powers.clearRow, 1);

  for (let index = 0; index < 5; index += 1) awardPower(state, .4);
  assert.equal(state.targetWordsTowardPower, 5);
  assert.equal(state.powers.clearColumn, 0);
  assert.equal(awardPower(state, .4), null);
  assert.equal(state.targetWordsTowardPower, 5);

  state.powers.clearRow -= 1;
  assert.equal(releasePendingPower(state, .4), 'clearColumn');
  assert.equal(state.targetWordsTowardPower, 0);
  assert.equal(state.powers.clearColumn, 1);
});

test('fullest row and column favor the lowest index when counts tie', () => {
  const cells = [
    { letter: 'A', row: 4, column: 0 },
    { letter: 'B', row: 4, column: 1 },
    { letter: 'C', row: 2, column: 0 },
    { letter: 'D', row: 2, column: 1 },
  ];
  assert.equal(findFullestLine(cells, 'row'), 2);
  assert.equal(findFullestLine(cells, 'column'), 0);
});

test('most frequent letter is selected deterministically', () => {
  const cells = [
    { letter: 'A', row: 0, column: 0 },
    { letter: 'B', row: 0, column: 1 },
    { letter: 'B', row: 1, column: 0 },
  ];
  assert.equal(findMostFrequentLetter(cells), 'B');
  assert.equal(findMostFrequentLetter([]), null);
});

test('server combo observes the twenty-second window and 8x cap', () => {
  const state = parseGameplayState(null);
  assert.equal(registerCombo(state, 0), 1);
  for (let index = 1; index < 9; index += 1) registerCombo(state, index * 1_000);
  assert.equal(state.comboMultiplier, 8);
  assert.equal(registerCombo(state, 8_000 + COMBO_WINDOW_MS), 8);
  assert.equal(registerCombo(state, 8_000 + COMBO_WINDOW_MS * 2 + 1), 1);
});
