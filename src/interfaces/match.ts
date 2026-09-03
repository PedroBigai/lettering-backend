import type { z } from 'zod';
import type {
  createMatchSchema,
  confirmWordSchema,
  matchHistoryQuerySchema,
  placePieceSchema,
} from '../schemas/matchSchemas';
import type { BoardCell, MovedCell, WordDefinition } from './game';

export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type PlacePieceInput = z.infer<typeof placePieceSchema>;
export type ConfirmWordInput = z.infer<typeof confirmWordSchema>;
export type MatchHistoryQuery = z.infer<typeof matchHistoryQuerySchema>;

export interface NewMatch {
  matchId: string;
  playerId: string;
  userId: string;
  mode: 'classic' | 'learning' | 'hardcore' | 'versus';
  theme?: string | null;
  language: 'en-US';
  pieces: readonly { id: string; letter: string; sequenceNumber: number }[];
}

export interface MatchPlayerSnapshot {
  id: string;
  status: string;
  score: number;
  levelReached: number;
  livesRemaining: number;
  boardVersion: number;
  gameTimeMs: number;
  pausedAt: Date | null;
}

export interface MatchPieceSnapshot {
  id: string;
  letter: string;
  sequenceNumber: number;
  status: string;
  row: number | null;
  column: number | null;
}

export interface MatchWordSnapshot {
  id: string;
  formedWord: string;
  pointsEarned: number;
  boardVersion: number;
  cells: unknown;
  createdAt: Date;
}

export interface MatchWordResultSnapshot extends MatchWordSnapshot {
  translations: Record<string, string[]>;
  description: Record<string, string[]>;
}

export interface PendingWordSnapshot {
  formedWord: string;
  direction: 'horizontal' | 'vertical';
  pointsEarned: number;
  boardVersion: number;
  cells: BoardCell[];
  createdAt: Date;
}

export interface MatchSnapshotRecord {
  id: string;
  language: string;
  mode: string;
  theme: string | null;
  status: string;
  boardRows: number;
  boardColumns: number;
  minWordLength: number;
  startedAt: Date | null;
  player: MatchPlayerSnapshot;
  pieces: MatchPieceSnapshot[];
  words: MatchWordSnapshot[];
  pendingWord: PendingWordSnapshot | null;
}

export interface PlacePieceRecord {
  matchId: string;
  userId: string;
  pieceId: string;
  column: number;
  boardVersion: number;
  words?: ReadonlyMap<string, WordDefinition>;
  getWords?: (theme: string | null) => ReadonlyMap<string, WordDefinition>;
  nextPieces: readonly { id: string; letter: string }[];
}

export interface FoundWordResult {
  word: string;
  direction: 'horizontal' | 'vertical';
  pointsEarned: number;
  translations: Record<string, string[]>;
  description: Record<string, string[]>;
  cells: BoardCell[];
}

export interface PlacePieceResult {
  boardVersion: number;
  placedPiece: BoardCell;
  foundWord: FoundWordResult | null;
  removedCells: BoardCell[];
  movedCells: MovedCell[];
  currentScore: number;
  lifeLost: boolean;
  livesRemaining: number;
  gameOver: boolean;
}

export interface ConfirmWordRecord {
  matchId: string;
  userId: string;
  boardVersion: number;
}

export interface ConfirmWordResult {
  boardVersion: number;
  confirmedWord: {
    word: string;
    direction: 'horizontal' | 'vertical';
    pointsEarned: number;
    cells: BoardCell[];
  };
  removedCells: BoardCell[];
  movedCells: MovedCell[];
  currentScore: number;
}

export interface MatchRepository {
  createSoloMatch(input: NewMatch): Promise<void>;
  findSnapshot(matchId: string, userId: string): Promise<MatchSnapshotRecord | undefined>;
  placePiece(input: PlacePieceRecord): Promise<PlacePieceResult>;
  confirmWord(input: ConfirmWordRecord): Promise<ConfirmWordResult>;
  leaveMatch(matchId: string, userId: string): Promise<void>;
  setPaused(matchId: string, userId: string, paused: boolean): Promise<void>;
  listByUser(userId: string, limit: number, offset: number): Promise<MatchHistoryPage>;
  expireInactive(timeoutSeconds: number): Promise<number>;
}

export interface MatchHistoryItem {
  id: string;
  mode: string;
  theme: string | null;
  language: string;
  matchStatus: string;
  playerStatus: string;
  score: number;
  livesRemaining: number;
  gameTimeMs: number;
  wordsFound: number;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface MatchHistoryPage {
  items: MatchHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface MatchSnapshot {
  match: {
    id: string;
    language: string;
    mode: string;
    theme: string | null;
    status: string;
    startedAt: Date | null;
    board: {
      rows: number;
      columns: number;
      version: number;
      cells: BoardCell[];
    };
    rules: {
      minWordLength: number;
      letterOptionsPerTurn: 4;
    };
    player: MatchPlayerSnapshot;
    letterOptions: Array<{ pieceId: string; letter: string; sequenceNumber: number }>;
    queuedPieces: Array<{ pieceId: string; letter: string; sequenceNumber: number }>;
    foundWords: MatchWordResultSnapshot[];
    pendingWord: FoundWordResult | null;
  };
}
