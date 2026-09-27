import { randomInt, randomUUID } from 'node:crypto';
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
import { createWordCycle, generateCycleLetterOptions } from './game/wordCycle';

function cycleCandidates(words: ReadonlyMap<string, unknown>): string[] {
  return [...words.keys()]
    .map((word) => word.toUpperCase())
    .filter((word) => /^[A-Z]+$/.test(word) && word.length >= 3 && word.length <= 9);
}

function pickCycleWords(
  words: ReadonlyMap<string, unknown>,
  excluded = new Set<string>(),
  preferred: readonly string[] = [],
  successes: ReadonlyMap<string, number> = new Map(),
): string[] {
  const candidates = cycleCandidates(words).filter((word) => !excluded.has(word));
  const weighted: string[] = [];
  while (candidates.length) {
    const weights = candidates.map(word => Math.max(1, (10 - word.length) ** 2)
      * Math.max(0.08, 0.92 ** ((successes.get(word) ?? 0) ** 2)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let draw = randomInt(total);
    let index = 0;
    while (index < weights.length - 1 && draw >= weights[index]) draw -= weights[index++];
    weighted.push(candidates.splice(index, 1)[0]);
  }
  const valid = new Set(weighted);
  const prioritized = preferred.filter((word) => valid.has(word));
  return [...new Set([...prioritized, ...weighted])].slice(0, 5);
}

export class MatchModule {
  constructor(
    private readonly matches: MatchRepository,
    private readonly content: EnglishContent,
  ) {}

  async createMatch(userId: string, input: CreateMatchInput): Promise<MatchSnapshot> {
    const matchId = randomUUID();
    const playerId = randomUUID();
    const cycleDictionary = input.mode === 'learning'
      ? getWordsForMatch(this.content, input.theme)
      : this.content.words;
    const cycleTheme = input.theme ?? 'general';
    const [dueWords, wordSuccesses] = input.mode === 'classic' || input.mode === 'learning'
      ? await Promise.all([
          this.matches.listDueWords?.(userId, cycleTheme) ?? Promise.resolve([]),
          this.matches.listWordSuccesses?.(userId, cycleTheme) ?? Promise.resolve(new Map()),
        ])
      : [[], new Map<string, number>()];
    const selectedCycleWords = pickCycleWords(
      cycleDictionary, new Set(), dueWords, wordSuccesses,
    );
    const wordCycle = (input.mode === 'classic' || input.mode === 'learning')
      && selectedCycleWords.length === 5
      ? createWordCycle(selectedCycleWords, cycleTheme, wordSuccesses)
      : null;
    const letters = wordCycle
      ? generateCycleLetterOptions(wordCycle, [], this.content.letters, randomInt)
      : input.mode === 'learning'
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
      wordCycle,
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
          };
        }),
        pendingWord: snapshot.pendingWord
          ? {
              word: snapshot.pendingWord.formedWord,
              direction: snapshot.pendingWord.direction,
              pointsEarned: snapshot.pendingWord.pointsEarned,
              translations: pendingDefinition?.translations ?? {},
              cells: snapshot.pendingWord.cells,
            }
          : null,
        wordCycle: snapshot.player.wordCycle,
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
      createNextPieces: (mode, theme, rotationIndex, wordCycle, board, resetWordCycle) => {
        if (resetWordCycle && wordCycle && (mode === 'classic' || mode === 'learning')) {
          const dictionary = theme ? getWordsForMatch(this.content, theme) : this.content.words;
          const selected = pickCycleWords(
            dictionary,
            new Set(wordCycle.activeWords.map(item => item.word)),
          );
          wordCycle = selected.length === 5 ? createWordCycle(selected, theme ?? 'general') : wordCycle;
        }
        const nextLetters = wordCycle?.schemaVersion === 1
          ? generateCycleLetterOptions(wordCycle, board, this.content.letters, randomInt)
          : mode === 'learning'
          ? generateThematicLetterOptions(
              this.content.letters,
              getWordsForMatch(this.content, theme),
              rotationIndex,
            )
          : mode === 'classic'
            ? generateRotatingLetterOptions(this.content.letters, rotationIndex)
          : generateLetterOptions(this.content.letters);
        return {
          pieces: nextLetters.map((letter) => ({ id: randomUUID(), letter })),
          wordCycle,
        };
      },
    });
    const snapshot = await this.getMatchState(userId, matchId);

    return {
      accepted: true,
      ...result,
      board: snapshot.match.board,
      letterOptions: snapshot.match.letterOptions,
      wordCycle: snapshot.match.wordCycle,
    };
  }

  async confirmMatchWord(userId: string, matchId: string, input: ConfirmWordInput) {
    const result = await this.matches.confirmWord({
      matchId,
      userId,
      boardVersion: input.boardVersion,
      getWords: (theme) => getWordsForMatch(this.content, theme),
      replacementWord: async (cycle) => {
        const cycleTheme = cycle.activeWords[0]?.theme;
        const dictionary = cycleTheme && cycleTheme !== 'general'
          ? getWordsForMatch(this.content, cycleTheme)
          : this.content.words;
        const successes = await (this.matches.listWordSuccesses?.(
          userId, cycleTheme ?? 'general',
        ) ?? Promise.resolve(new Map<string, number>()));
        const word = pickCycleWords(
          dictionary,
          new Set(cycle.activeWords.map((item) => item.word)),
          [],
          successes,
        )[0];
        return word ? { word, successes: successes.get(word) ?? 0 } : undefined;
      },
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
      },
      board: snapshot.match.board,
      letterOptions: snapshot.match.letterOptions,
      wordCycle: snapshot.match.wordCycle,
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
