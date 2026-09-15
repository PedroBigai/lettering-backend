import type { FlashcardAction } from '../schemas/flashcardSchemas';
import type { MysqlFlashcardRepository } from './repositories/flashcardRepository';

export class FlashcardModule {
  constructor(private readonly repository: MysqlFlashcardRepository) {}
  async getState(userId: string) {
    const [decks, statistics] = await Promise.all([this.repository.list(userId), this.repository.statistics(userId)]);
    return { decks, statistics };
  }
  execute(userId: string, input: FlashcardAction) { return this.repository.execute(userId, input); }
  expireInactiveSessions(timeoutSeconds: number) { return this.repository.expireInactiveSessions(timeoutSeconds); }
}
