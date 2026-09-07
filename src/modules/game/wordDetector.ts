import type { BoardCell, FoundWord, WordDefinition, WordDirection } from '../../interfaces/game';

type WordCandidate = FoundWord & { multiplier: number };

function collectLineWords(
  line: readonly BoardCell[],
  words: ReadonlyMap<string, WordDefinition>,
  minLength: number,
  direction: WordDirection,
  candidates: WordCandidate[],
): void {
  const coordinate = (cell: BoardCell) =>
    direction === 'horizontal' ? cell.column : cell.row;
  const sortedLine = [...line].sort((first, second) => coordinate(first) - coordinate(second));

  for (const [word, definition] of words) {
    if (word.length < minLength || word.length > sortedLine.length) continue;

    for (let start = 0; start <= sortedLine.length - word.length; start += 1) {
      const wordCells = sortedLine.slice(start, start + word.length);
      const firstCoordinate = coordinate(wordCells[0]);
      if (!wordCells.every((cell, index) => coordinate(cell) === firstCoordinate + index)) continue;

      const text = wordCells.map((cell) => cell.letter).join('').toLowerCase();
      if (text !== word) continue;

      candidates.push({
        word,
        direction,
        definition,
        cells: wordCells,
        multiplier: direction === 'horizontal' ? 10 : 50,
      });
    }
  }
}

export function findFirstWord(
  cells: readonly BoardCell[],
  _placedCell: BoardCell,
  words: ReadonlyMap<string, WordDefinition>,
  minLength = 3,
): FoundWord | undefined {
  const candidates: WordCandidate[] = [];
  const rows = [...new Set(cells.map((cell) => cell.row))].sort((a, b) => a - b);
  const columns = [...new Set(cells.map((cell) => cell.column))].sort((a, b) => a - b);

  rows.forEach((row) => collectLineWords(
    cells.filter((cell) => cell.row === row), words, minLength, 'horizontal', candidates,
  ));
  columns.forEach((column) => collectLineWords(
    cells.filter((cell) => cell.column === column), words, minLength, 'vertical', candidates,
  ));

  candidates.sort((first, second) => {
    if (second.word.length !== first.word.length) return second.word.length - first.word.length;
    return second.multiplier - first.multiplier;
  });

  const candidate = candidates[0];
  if (!candidate) return undefined;
  const { multiplier: _multiplier, ...foundWord } = candidate;
  return foundWord;
}
