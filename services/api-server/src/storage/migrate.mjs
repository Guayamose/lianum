/** Explicit local/operator command. Never accepts SQL or logs credentials. */
import { createPlatformPool } from './database-pool.mjs';
import { migratePlatformDatabase } from './schema-migrations.mjs';

let pool;
try {
  if (process.argv.length !== 2 || !process.env.DATABASE_URL) throw Error('PLATFORM_MIGRATION_CONFIGURATION_REQUIRED');
  pool = createPlatformPool(process.env.DATABASE_URL);
  const result = await migratePlatformDatabase(pool);
  process.stdout.write(JSON.stringify({ service: 'lianum-platform-migrations', status: 'COMPLETE', ...result }) + '\n');
} catch (error) {
  const code = /^PLATFORM_[A-Z_]{1,60}$/.test(error?.code ?? error?.message ?? '')
    ? (error.code ?? error.message) : 'PLATFORM_MIGRATION_UNAVAILABLE';
  process.stderr.write(JSON.stringify({ service: 'lianum-platform-migrations', status: 'FAILED', error: code }) + '\n');
  process.exitCode = 1;
} finally { await pool?.end(); }
