import type { BoardCell, FoundWord, WordDefinition, WordDirection } from '../../interfaces/game';

type WordCandidate = FoundWord & {
  multiplier: number;
  /** Ordem da linha (linhas de cima para baixo, depois colunas da esquerda para a direita). */
  lineOrder: number;
  /** Posição da palavra no dicionário: desempate igual ao da varredura antiga. */
  dictionaryIndex: number;
  start: number;
};

interface DictionaryIndex {
  order: Map<string, number>;
  maxLength: number;
}

// O dicionário é o mesmo Map durante toda a vida do servidor; o índice é
// calculado uma vez por Map e liberado junto com ele.
const dictionaryIndexes = new WeakMap<ReadonlyMap<string, WordDefinition>, DictionaryIndex>();

function getDictionaryIndex(words: ReadonlyMap<string, WordDefinition>): DictionaryIndex {
  let index = dictionaryIndexes.get(words);
  if (!index) {
    const order = new Map<string, number>();
    let maxLength = 0;
    for (const word of words.keys()) {
      order.set(word, order.size);
      if (word.length > maxLength) maxLength = word.length;
    }
    index = { order, maxLength };
    dictionaryIndexes.set(words, index);
  }
  return index;
}

/**
 * Em vez de testar cada palavra do dicionário em cada linha (milhares de
 * palavras x 19 linhas), gera os trechos contíguos de cada linha — no máximo
 * algumas dezenas — e consulta o Map. O resultado é o mesmo da varredura antiga.
 */
function collectLineWords(
  line: BoardCell[],
  words: ReadonlyMap<string, WordDefinition>,
  dictionary: DictionaryIndex,
  minLength: number,
  direction: WordDirection,
  lineOrder: number,
  candidates: WordCandidate[],
): void {
  const coordinate = (cell: BoardCell) =>
    direction === 'horizontal' ? cell.column : cell.row;
  line.sort((first, second) => coordinate(first) - coordinate(second));

  for (let start = 0; start < line.length; start += 1) {
    let text = '';
    for (let end = start; end < line.length && end - start < dictionary.maxLength; end += 1) {
      if (end > start && coordinate(line[end]) !== coordinate(line[end - 1]) + 1) break;
      text += line[end].letter.toLowerCase();
      if (text.length < minLength) continue;

      const definition = words.get(text);
      if (!definition) continue;
      candidates.push({
        word: text,
        direction,
        definition,
        cells: line.slice(start, end + 1),
        multiplier: direction === 'horizontal' ? 10 : 50,
        lineOrder,
        dictionaryIndex: dictionary.order.get(text) ?? 0,
        start,
      });
    }
  }
}

export function findFirstWord(
  cells: readonly BoardCell[],
  placedCell: BoardCell,
  words: ReadonlyMap<string, WordDefinition>,
  minLength = 3,
): FoundWord | undefined {
  const dictionary = getDictionaryIndex(words);
  const rows = new Map<number, BoardCell[]>();
  const columns = new Map<number, BoardCell[]>();
  for (const cell of cells) {
    let row = rows.get(cell.row);
    if (!row) rows.set(cell.row, (row = []));
    row.push(cell);
    let column = columns.get(cell.column);
    if (!column) columns.set(cell.column, (column = []));
    column.push(cell);
  }

  const candidates: WordCandidate[] = [];
  let lineOrder = 0;
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    collectLineWords(rows.get(row) as BoardCell[], words, dictionary, minLength, 'horizontal', lineOrder++, candidates);
  }
  for (const column of [...columns.keys()].sort((a, b) => a - b)) {
    collectLineWords(columns.get(column) as BoardCell[], words, dictionary, minLength, 'vertical', lineOrder++, candidates);
  }

  candidates.sort((first, second) => {
    const firstUsesPlacedCell = first.cells.some((cell) => cell.pieceId === placedCell.pieceId);
    const secondUsesPlacedCell = second.cells.some((cell) => cell.pieceId === placedCell.pieceId);
    if (firstUsesPlacedCell !== secondUsesPlacedCell) {
      return Number(secondUsesPlacedCell) - Number(firstUsesPlacedCell);
    }
    if (second.word.length !== first.word.length) return second.word.length - first.word.length;
    if (second.multiplier !== first.multiplier) return second.multiplier - first.multiplier;
    // Mesmos critérios de desempate da implementação anterior.
    if (first.lineOrder !== second.lineOrder) return first.lineOrder - second.lineOrder;
    if (first.dictionaryIndex !== second.dictionaryIndex) {
      return first.dictionaryIndex - second.dictionaryIndex;
    }
    return first.start - second.start;
  });

  const candidate = candidates[0];
  if (!candidate) return undefined;
  const { multiplier: _multiplier, lineOrder: _lineOrder, dictionaryIndex: _index, start: _start, ...foundWord } = candidate;
  return foundWord;
}
