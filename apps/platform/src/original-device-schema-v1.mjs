/** Separate fixed migration for original device admission. The normal V1
 * intake migration/history is unchanged; startup never performs DDL. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const SHA = 'ddb3503bd3fc67ca06d96afa55c40b3e07d8d4995451187135ebd5f78acb3b37';
const MARKER = 'ORIGINAL_DEVICE_DISPATCH_SCHEMA_V1';
const TABLES = ['original_device_dispatch_meta_v1', 'original_device_dispatch_v1'];
const LOCK = [0x4c49414e, 0x44535031];
const fail = code => { throw Object.assign(new Error(code), { code }); };
async function reviewedSQL() {
  const bytes = await readFile(new URL('../migrations/002_original_device_dispatch.sql', import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== SHA) fail('PLATFORM_ORIGINAL_SCHEMA_SOURCE_CHANGED');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
async function validate(connection) {
  const columns = (await connection.query(`SELECT c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
    a.attnotnull,a.attidentity,a.attgenerated,c.relkind,c.relpersistence,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname,a.attnum`, [TABLES])).rows;
  for (const [table, expected] of [[TABLES[0], ['metadata_key', 'value']],
    [TABLES[1], ['operation_key', 'consent_key', 'terms_hash', 'state']]]) {
    const rows = columns.filter(row => row.relname === table);
    if (rows.length !== expected.length || rows.some((row, index) => row.attname !== expected[index]
      || row.type !== 'text' || row.attnotnull !== true || row.attidentity !== '' || row.attgenerated !== ''
      || row.relkind !== 'r' || row.relpersistence !== 'p' || row.default_expression !== null))
      fail('PLATFORM_ORIGINAL_SCHEMA_INCOMPATIBLE');
  }
  const indexes = (await connection.query(`SELECT c.relname,i.indisprimary,i.indisvalid,i.indisready,
    k.contype,k.condeferrable,k.condeferred,k.convalidated,
    ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(i.indkey) WITH ORDINALITY x(attnum,position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.attnum ORDER BY x.position) AS columns,
    pg_catalog.pg_get_expr(i.indpred,i.indrelid) AS predicate,pg_catalog.pg_get_expr(i.indexprs,i.indrelid) AS expression
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_constraint k ON k.conindid=i.indexrelid AND k.conrelid=c.oid
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND i.indisunique`, [TABLES])).rows;
  const keys = [[TABLES[0], 'p', 'metadata_key'], [TABLES[1], 'p', 'operation_key'], [TABLES[1], 'u', 'consent_key']];
  if (indexes.length !== 3 || keys.some(([table, kind, name]) => !indexes.some(row => row.relname === table
    && row.contype === kind && row.indisprimary === (kind === 'p') && JSON.stringify(row.columns) === JSON.stringify([name])
    && row.indisvalid === true && row.indisready === true && row.convalidated === true
    && row.condeferrable === false && row.condeferred === false && row.predicate === null && row.expression === null)))
    fail('PLATFORM_ORIGINAL_SCHEMA_INCOMPATIBLE');
}
export async function assertOriginalDeviceDispatchSchemaV1(connection) {
  await reviewedSQL(); await validate(connection);
  const rows = (await connection.query('SELECT value FROM public.original_device_dispatch_meta_v1 WHERE metadata_key=$1', [MARKER])).rows;
  if (rows.length !== 1 || rows[0].value !== SHA) fail('PLATFORM_ORIGINAL_SCHEMA_MIGRATION_REQUIRED');
  return Object.freeze({ version: 1, profile: MARKER });
}
export async function migrateOriginalDeviceDispatchSchemaV1(pool) {
  const sql = await reviewedSQL(), client = await pool.connect(); let failure, commitAttempted = false;
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='4000ms'");
    await client.query("SET LOCAL statement_timeout='4500ms'");
    await client.query('SELECT pg_catalog.pg_advisory_xact_lock($1,$2)', LOCK);
    const present = (await client.query('SELECT pg_catalog.to_regclass($1) AS relation', ['public.' + TABLES[0]])).rows;
    if (present.length !== 1) fail('PLATFORM_ORIGINAL_SCHEMA_INCOMPATIBLE');
    const created = present[0].relation === null;
    if (created) {
      await client.query(sql);
      await client.query('INSERT INTO public.original_device_dispatch_meta_v1(metadata_key,value) VALUES($1,$2)', [MARKER, SHA]);
    }
    await assertOriginalDeviceDispatchSchemaV1(client);
    commitAttempted = true; await client.query('COMMIT');
    return Object.freeze({ version: 1, created });
  } catch (error) {
    failure = error;
    if (!commitAttempted) { try { await client.query('ROLLBACK'); } catch {} }
    throw error;
  } finally { client.release(failure); }
}
