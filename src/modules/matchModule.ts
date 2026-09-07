import { randomUUID } from 'node:crypto';
import type { EnglishContent } from '../interfaces/game';
import type {
  CreateMatchInput,
  ConfirmWordInput,
  MatchRepository,
  MatchHistoryQuery,
  RankingQuery,
  MatchSnapshot,
  PlacePieceInput,
} from '../interfaces/match';
import {
  generateLetterOptions,
  generateRotatingLetterOptions,
  generateThematicLetterOptions,
} from './game/letterGenerator';
import { getWordsForMatch } from './game/content';
import { ApiError } from '../server/errors';

export class MatchModule {
  constructor(
    private readonly matches: MatchRepository,
    private readonly content: EnglishContent,
  ) {}

  async createMatch(userId: string, input: CreateMatchInput): Promise<MatchSnapshot> {
    const matchId = randomUUID();
    const playerId = randomUUID();
    const letters = input.mode === 'learning'
      ? generateThematicLetterOptions(
          this.content.letters,
          getWordsForMatch(this.content, input.theme),
        )
      : input.mode === 'classic'
        ? generateRotatingLetterOptions(this.content.letters)
      : generateLetterOptions(this.content.letters);

    await this.matches.createSoloMatch({
      matchId,
      playerId,
      userId,
      mode: input.mode,
      theme: input.theme ?? null,
      wordTarget: input.wordTarget ?? null,
      language: input.language,
      pieces: letters.map((letter, index) => ({
        id: randomUUID(),
        letter,
        sequenceNumber: index + 1,
      })),
    });

    return this.getMatchState(userId, matchId);
  }

  async getMatchState(userId: string, matchId: string): Promise<MatchSnapshot> {
    const snapshot = await this.matches.findSnapshot(matchId, userId);
    if (!snapshot) {
      throw new ApiError(404, 'MATCH_NOT_FOUND', 'Match not found');
    }

    const matchWords = getWordsForMatch(this.content, snapshot.theme);
    const pendingDefinition = snapshot.pendingWord
      ? matchWords.get(snapshot.pendingWord.formedWord) ?? this.content.words.get(snapshot.pendingWord.formedWord)
      : undefined;

    return {
      match: {
        id: snapshot.id,
        language: snapshot.language,
        mode: snapshot.mode,
        theme: snapshot.theme,
        wordTarget: snapshot.wordTarget,
        status: snapshot.status,
        startedAt: snapshot.startedAt,
        board: {
          rows: snapshot.boardRows,
          columns: snapshot.boardColumns,
          version: snapshot.player.boardVersion,
          cells: snapshot.pieces
            .filter(
              (piece): piece is typeof piece & { row: number; column: number } =>
                piece.status === 'placed' && piece.row !== null && piece.column !== null,
            )
            .map((piece) => ({
              pieceId: piece.id,
              letter: piece.letter,
              row: piece.row,
              column: piece.column,
            })),
        },
        rules: {
          minWordLength: snapshot.minWordLength,
          letterOptionsPerTurn: 4,
          wordTarget: snapshot.wordTarget,
        },
        player: snapshot.player,
        letterOptions: snapshot.pieces
          .filter((piece) => piece.status === 'active')
          .map((piece) => ({
            pieceId: piece.id,
            letter: piece.letter,
            sequenceNumber: piece.sequenceNumber,
          })),
        queuedPieces: snapshot.pieces
          .filter((piece) => piece.status === 'queued')
          .map((piece) => ({
            pieceId: piece.id,
            letter: piece.letter,
            sequenceNumber: piece.sequenceNumber,
          })),
        foundWords: snapshot.words.filter((word, index, words) =>
          words.findIndex((candidate) => candidate.formedWord === word.formedWord) === index,
        ).map((word) => {
          const definition =
            matchWords.get(word.formedWord) ?? this.content.words.get(word.formedWord);
          return {
            ...word,
            translations: definition?.translations ?? {},
            description: definition?.description ?? {},
          };
        }),
        pendingWord: snapshot.pendingWord
          ? {
              word: snapshot.pendingWord.formedWord,
              direction: snapshot.pendingWord.direction,
              pointsEarned: snapshot.pendingWord.pointsEarned,
              translations: pendingDefinition?.translations ?? {},
              description: pendingDefinition?.description ?? {},
              cells: snapshot.pendingWord.cells,
            }
          : null,
      },
    };
  }

  async getMatch(userId: string, matchId: string): Promise<MatchSnapshot> {
    return this.getMatchState(userId, matchId);
  }

  async placeMatchPiece(userId: string, matchId: string, input: PlacePieceInput) {
    const result = await this.matches.placePiece({
      matchId,
      userId,
      pieceId: input.pieceId,
      column: input.column,
      boardVersion: input.boardVersion,
      words: this.content.words,
      getWords: (theme) => getWordsForMatch(this.content, theme),
      createNextPieces: (mode, theme, rotationIndex) => {
        const nextLetters = mode === 'learning'
          ? generateThematicLetterOptions(
              this.content.letters,
              getWordsForMatch(this.content, theme),
              rotationIndex,
            )
          : mode === 'classic'
            ? generateRotatingLetterOptions(this.content.letters, rotationIndex)
          : generateLetterOptions(this.content.letters);
        return nextLetters.map((letter) => ({ id: randomUUID(), letter }));
      },
    });
    const snapshot = await this.getMatchState(userId, matchId);

    return {
      accepted: true,
      ...result,
      board: snapshot.match.board,
      letterOptions: snapshot.match.letterOptions,
    };
  }

  async confirmMatchWord(userId: string, matchId: string, input: ConfirmWordInput) {
    const result = await this.matches.confirmWord({
      matchId,
      userId,
      boardVersion: input.boardVersion,
      getWords: (theme) => getWordsForMatch(this.content, theme),
    });
    const snapshot = await this.getMatchState(userId, matchId);
    const matchWords = getWordsForMatch(this.content, snapshot.match.theme);
    const definition =
      matchWords.get(result.confirmedWord.word) ?? this.content.words.get(result.confirmedWord.word);

    return {
      accepted: true,
      ...result,
      confirmedWord: {
        ...result.confirmedWord,
        translations: definition?.translations ?? {},
        description: definition?.description ?? {},
      },
      board: snapshot.match.board,
      letterOptions: snapshot.match.letterOptions,
    };
  }

  async leaveMatch(userId: string, matchId: string) {
    await this.matches.leaveMatch(matchId, userId);
    return { left: true, matchId };
  }

  async pauseMatch(userId: string, matchId: string) {
    await this.matches.setPaused(matchId, userId, true);
    return this.getMatchState(userId, matchId);
  }

  async resumeMatch(userId: string, matchId: string) {
    await this.matches.setPaused(matchId, userId, false);
    return this.getMatchState(userId, matchId);
  }

  async getMatches(userId: string, query: MatchHistoryQuery) {
    return this.matches.listByUser(userId, query.limit, query.offset);
  }

  async getRanking(userId: string, query: RankingQuery) {
    return this.matches.getRanking(userId, query);
  }

  async expireInactiveMatches(timeoutSeconds: number) {
    return this.matches.expireInactive(timeoutSeconds);
  }
}
