/** Fixed, reviewed SQL migrations. This module never dispatches operations and
 * never infers rollback from a missing COMMIT acknowledgement. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const PLATFORM_MIGRATION_LOCK_KEY = Object.freeze([0x4c49414e, 0x4d494752]);
export const PLATFORM_MIGRATIONS = Object.freeze([
  Object.freeze({ version: 1, name: '001_mobile_authorizations.sql', checksum: 'cabd8655911a0fb317096be2b28806ab4175f79e9af2549f157ed5a850022251' }),
]);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const oldTables = ['mobile_authorizations', 'mobile_challenges', 'mobile_operations'];
const tableColumns = {
  mobile_challenges: [['challenge_id', 'text'], ['challenge', 'jsonb'], ['expires_at', 'bigint'], ['consumed', 'boolean', 'false']],
  mobile_operations: [['owner_key', 'text'], ['request_id', 'text'], ['terms_hash', 'text']],
  mobile_authorizations: [['authorization_key', 'text'], ['challenge_id', 'text'], ['terms_hash', 'text'], ['response', 'jsonb']],
  platform_schema_migrations: [['version', 'integer'], ['name', 'text'], ['checksum', 'text'], ['applied_at', 'timestamp with time zone', 'CURRENT_TIMESTAMP']],
};
const tableKeys = {
  mobile_challenges: [['p', ['challenge_id']]],
  mobile_operations: [['p', ['owner_key', 'request_id']]],
  mobile_authorizations: [['p', ['authorization_key']], ['u', ['challenge_id']]],
  platform_schema_migrations: [['p', ['version']]],
};
const columnSQL = `SELECT c.relname AS table_name,c.relkind,c.relpersistence,
  a.attname AS column_name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
  a.attnotnull AS not_null,a.attidentity AS identity,a.attgenerated AS generated,
  pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
  WHERE n.nspname='public' AND c.relname=ANY($1::text[])
  ORDER BY c.relname,a.attnum`;
const constraintSQL = `SELECT c.relname AS table_name,k.contype AS kind,
  k.condeferrable AS deferrable,k.condeferred AS deferred,k.convalidated AS validated,
  ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(attnum,position)
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.attnum ORDER BY x.position) AS columns,
  COALESCE(i.indisvalid,false) AS index_valid,COALESCE(i.indisready,false) AS index_ready
  FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_catalog.pg_index i ON i.indexrelid=k.conindid
  WHERE n.nspname='public' AND c.relname=ANY($1::text[])`;
const uniqueIndexSQL = `SELECT c.relname AS table_name,i.indisvalid AS valid,i.indisready AS ready,
  EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.conindid=i.indexrelid
    AND k.conrelid=c.oid AND k.contype IN ('p','u')) AS retained_constraint
  FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND i.indisunique`;

export async function readPlatformMigrations() {
  return Promise.all(PLATFORM_MIGRATIONS.map(async definition => {
    let bytes;
    try { bytes = await readFile(new URL('../migrations/' + definition.name, import.meta.url)); }
    catch { fail('PLATFORM_MIGRATION_SOURCE_MISSING'); }
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (checksum !== definition.checksum) fail('PLATFORM_MIGRATION_CHECKSUM_MISMATCH');
    return Object.freeze({ ...definition, sql: new TextDecoder('utf-8', { fatal: true }).decode(bytes) });
  }));
}

async function snapshotSchema(connection, names) {
  const columns = (await connection.query(columnSQL, [names])).rows;
  const constraints = (await connection.query(constraintSQL, [names])).rows;
  const uniqueIndexes = (await connection.query(uniqueIndexSQL, [names])).rows;
  return { columns, constraints, uniqueIndexes };
}
function validateSchema(snapshot, names) {
  for (const name of names) {
    const columns = snapshot.columns.filter(row => row.table_name === name);
    const expected = tableColumns[name];
    if (columns.length !== expected.length) fail('PLATFORM_SCHEMA_INCOMPATIBLE');
    for (let index = 0; index < expected.length; index++) {
      const row = columns[index], [column, type, defaultExpression = null] = expected[index];
      if (row.relkind !== 'r' || row.relpersistence !== 'p' || row.column_name !== column
        || row.type !== type || row.not_null !== true || row.identity !== '' || row.generated !== ''
        || row.default_expression !== defaultExpression) fail('PLATFORM_SCHEMA_INCOMPATIBLE');
    }
    const constraints = snapshot.constraints.filter(row => row.table_name === name);
    const keys = tableKeys[name];
    if (constraints.length !== keys.length || keys.some(([kind, columns]) => !constraints.some(row =>
      row.kind === kind && JSON.stringify(row.columns) === JSON.stringify(columns)
      && row.deferrable === false && row.deferred === false && row.validated === true
      && row.index_valid === true && row.index_ready === true))) fail('PLATFORM_SCHEMA_INCOMPATIBLE');
    // A standalone unique index also rejects inserts but has no pg_constraint
    // row. Accept only the unique indexes retained by the exact PK/UNIQUE keys.
    const uniqueIndexes = snapshot.uniqueIndexes.filter(row => row.table_name === name);
    if (uniqueIndexes.length !== keys.length || uniqueIndexes.some(row =>
      row.retained_constraint !== true || row.valid !== true || row.ready !== true)) fail('PLATFORM_SCHEMA_INCOMPATIBLE');
  }
}
function validateHistory(rows, { complete = false } = {}) {
  if (rows.length > PLATFORM_MIGRATIONS.length) fail('PLATFORM_MIGRATION_HISTORY_INVALID');
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], expected = PLATFORM_MIGRATIONS[index];
    if (row.version !== expected.version || row.name !== expected.name || row.checksum !== expected.checksum)
      fail('PLATFORM_MIGRATION_HISTORY_INVALID');
  }
  if (complete && rows.length !== PLATFORM_MIGRATIONS.length) fail('PLATFORM_MIGRATION_REQUIRED');
}
const historySQL = 'SELECT version,name,checksum FROM public.platform_schema_migrations ORDER BY version';

/** Read-only gate for the normal API. A new or incompatible database requires
 * the separate migration command; availability checks never execute DDL. */
