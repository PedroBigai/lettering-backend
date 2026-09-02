import type {
  BoardCell,
  FoundWord,
  WordDefinition,
  WordDirection,
} from '../../interfaces/game';

function findInDirection(
  cells: readonly BoardCell[],
  placedCell: BoardCell,
  words: ReadonlyMap<string, WordDefinition>,
  minLength: number,
  direction: WordDirection,
): FoundWord | undefined {
  const line = cells
    .filter((cell) =>
      direction === 'horizontal'
        ? cell.row === placedCell.row
        : cell.column === placedCell.column,
    )
    .sort((first, second) =>
      direction === 'horizontal'
        ? first.column - second.column
        : first.row - second.row,
    );
  const coordinate = (cell: BoardCell) =>
    direction === 'horizontal' ? cell.column : cell.row;

  for (let length = minLength; length <= line.length; length += 1) {
    for (let startIndex = 0; startIndex <= line.length - length; startIndex += 1) {
      const candidate = line.slice(startIndex, startIndex + length);
      if (!candidate.some((cell) => cell.pieceId === placedCell.pieceId)) continue;

      const firstCoordinate = coordinate(candidate[0]);
      const contiguous = candidate.every(
        (cell, index) => coordinate(cell) === firstCoordinate + index,
      );
      if (!contiguous) continue;

      const word = candidate.map((cell) => cell.letter).join('').toLowerCase();
      const definition = words.get(word);
      if (definition) return { word, direction, definition, cells: candidate };
    }
  }

  return undefined;
}

export function findFirstWord(
  cells: readonly BoardCell[],
  placedCell: BoardCell,
  words: ReadonlyMap<string, WordDefinition>,
  minLength = 3,
): FoundWord | undefined {
  return (
    findInDirection(cells, placedCell, words, minLength, 'horizontal') ??
    findInDirection(cells, placedCell, words, minLength, 'vertical')
  );
}
