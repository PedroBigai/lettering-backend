import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../utils/env';

const migrationsDirectory = path.resolve(__dirname, '../../migrations');
const connection = mysql.createConnection({
  uri: env.DATABASE_URL,
  timezone: 'Z',
  multipleStatements: true,
});

async function runMigrations() {
  const migrationConnection = await connection;

  await migrationConnection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort();

  const [appliedRows] = await migrationConnection.query<
    (RowDataPacket & { filename: string })[]
  >(
    'SELECT filename FROM schema_migrations',
  );
  const applied = new Set(appliedRows.map((row) => row.filename));

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`Skipping ${filename}`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDirectory, filename), 'utf8');

    await migrationConnection.query(sql);
    await migrationConnection.execute(
      'INSERT INTO schema_migrations (filename) VALUES (?)',
      [filename],
    );

    console.log(`Applied ${filename}`);
  }
}

runMigrations()
  .then(async () => {
    console.log('Migrations completed');
    await (await connection).end();
  })
  .catch(async (error: unknown) => {
    console.error('Migration failed', error);
    await (await connection).end();
    process.exitCode = 1;
  });