export async function assertPlatformSchema(connection) {
  await readPlatformMigrations();
  let history;
  try { history = (await connection.query(historySQL)).rows; }
  catch (error) { if (error.code === '42P01') fail('PLATFORM_MIGRATION_REQUIRED'); throw error; }
  validateHistory(history, { complete: true });
  const names = [...oldTables, 'platform_schema_migrations'];
  validateSchema(await snapshotSchema(connection, names), names);
  return Object.freeze({ version: PLATFORM_MIGRATIONS.at(-1).version });
}

export async function migratePlatformDatabase(pool) {
  // Verify the reviewed bytes before borrowing any database connection. There
  // is no directory scanning, alternate plan, raw SQL argument or down command.
  const migrations = await readPlatformMigrations();
  const client = await pool.connect();
  let releaseFailure;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='4000ms'");
    await client.query("SET LOCAL statement_timeout='4500ms'");
    await client.query('SELECT pg_catalog.pg_advisory_xact_lock($1,$2)', PLATFORM_MIGRATION_LOCK_KEY);
    await client.query(`CREATE TABLE IF NOT EXISTS public.platform_schema_migrations (
      version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    validateSchema(await snapshotSchema(client, ['platform_schema_migrations']), ['platform_schema_migrations']);
    const history = (await client.query(historySQL)).rows;
    validateHistory(history);
    const prior = await snapshotSchema(client, oldTables);
    const existing = new Set(prior.columns.map(row => row.table_name));
    if (existing.size !== 0) validateSchema(prior, oldTables);
    if (history.length !== 0 && existing.size === 0) fail('PLATFORM_SCHEMA_INCOMPATIBLE');
    const applied = [];
    for (const migration of migrations.slice(history.length)) {
      await client.query(migration.sql);
      validateSchema(await snapshotSchema(client, oldTables), oldTables);
      await client.query('INSERT INTO public.platform_schema_migrations(version,name,checksum) VALUES($1,$2,$3)',
        [migration.version, migration.name, migration.checksum]);
      applied.push(migration.version);
    }
    await client.query('COMMIT');
    return Object.freeze({ version: migrations.at(-1).version, applied: Object.freeze(applied) });
  } catch (error) {
    releaseFailure = error;
    // A missing acknowledgement leaves COMMIT uncertain. Removing the exact
    // connection avoids queued rollback and pooled reuse of uncertain state.
    if (error.message !== 'Query read timeout') {
      try { await client.query('ROLLBACK'); } catch { /* Preserve the original error; discard the owned client. */ }
    }
    throw error;
  } finally { client.release(releaseFailure); }
}
