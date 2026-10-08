/** Source/CLI host checks only; SQL adoption, concurrency and rollback require
 * the real PostgreSQL cases in postgres.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PLATFORM_MIGRATIONS, readPlatformMigrations } from '../src/schema-migrations.mjs';

test('migration plan loads exactly the fixed reviewed SQL bytes', async () => {
  const migrations = await readPlatformMigrations();
  assert.equal(migrations.length, 1);
  assert.deepEqual(migrations.map(({ sql, ...definition }) => definition), PLATFORM_MIGRATIONS);
  assert.equal(Object.isFrozen(PLATFORM_MIGRATIONS), true);
  assert.equal(Object.isFrozen(PLATFORM_MIGRATIONS[0]), true);
  assert.match(migrations[0].sql, /CREATE TABLE IF NOT EXISTS public\.mobile_authorizations/);
  assert.doesNotMatch(migrations[0].sql, /\b(?:DROP|ALTER|DELETE|TRUNCATE)\b/);
});

test('changed or missing SQL bytes fail before borrowing any database client', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lianum-migration-source-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'src'));
  await mkdir(join(directory, 'migrations'));
  await cp(new URL('../src/schema-migrations.mjs', import.meta.url), join(directory, 'src/schema-migrations.mjs'));
  const file = join(directory, 'migrations', PLATFORM_MIGRATIONS[0].name);
  await writeFile(file, (await readFile(new URL('../migrations/' + PLATFORM_MIGRATIONS[0].name, import.meta.url))) + '\n');
  const copied = await import(pathToFileURL(join(directory, 'src/schema-migrations.mjs')).href);
  let borrowed = 0;
  const pool = { connect() { borrowed++; throw Error('UNEXPECTED_DATABASE_ACCESS'); } };
  await assert.rejects(copied.migratePlatformDatabase(pool), { code: 'PLATFORM_MIGRATION_CHECKSUM_MISMATCH' });
  await rm(file);
  await assert.rejects(copied.migratePlatformDatabase(pool), { code: 'PLATFORM_MIGRATION_SOURCE_MISSING' });
  assert.equal(borrowed, 0);
});

test('fixed migration CLI hides transport credentials and rejects arbitrary arguments', async () => {
  const file = new URL('../src/migrate.mjs', import.meta.url).pathname;
  const sentinel = 'DO_NOT_PRINT_PRIVATE_DATABASE_CREDENTIAL';
  const env = { ...process.env, DATABASE_URL: `postgresql://user:${sentinel}@127.0.0.1:1/migration_test` };
  for (const args of [[], ['arbitrary.sql']]) {
    await assert.rejects(promisify(execFile)(process.execPath, [file, ...args], { env, timeout: 10_000 }), error => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, '');
      assert.equal(error.stderr.includes(sentinel), false);
      const message = JSON.parse(error.stderr);
      assert.equal(message.status, 'FAILED');
      assert.equal(message.error, args.length ? 'PLATFORM_MIGRATION_CONFIGURATION_REQUIRED' : 'PLATFORM_MIGRATION_UNAVAILABLE');
      return true;
    });
  }
});
