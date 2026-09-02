const assert = require('node:assert/strict');
const test = require('node:test');
const { applyGravity, findLandingRow, isBoardFull } = require('../dist/modules/game/boardEngine');

test('lands at the lowest free row and rejects invalid or full columns', () => {
  const cells = [
    { pieceId: 'a', letter: 'A', row: 9, column: 3 },
    { pieceId: 'b', letter: 'B', row: 8, column: 3 },
  ];

  assert.equal(findLandingRow(cells, 10, 9, 3), 7);
  assert.equal(findLandingRow(cells, 10, 9, -1), null);
  assert.equal(findLandingRow(cells, 10, 9, 9), null);
  assert.equal(
    findLandingRow(
      Array.from({ length: 10 }, (_, row) => ({
        pieceId: String(row), letter: 'A', row, column: 0,
      })),
      10,
      9,
      0,
    ),
    null,
  );
});

test('applies gravity independently to affected columns', () => {
  const result = applyGravity([
    { pieceId: 'a', letter: 'A', row: 5, column: 0 },
    { pieceId: 'b', letter: 'B', row: 8, column: 0 },
    { pieceId: 'c', letter: 'C', row: 7, column: 2 },
  ], 10, 9);

  assert.deepEqual(result.cells, [
    { pieceId: 'a', letter: 'A', row: 8, column: 0 },
    { pieceId: 'b', letter: 'B', row: 9, column: 0 },
    { pieceId: 'c', letter: 'C', row: 9, column: 2 },
  ]);
  assert.equal(result.movedCells.length, 3);
  assert.equal(isBoardFull(result.cells, 10, 9), false);
});
