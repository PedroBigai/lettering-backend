const assert = require('node:assert/strict');
const test = require('node:test');
const { findFirstWord } = require('../dist/modules/game/wordDetector');

const definition = (score) => ({
  translations: { 'pt-BR': ['tradução'] },
  score,
});
const words = new Map([
  ['cat', definition(30)],
  ['cater', definition(50)],
  ['fall', definition(40)],
]);

test('finds the longest word anywhere on the board', () => {
  const cells = [...'CATER'].map((letter, column) => ({
    pieceId: String(column), letter, row: 9, column,
  }));
  const found = findFirstWord(cells, cells[2], words, 3);

  assert.equal(found.word, 'cater');
  assert.equal(found.direction, 'horizontal');
  assert.deepEqual(found.cells.map((cell) => cell.column), [0, 1, 2, 3, 4]);
});

test('finds a vertical word from top to bottom', () => {
  const cells = [...'FALL'].map((letter, index) => ({
    pieceId: String(index), letter, row: 6 + index, column: 4,
  }));
  const found = findFirstWord(cells, cells[3], words, 3);

  assert.equal(found.word, 'fall');
  assert.equal(found.direction, 'vertical');
});

test('prioritizes vertical on equal length and ignores gaps and reversed words', () => {
  const placed = { pieceId: 'new', letter: 'T', row: 9, column: 2 };
  const bothDirections = [
    { pieceId: 'c', letter: 'C', row: 9, column: 0 },
    { pieceId: 'a', letter: 'A', row: 9, column: 1 },
    placed,
    { pieceId: 'vertical-c', letter: 'C', row: 7, column: 2 },
    { pieceId: 'vertical-a', letter: 'A', row: 8, column: 2 },
  ];
  assert.equal(findFirstWord(bothDirections, placed, words, 3).direction, 'vertical');

  const gap = [
    { pieceId: 'c', letter: 'C', row: 9, column: 0 },
    { pieceId: 'a', letter: 'A', row: 9, column: 2 },
    { pieceId: 'new', letter: 'T', row: 9, column: 3 },
  ];
  assert.equal(findFirstWord(gap, gap[2], words, 3), undefined);

  assert.equal(findFirstWord(bothDirections, { ...placed, pieceId: 'absent' }, words, 3).word, 'cat');

  const reversed = [...'TAC'].map((letter, column) => ({
    pieceId: `reverse-${column}`, letter, row: 9, column,
  }));
  assert.equal(findFirstWord(reversed, reversed[2], words, 3), undefined);
});

test('prioritizes a new overlapping word that uses the latest placed cell', () => {
  const placed = { pieceId: 'new-c', letter: 'C', row: 7, column: 2 };
  const cells = [
    ...[...'CATER'].map((letter, column) => ({
      pieceId: `old-${column}`, letter, row: 9, column,
    })),
    placed,
    { pieceId: 'shared-a', letter: 'A', row: 8, column: 2 },
  ];

  const found = findFirstWord(cells, placed, words, 3);
  assert.equal(found.word, 'cat');
  assert.equal(found.direction, 'vertical');
  assert.ok(found.cells.some((cell) => cell.pieceId === 'old-2'));
});

// Implementação anterior (varredura do dicionário inteiro), mantida só como
// referência para garantir que a versão otimizada escolhe exatamente a mesma palavra.
function referenceFindFirstWord(cells, placedCell, dictionary, minLength = 3) {
  const candidates = [];
  const collect = (line, direction) => {
    const coordinate = (cell) => (direction === 'horizontal' ? cell.column : cell.row);
    const sortedLine = [...line].sort((first, second) => coordinate(first) - coordinate(second));
    for (const [word, definition] of dictionary) {
      if (word.length < minLength || word.length > sortedLine.length) continue;
      for (let start = 0; start <= sortedLine.length - word.length; start += 1) {
        const wordCells = sortedLine.slice(start, start + word.length);
        const first = coordinate(wordCells[0]);
        if (!wordCells.every((cell, index) => coordinate(cell) === first + index)) continue;
        if (wordCells.map((cell) => cell.letter).join('').toLowerCase() !== word) continue;
        candidates.push({ word, direction, definition, cells: wordCells, multiplier: direction === 'horizontal' ? 10 : 50 });
      }
    }
  };
  [...new Set(cells.map((cell) => cell.row))].sort((a, b) => a - b)
    .forEach((row) => collect(cells.filter((cell) => cell.row === row), 'horizontal'));
  [...new Set(cells.map((cell) => cell.column))].sort((a, b) => a - b)
    .forEach((column) => collect(cells.filter((cell) => cell.column === column), 'vertical'));
  candidates.sort((first, second) => {
    const a = first.cells.some((cell) => cell.pieceId === placedCell.pieceId);
    const b = second.cells.some((cell) => cell.pieceId === placedCell.pieceId);
    if (a !== b) return Number(b) - Number(a);
    if (second.word.length !== first.word.length) return second.word.length - first.word.length;
    return second.multiplier - first.multiplier;
  });
  const candidate = candidates[0];
  if (!candidate) return undefined;
  const { multiplier: _multiplier, ...found } = candidate;
  return found;
}

test('matches the previous full-dictionary scan on random boards with the real dictionary', async () => {
  const { loadEnglishContent } = require('../dist/modules/game/content');
  const { words: dictionary } = await loadEnglishContent();
  const letters = 'EEEEAAAIIOOUTTNNSSRRLLDDHCMPGBFYWKV';
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const describe = (found) => (found
    ? `${found.word}|${found.direction}|${found.definition.score}|${found.cells.map((cell) => cell.pieceId).join(',')}`
    : 'none');

  let boardsWithWords = 0;
  for (let board = 0; board < 240; board += 1) {
    const fill = [0.3, 0.6, 0.9][board % 3];
    const cells = [];
    for (let column = 0; column < 9; column += 1) {
      const height = Math.round(10 * fill * (0.5 + random()));
      for (let row = 9; row >= Math.max(1, 10 - height); row -= 1) {
        cells.push({ pieceId: `${board}-${cells.length}`, letter: letters[Math.floor(random() * letters.length)], row, column });
      }
    }
    if (!cells.length) continue;
    const placed = cells[Math.floor(random() * cells.length)];
    const expected = referenceFindFirstWord(cells, placed, dictionary, 3);
    if (expected) boardsWithWords += 1;
    assert.equal(describe(findFirstWord(cells, placed, dictionary, 3)), describe(expected), `board ${board}`);
  }
  assert.ok(boardsWithWords > 120, `only ${boardsWithWords} boards had words`);
});

test('respects the minimum word length and does not mutate the input cells', () => {
  // Fora de ordem de propósito: o detector ordena internamente.
  const cells = [...'CATER']
    .map((letter, column) => ({ pieceId: String(column), letter, row: 9, column }))
    .reverse();
  const snapshot = JSON.stringify(cells);

  assert.equal(findFirstWord(cells, cells[0], words, 6), undefined);
  assert.equal(findFirstWord(cells, cells[0], words, 5).word, 'cater');
  assert.equal(JSON.stringify(cells), snapshot);
});
