import { randomUUID } from 'node:crypto';
import type { WebSocket, RawData } from 'ws';
import type { Pool } from 'mysql2/promise';
import type { AuthModule } from '../authModule';
import type { EnglishContent } from '../../interfaces/game';
import { generateRotatingLetterOptions } from '../game/letterGenerator';

export interface VersusClient {
  ws: WebSocket;
  userId: string;
  username: string;
  roomCode: string | null;
  isAlive: boolean;
}

export interface VersusRoom {
  code: string;
  host: VersusClient;
  guest: VersusClient | null;
  matchId: string | null;
  hostPlayerId: string | null;
  guestPlayerId: string | null;
  status: 'waiting' | 'in_progress' | 'finished';
  createdAt: number;
  matchSeed: number;
  hostStateVersion: number;
  guestStateVersion: number;
}

const BOARD_ROWS = 10;
const BOARD_COLUMNS = 9;
const LETTER_PATTERN = /^[A-Z]$/;

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class VersusManager {
  private readonly clients = new Map<WebSocket, VersusClient>();
  private readonly rooms = new Map<string, VersusRoom>();
  private quickMatchQueue: VersusClient | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: Pool | null,
    private readonly authModule: AuthModule,
    private readonly content: EnglishContent,
  ) {
    this.startHeartbeat();
  }

  handleConnection(ws: WebSocket, token?: string): void {
    if (token) {
      this.authenticateClient(ws, token);
    }

    ws.on('message', (data: RawData) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch {
        this.send(ws, { type: 'error', message: 'Invalid JSON payload' });
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('pong', () => {
      const client = this.clients.get(ws);
      if (client) client.isAlive = true;
    });
  }

  private authenticateClient(ws: WebSocket, token: string): void {
    try {
      const userId = this.authModule.verifyAuthToken(token);
      this.authModule.getAuthenticatedUser(userId).then((user) => {
        const client: VersusClient = {
          ws,
          userId: user.id,
          username: user.username,
          roomCode: null,
          isAlive: true,
        };
        this.clients.set(ws, client);
        this.send(ws, {
          type: 'authenticated',
          userId: user.id,
          username: user.username,
        });
      }).catch(() => {
        this.send(ws, { type: 'error', message: 'User not found' });
      });
    } catch {
      this.send(ws, { type: 'error', message: 'Invalid or expired authentication token' });
    }
  }

  private handleMessage(ws: WebSocket, message: Record<string, unknown>): void {
    const type = String(message.type ?? '');

    if (type === 'auth') {
      const token = String(message.token ?? '');
      this.authenticateClient(ws, token);
      return;
    }

    const client = this.clients.get(ws);
    if (!client) {
      this.send(ws, { type: 'error', message: 'Not authenticated. Send auth token first.' });
      return;
    }

    switch (type) {
      case 'ping':
        this.send(ws, { type: 'pong' });
        break;

      case 'create_room':
        this.handleCreateRoom(client);
        break;

      case 'join_room':
        this.handleJoinRoom(client, String(message.code ?? '').toUpperCase().trim());
        break;

      case 'quick_match':
        this.handleQuickMatch(client);
        break;

      case 'cancel_search':
        this.handleCancelSearch(client);
        break;

      case 'state_sync':
        this.handleStateSync(client, message);
        break;

      case 'word_confirmed':
        this.handleWordConfirmed(client, message);
        break;

      case 'game_over':
        this.handleGameOver(client, message);
        break;

      case 'leave_match':
        this.handleLeaveMatch(client);
        break;

      default:
        this.send(ws, { type: 'error', message: `Unknown message type: ${type}` });
    }
  }

  private handleCreateRoom(client: VersusClient): void {
    this.cleanupClientRooms(client);

    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const room: VersusRoom = {
      code,
      host: client,
      guest: null,
      matchId: null,
      hostPlayerId: null,
      guestPlayerId: null,
      status: 'waiting',
      createdAt: Date.now(),
      matchSeed: 0,
      hostStateVersion: -1,
      guestStateVersion: -1,
    };

    client.roomCode = code;
    this.rooms.set(code, room);

    this.send(client.ws, {
      type: 'room_created',
      code,
    });
  }

  private handleJoinRoom(client: VersusClient, code: string): void {
    const room = this.rooms.get(code);

    if (!room) {
      this.send(client.ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala não encontrada.' });
      return;
    }

    if (room.status !== 'waiting' || room.guest !== null) {
      this.send(client.ws, { type: 'error', code: 'ROOM_FULL', message: 'A sala já está cheia ou em andamento.' });
      return;
    }

    if (room.host.userId === client.userId) {
      this.send(client.ws, { type: 'error', code: 'CANNOT_JOIN_SELF', message: 'Você já é o anfitrião desta sala.' });
      return;
    }

    this.cleanupClientRooms(client);

    room.guest = client;
    client.roomCode = code;

    void this.startMatch(room);
  }

  private handleQuickMatch(client: VersusClient): void {
    this.cleanupClientRooms(client);

    if (this.quickMatchQueue && this.quickMatchQueue.ws.readyState === 1 && this.quickMatchQueue.userId !== client.userId) {
      const host = this.quickMatchQueue;
      this.quickMatchQueue = null;

      let code = generateRoomCode();
      while (this.rooms.has(code)) {
        code = generateRoomCode();
      }

      const room: VersusRoom = {
        code,
        host,
        guest: client,
        matchId: null,
        hostPlayerId: null,
        guestPlayerId: null,
        status: 'waiting',
        createdAt: Date.now(),
        matchSeed: 0,
        hostStateVersion: -1,
        guestStateVersion: -1,
      };

      host.roomCode = code;
      client.roomCode = code;
      this.rooms.set(code, room);

      void this.startMatch(room);
    } else {
      this.quickMatchQueue = client;
      this.send(client.ws, { type: 'searching_quick_match' });
    }
  }

  private handleCancelSearch(client: VersusClient): void {
    if (this.quickMatchQueue === client) {
      this.quickMatchQueue = null;
    }

    if (client.roomCode) {
      const room = this.rooms.get(client.roomCode);
      if (room && room.status === 'waiting') {
        this.rooms.delete(client.roomCode);
      }
      client.roomCode = null;
    }

    this.send(client.ws, { type: 'search_cancelled' });
  }

  private async startMatch(room: VersusRoom): Promise<void> {
    room.status = 'in_progress';
    const matchId = randomUUID();
    const hostPlayerId = randomUUID();
    const guestPlayerId = randomUUID();

    room.matchId = matchId;
    room.hostPlayerId = hostPlayerId;
    room.guestPlayerId = guestPlayerId;
    room.matchSeed = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
    room.hostStateVersion = -1;
    room.guestStateVersion = -1;

    if (this.database) {
      try {
        await this.database.execute(
          `INSERT INTO matches
            (id, language, mode, max_players, status, board_rows, board_columns, min_word_length, started_at)
           VALUES (?, 'en-US', 'versus', 2, 'in_progress', 10, 9, 3, CURRENT_TIMESTAMP(3))`,
          [matchId],
        );

        await this.database.execute(
          `INSERT INTO match_players
            (id, match_id, user_id, status, score, lives_remaining, joined_at)
           VALUES
            (?, ?, ?, 'playing', 0, 3, CURRENT_TIMESTAMP(3)),
            (?, ?, ?, 'playing', 0, 3, CURRENT_TIMESTAMP(3))`,
          [hostPlayerId, matchId, room.host.userId, guestPlayerId, matchId, room.guest!.userId],
        );
      } catch (err) {
        console.error('Failed to create versus match in database', err);
      }
    }

    const initialBatch = generateRotatingLetterOptions(this.content.letters, room.matchSeed % 32);

    this.send(room.host.ws, {
      type: 'match_start',
      matchId,
      roomCode: room.code,
      role: 'host',
      opponent: {
        userId: room.guest!.userId,
        username: room.guest!.username,
      },
      initialBatch,
      matchSeed: room.matchSeed,
    });

    this.send(room.guest!.ws, {
      type: 'match_start',
      matchId,
      roomCode: room.code,
      role: 'guest',
      opponent: {
        userId: room.host.userId,
        username: room.host.username,
      },
      initialBatch,
      matchSeed: room.matchSeed,
    });
  }

  private handleStateSync(client: VersusClient, message: Record<string, unknown>): void {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room || room.status !== 'in_progress') return;

    const isHost = room.host === client;
    const incomingVersion = this.toInteger(message.version, (isHost ? room.hostStateVersion : room.guestStateVersion) + 1, 0, Number.MAX_SAFE_INTEGER);
    const currentVersion = isHost ? room.hostStateVersion : room.guestStateVersion;
    if (incomingVersion <= currentVersion) return;

    const board = this.sanitizeBoard(message.board);
    const activeBlock = this.sanitizeActiveBlock(message.activeBlock, board);
    const score = this.toInteger(message.score, 0, 0, 100_000_000);
    const lives = this.toInteger(message.lives, 3, 0, 3);

    if (isHost) room.hostStateVersion = incomingVersion;
    else room.guestStateVersion = incomingVersion;

    const opponent = isHost ? room.guest : room.host;
    if (opponent && opponent.ws.readyState === 1) {
      this.send(opponent.ws, {
        type: 'opponent_state',
        version: incomingVersion,
        board,
        activeBlock,
        score,
        lives,
      });
    }
  }

  private handleWordConfirmed(client: VersusClient, message: Record<string, unknown>): void {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room || room.status !== 'in_progress') return;

    const word = String(message.word ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, BOARD_COLUMNS);
    if (word.length < 3) return;
    const points = this.toInteger(message.points, word.length * 10, 0, 1_000_000);
    const opponent = room.host === client ? room.guest : room.host;
    if (opponent && opponent.ws.readyState === 1) {
      this.send(opponent.ws, {
        type: 'opponent_word',
        word,
        points,
      });
    }
  }

  private handleGameOver(client: VersusClient, message: Record<string, unknown>): void {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room || room.status !== 'in_progress') return;

    room.status = 'finished';
    const opponent = room.host.userId === client.userId ? room.guest : room.host;
    const loserFinalScore = this.toInteger(message.finalScore, 0, 0, 100_000_000);

    if (opponent && opponent.ws.readyState === 1) {
      this.send(opponent.ws, {
        type: 'match_over',
        result: 'win',
        winner: opponent.username,
        loser: client.username,
        reason: 'lives_lost',
      });
    }

    this.send(client.ws, {
      type: 'match_over',
      result: 'lose',
      winner: opponent ? opponent.username : 'Opponent',
      loser: client.username,
      reason: 'lives_lost',
    });

    if (this.database && room.matchId) {
      void this.finishMatchInDb(room.matchId, opponent?.userId ?? null, client.userId, loserFinalScore);
    }

    this.rooms.delete(room.code);
    client.roomCode = null;
    if (opponent) opponent.roomCode = null;
  }

  private handleLeaveMatch(client: VersusClient): void {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room) return;
    const opponent = room.host === client ? room.guest : room.host;

    if (room.status === 'in_progress') {
      room.status = 'finished';
      if (opponent && opponent.ws.readyState === 1) {
        this.send(opponent.ws, {
          type: 'match_over',
          result: 'win',
          winner: opponent.username,
          loser: client.username,
          reason: 'forfeit',
        });
      }

      if (this.database && room.matchId) {
        void this.finishMatchInDb(room.matchId, opponent?.userId ?? null, client.userId, 0);
      }
    }

    this.rooms.delete(room.code);
    client.roomCode = null;
    if (opponent) opponent.roomCode = null;
  }

  private handleDisconnect(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client) return;

    if (this.quickMatchQueue === client) {
      this.quickMatchQueue = null;
    }

    if (client.roomCode) {
      const room = this.rooms.get(client.roomCode);
      if (room) {
        if (room.status === 'in_progress') {
          room.status = 'finished';
          const opponent = room.host.userId === client.userId ? room.guest : room.host;
          if (opponent && opponent.ws.readyState === 1) {
            this.send(opponent.ws, {
              type: 'opponent_disconnected',
              result: 'win',
              winner: opponent.username,
              message: 'Oponente desconectou. Vitória por W.O.!',
            });
            opponent.roomCode = null;
          }

          if (this.database && room.matchId) {
            void this.finishMatchInDb(room.matchId, opponent?.userId ?? null, client.userId, 0);
          }
        }
        this.rooms.delete(client.roomCode);
      }
    }

    this.clients.delete(ws);
  }

  private async finishMatchInDb(
    matchId: string,
    winnerUserId: string | null,
    loserUserId: string | null,
    loserScore: number,
  ): Promise<void> {
    if (!this.database) return;
    try {
      await this.database.execute(
        `UPDATE matches SET status = 'finished', finished_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [matchId],
      );

      if (winnerUserId) {
        await this.database.execute(
          `UPDATE match_players
           SET status = 'completed', finished_at = CURRENT_TIMESTAMP(3)
           WHERE match_id = ? AND user_id = ?`,
          [matchId, winnerUserId],
        );
      }

      if (loserUserId) {
        await this.database.execute(
          `UPDATE match_players
           SET status = 'game_over', score = ?, lives_remaining = 0, finished_at = CURRENT_TIMESTAMP(3)
           WHERE match_id = ? AND user_id = ?`,
          [loserScore, matchId, loserUserId],
        );
      }
    } catch (err) {
      console.error('Failed to update versus match finish in db', err);
    }
  }

  private cleanupClientRooms(client: VersusClient): void {
    if (this.quickMatchQueue === client) {
      this.quickMatchQueue = null;
    }
    if (client.roomCode) {
      const oldRoom = this.rooms.get(client.roomCode);
      if (oldRoom && oldRoom.status === 'waiting') {
        this.rooms.delete(client.roomCode);
      }
      client.roomCode = null;
    }
  }

  private sanitizeBoard(value: unknown): Array<Array<string | null>> {
    const source = Array.isArray(value) ? value : [];
    return Array.from({ length: BOARD_ROWS }, (_, rowIndex) => {
      const row = Array.isArray(source[rowIndex]) ? source[rowIndex] : [];
      return Array.from({ length: BOARD_COLUMNS }, (_, columnIndex) => {
        const cell = row[columnIndex];
        return typeof cell === 'string' && LETTER_PATTERN.test(cell.toUpperCase())
          ? cell.toUpperCase()
          : null;
      });
    });
  }

  private sanitizeActiveBlock(value: unknown, board: Array<Array<string | null>>): { row: number; column: number; letter: string } | null {
    if (!value || typeof value !== 'object') return null;
    const block = value as Record<string, unknown>;
    const row = this.toInteger(block.row, -1, 0, BOARD_ROWS - 1);
    const column = this.toInteger(block.column, -1, 0, BOARD_COLUMNS - 1);
    const letter = String(block.letter ?? '').toUpperCase();
    if (row < 0 || column < 0 || !LETTER_PATTERN.test(letter) || board[row][column] !== null) return null;
    return { row, column, letter };
  }

  private toInteger(value: unknown, fallback: number, min: number, max: number): number {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(number)));
  }

  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      for (const [ws, client] of this.clients.entries()) {
        if (!client.isAlive) {
          ws.terminate();
          this.handleDisconnect(ws);
          continue;
        }
        client.isAlive = false;
        ws.ping();
      }
    }, 30_000);
    this.pingInterval.unref();
  }

  private send(ws: WebSocket, payload: Record<string, unknown>): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }

  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    for (const [ws] of this.clients.entries()) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this.clients.clear();
    this.rooms.clear();
  }
}
