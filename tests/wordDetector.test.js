const assert = require('node:assert/strict');
const test = require('node:test');
const { findFirstWord } = require('../dist/modules/game/wordDetector');

const definition = (score) => ({
  translations: { 'pt-BR': ['tradução'] },
  description: { 'pt-BR': ['Descrição'] },
  score,
});
const words = new Map([
  ['cat', definition(30)],
  ['cater', definition(50)],
  ['fall', definition(40)],
]);

test('finds the first horizontal word containing the newly placed piece', () => {
  const cells = [...'CATER'].map((letter, column) => ({
    pieceId: String(column), letter, row: 9, column,
  }));
  const found = findFirstWord(cells, cells[2], words, 3);

  assert.equal(found.word, 'cat');
  assert.equal(found.direction, 'horizontal');
  assert.deepEqual(found.cells.map((cell) => cell.column), [0, 1, 2]);
});

test('finds a vertical word from top to bottom', () => {
  const cells = [...'FALL'].map((letter, index) => ({
    pieceId: String(index), letter, row: 6 + index, column: 4,
  }));
  const found = findFirstWord(cells, cells[3], words, 3);

  assert.equal(found.word, 'fall');
  assert.equal(found.direction, 'vertical');
});

test('prioritizes horizontal and ignores gaps and words without the new piece', () => {
  const placed = { pieceId: 'new', letter: 'T', row: 9, column: 2 };
  const bothDirections = [
    { pieceId: 'c', letter: 'C', row: 9, column: 0 },
    { pieceId: 'a', letter: 'A', row: 9, column: 1 },
    placed,
    { pieceId: 'vertical-c', letter: 'C', row: 7, column: 2 },
    { pieceId: 'vertical-a', letter: 'A', row: 8, column: 2 },
  ];
  assert.equal(findFirstWord(bothDirections, placed, words, 3).direction, 'horizontal');

  const gap = [
    { pieceId: 'c', letter: 'C', row: 9, column: 0 },
    { pieceId: 'a', letter: 'A', row: 9, column: 2 },
    { pieceId: 'new', letter: 'T', row: 9, column: 3 },
  ];
  assert.equal(findFirstWord(gap, gap[2], words, 3), undefined);

  assert.equal(findFirstWord(bothDirections, { ...placed, pieceId: 'absent' }, words, 3), undefined);
});
