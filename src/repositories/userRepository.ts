import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type UserRecord = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserRecord = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
};

export interface UserRepository {
  findById(id: string): Promise<UserRecord | undefined>;
  findByEmail(email: string): Promise<UserRecord | undefined>;
  findByUsername(username: string): Promise<UserRecord | undefined>;
  create(user: CreateUserRecord): Promise<UserRecord>;
}

export class DuplicateUserError extends Error {
  constructor() {
    super('User email or username already exists');
    this.name = 'DuplicateUserError';
  }
}

function isDuplicateEntryError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  );
}

type UserRow = RowDataPacket & {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
};

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MysqlUserRepository implements UserRepository {
  constructor(private readonly database: Pool) {}

  async findById(id: string): Promise<UserRecord | undefined> {
    const [rows] = await this.database.execute<UserRow[]>(
      `SELECT id, username, email, password_hash, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const [rows] = await this.database.execute<UserRow[]>(
      `SELECT id, username, email, password_hash, created_at, updated_at
       FROM users WHERE email = ? LIMIT 1`,
      [email],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async findByUsername(username: string): Promise<UserRecord | undefined> {
    const [rows] = await this.database.execute<UserRow[]>(
      `SELECT id, username, email, password_hash, created_at, updated_at
       FROM users WHERE username = ? LIMIT 1`,
      [username],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async create(user: CreateUserRecord): Promise<UserRecord> {
    try {
      await this.database.execute<ResultSetHeader>(
        `INSERT INTO users (id, username, email, password_hash)
         VALUES (?, ?, ?, ?)`,
        [user.id, user.username, user.email, user.passwordHash],
      );
    } catch (error) {
      if (isDuplicateEntryError(error)) throw new DuplicateUserError();
      throw error;
    }

    const created = await this.findById(user.id);
    if (!created) throw new Error('Created user could not be loaded');
    return created;
  }
}

