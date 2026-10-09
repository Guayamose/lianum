/** Explicit local migration. No account, root, signed consent or SQL argument. */
import { createPlatformPool } from './database-pool.mjs';
import { migrateOriginalDeviceDispatchSchemaV1 } from './original-device-schema-v1.mjs';
let pool;
try {
  if (process.argv.length !== 2 || !process.env.DATABASE_URL) throw Error('PLATFORM_ORIGINAL_SCHEMA_CONFIGURATION');
  pool = createPlatformPool(process.env.DATABASE_URL);
  const result = await migrateOriginalDeviceDispatchSchemaV1(pool);
  process.stdout.write(JSON.stringify({ service: 'lianum-original-device-migration', status: 'COMPLETE', ...result }) + '\n');
} catch (error) {
  const code = /^PLATFORM_ORIGINAL_SCHEMA_[A-Z_]{1,60}$/.test(error?.code ?? error?.message ?? '')
    ? (error.code ?? error.message) : 'PLATFORM_ORIGINAL_SCHEMA_UNAVAILABLE';
  process.stderr.write(JSON.stringify({ service: 'lianum-original-device-migration', status: 'FAILED', error: code }) + '\n');
  process.exitCode = 1;
} finally { await pool?.end(); }
