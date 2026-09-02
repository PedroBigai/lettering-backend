import type { BoardCell, MovedCell } from '../../interfaces/game';

export function findLandingRow(
  cells: readonly BoardCell[],
  rows: number,
  columns: number,
  column: number,
): number | null {
  if (!Number.isInteger(column) || column < 0 || column >= columns) return null;
  const occupied = new Set(
    cells.filter((cell) => cell.column === column).map((cell) => cell.row),
  );

  for (let row = rows - 1; row >= 0; row -= 1) {
    if (!occupied.has(row)) return row;
  }
  return null;
}

export function applyGravity(
  cells: readonly BoardCell[],
  rows: number,
  columns: number,
): { cells: BoardCell[]; movedCells: MovedCell[] } {
  const result: BoardCell[] = [];
  const movedCells: MovedCell[] = [];

  for (let column = 0; column < columns; column += 1) {
    const columnCells = cells
      .filter((cell) => cell.column === column)
      .sort((first, second) => second.row - first.row);

    columnCells.forEach((cell, index) => {
      const toRow = rows - 1 - index;
      result.push({ ...cell, row: toRow });
      if (toRow !== cell.row) {
        movedCells.push({
          pieceId: cell.pieceId,
          letter: cell.letter,
          fromRow: cell.row,
          toRow,
          column,
        });
      }
    });
  }

  return {
    cells: result.sort((first, second) =>
      first.row === second.row ? first.column - second.column : first.row - second.row,
    ),
    movedCells,
  };
}

export function isBoardFull(
  cells: readonly BoardCell[],
  rows: number,
  columns: number,
): boolean {
  return cells.length >= rows * columns;
}
