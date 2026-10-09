import { TEST_PLATFORM_PRIVACY_KEY } from './privacy-key-v1.mjs';
/** Real PostgreSQL migration acceptance. Each case creates a fresh database in
 * this suite's exclusive container; no existing database or cloud is used. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createPlatformPool } from '../../src/database-pool.mjs';
import { createPostgresAuthorizationStore, authorizationKey, operationTerms } from '../../src/authorization-store.mjs';
import { migratePlatformDatabase, assertPlatformSchema, PLATFORM_MIGRATIONS,
  PLATFORM_MIGRATION_LOCK_KEY } from '../../src/schema-migrations.mjs';
import { startCommitReplyProxy } from './commit-reply-proxy.mjs';
import { redactLegacyPlatformAuthorizationV1 } from '../../src/legacy-authorization-redaction-v1.mjs';

// Literal schema from the bootstrap before versioning, deliberately separate
// from the new SQL file so legacy adoption exercises a pre-existing database.
const legacySQL = `CREATE TABLE public.mobile_challenges (
  challenge_id text PRIMARY KEY,challenge jsonb NOT NULL,expires_at bigint NOT NULL,
  consumed boolean NOT NULL DEFAULT false);
  CREATE TABLE public.mobile_operations (owner_key text NOT NULL,request_id text NOT NULL,
  terms_hash text NOT NULL,PRIMARY KEY(owner_key,request_id));
  CREATE TABLE public.mobile_authorizations (authorization_key text PRIMARY KEY,
  challenge_id text UNIQUE NOT NULL,terms_hash text NOT NULL,response jsonb NOT NULL);`;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function runMigrationCases(t, admin, connectionString, { challenge, unknown, accepted }) {
  async function database(childTest) {
    const name = 'lianum_migration_' + randomBytes(8).toString('hex');
    await admin.query('CREATE DATABASE ' + name);
    const url = new URL(connectionString); url.pathname = '/' + name;
    const pool = createPlatformPool(url.toString());
    childTest.after(() => pool.end());
    // Databases disappear with the exclusive test container and volume.
    return { pool, connectionString: url.toString() };
  }
  async function seedLegacy(pool) {
    await pool.query(legacySQL);
    const values = [challenge(), challenge()];
    for (let index = 0; index < values.length; index++) {
      const original = values[index];
      await pool.query('INSERT INTO public.mobile_challenges VALUES($1,$2,$3,true)',
        [original.challengeId, original, original.expiresAt]);
      await pool.query('INSERT INTO public.mobile_operations VALUES($1,$2,$3)',
        [original.ownerPublicKey, original.intent.requestId, operationTerms(original)]);
      await pool.query('INSERT INTO public.mobile_authorizations VALUES($1,$2,$3,$4)',
        [authorizationKey(original), original.challengeId, operationTerms(original), index ? accepted(original) : unknown(original)]);
    }
    return values;
  }
  async function records(pool) {
    return {
      challenges: (await pool.query('SELECT * FROM public.mobile_challenges ORDER BY challenge_id')).rows,
      operations: (await pool.query('SELECT * FROM public.mobile_operations ORDER BY owner_key,request_id')).rows,
      authorizations: (await pool.query('SELECT * FROM public.mobile_authorizations ORDER BY authorization_key')).rows,
    };
  }

  await t.test('fresh schema requires explicit migration; rerun preserves the version and application time', async childTest => {
    const { pool } = await database(childTest);
    const store = await createPostgresAuthorizationStore(pool, { privacyKey: TEST_PLATFORM_PRIVACY_KEY });
    await assert.rejects(store.ready(), { code: 'PLATFORM_MIGRATION_REQUIRED' });
    assert.equal((await pool.query("SELECT to_regclass('public.mobile_challenges') AS relation")).rows[0].relation, null);
    assert.deepEqual(await migratePlatformDatabase(pool), { version: 1, applied: [1] });
    assert.deepEqual(await assertPlatformSchema(pool), { version: 1 });
    const before = (await pool.query('SELECT * FROM public.platform_schema_migrations')).rows;
    assert.equal(before.length, 1);
    assert.equal(before[0].checksum, PLATFORM_MIGRATIONS[0].checksum);
    assert.equal(await store.ready(), true);
    assert.deepEqual(await migratePlatformDatabase(pool), { version: 1, applied: [] });
    assert.deepEqual((await pool.query('SELECT * FROM public.platform_schema_migrations')).rows, before);
  });

  await t.test('concurrent real migrators apply the version once under the transaction lock', async childTest => {
    const { pool } = await database(childTest);
    const results = await Promise.all(Array.from({ length: 8 }, () => migratePlatformDatabase(pool)));
    assert.equal(results.filter(result => result.applied.length === 1).length, 1);
    assert.ok(results.every(result => result.version === 1 && result.applied.length <= 1));
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM public.platform_schema_migrations')).rows[0].count, 1);
    await assertPlatformSchema(pool);
  });

  await t.test('legacy UNKNOWN/ACCEPTED records survive adoption and store ignores a redirected search_path', async childTest => {
    const { pool, connectionString: originalURL } = await database(childTest);
    const originals = await seedLegacy(pool), before = await records(pool);
    assert.deepEqual(await migratePlatformDatabase(pool), { version: 1, applied: [1] });
    assert.deepEqual(await records(pool), before);
    await pool.query(`CREATE SCHEMA decoy;
      CREATE TABLE decoy.mobile_challenges (LIKE public.mobile_challenges INCLUDING ALL);
      CREATE TABLE decoy.mobile_operations (LIKE public.mobile_operations INCLUDING ALL);
      CREATE TABLE decoy.mobile_authorizations (LIKE public.mobile_authorizations INCLUDING ALL)`);
    const redirectedURL = new URL(originalURL);
    redirectedURL.searchParams.set('options', '-c search_path=decoy,public');
    const redirected = createPlatformPool(redirectedURL.toString());
    childTest.after(() => redirected.end());
    const store = await createPostgresAuthorizationStore(redirected, { privacyKey: TEST_PLATFORM_PRIVACY_KEY });
    assert.equal(await store.ready(), true);
    for (let index = 0; index < originals.length; index++) {
      const response = index ? accepted(originals[index]) : unknown(originals[index]);
      assert.deepEqual(await store.receipt(originals[index]), response);
      assert.deepEqual(await store.consume(originals[index], Date.now()), { duplicate: true, response });
    }
    assert.deepEqual(await records(pool), before);
    const next = challenge(); await store.put(next); const admission = await store.consume(next, Date.now());
    await store.finish(admission.key, accepted(next));
    assert.deepEqual(await store.receipt(next), accepted(next));
    const altered = challenge({ intent: { ...originals[0].intent, action: 'execute', amountAtomic: '101' } });
    await store.put(altered);
    await assert.rejects(store.consume(altered, Date.now()), { code: 'MOBILE_OPERATION_CONFLICT' });
    assert.deepEqual(await store.receipt(originals[0]), unknown(originals[0]));
    for (const name of ['mobile_challenges', 'mobile_operations', 'mobile_authorizations'])
      assert.equal((await pool.query('SELECT count(*)::integer AS count FROM decoy.' + name)).rows[0].count, 0);
  });

  await t.test('explicit legacy redaction preserves original UNKNOWN/ADMITTED and immutable action keys without disclosing terms', async childTest => {
    const { pool } = await database(childTest);
    const originals = await seedLegacy(pool);
    await migratePlatformDatabase(pool);
    const store = await createPostgresAuthorizationStore(pool, { privacyKey: TEST_PLATFORM_PRIVACY_KEY });
    // Current intake may already have its HMAC index beside the old raw one.
    // Merge that duplicate only when both preserve the same original terms.
    const sameTerms = challenge({ intent: { ...originals[0].intent, action: 'execute' } });
    await store.put(sameTerms); await store.consume(sameTerms, Date.now());
    const before = await records(pool), history = (await pool.query('SELECT * FROM public.platform_schema_migrations')).rows;
    const result = await redactLegacyPlatformAuthorizationV1(pool, { privacyKey: TEST_PLATFORM_PRIVACY_KEY, challengeId: originals[0].challengeId });
    assert.deepEqual(result, { profile: 'LIANUM_PLATFORM_LEGACY_REDACTION_V1', redacted: true, challenges: 1, authorizations: 2, operation: true });
    const first = await records(pool);
    for (const prior of before.challenges) {
      const retained = first.challenges.find(row => row.challenge_id === prior.challenge_id);
      assert.equal(retained.expires_at, prior.expires_at); assert.equal(retained.consumed, prior.consumed);
      assert.equal(retained.challenge_id, prior.challenge_id);
    }
    for (const prior of before.authorizations) {
      const retained = first.authorizations.find(row => row.authorization_key === prior.authorization_key);
      assert.equal(retained.challenge_id, prior.challenge_id); assert.equal(retained.response.status, prior.response.status);
      assert.equal(retained.response.operationState, prior.response.operationState); assert.equal(retained.response.retryAllowed, false);
    }
    assert.deepEqual(first.challenges.find(row => row.challenge_id === originals[1].challengeId).challenge, originals[1]);
    assert.deepEqual(await store.receipt(originals[0]), unknown(originals[0]));
    assert.deepEqual(await store.consume(sameTerms, Date.now()), { duplicate: true, response: unknown(sameTerms) });
    assert.deepEqual(await store.consume(originals[0], Date.now()), { duplicate: true, response: unknown(originals[0]) });
    assert.deepEqual(await redactLegacyPlatformAuthorizationV1(pool, { privacyKey: TEST_PLATFORM_PRIVACY_KEY, challengeId: originals[0].challengeId }),
      { profile: 'LIANUM_PLATFORM_LEGACY_REDACTION_V1', redacted: false, challenges: 0, authorizations: 0, operation: false });
    const originalOpaque = first.challenges.find(row => row.challenge_id === originals[0].challengeId).challenge;
    await pool.query('UPDATE public.mobile_challenges SET challenge=$2 WHERE challenge_id=$1',
      [originals[0].challengeId, { ...originalOpaque, ownerPublicKey: originals[0].ownerPublicKey }]);
    const malformedOpaque = await records(pool);
    await assert.rejects(redactLegacyPlatformAuthorizationV1(pool, { privacyKey: TEST_PLATFORM_PRIVACY_KEY, challengeId: originals[0].challengeId }),
      { code: 'PLATFORM_LEGACY_REDACTION_RECORD_INVALID' });
    assert.deepEqual(await records(pool), malformedOpaque);
    await pool.query('UPDATE public.mobile_challenges SET challenge=$2 WHERE challenge_id=$1', [originals[0].challengeId, originalOpaque]);
    const altered = challenge({ intent: { ...originals[0].intent, action: 'execute', amountAtomic: '101' } });
    await store.put(altered); await assert.rejects(store.consume(altered, Date.now()), { code: 'MOBILE_OPERATION_CONFLICT' });
    const stable = await records(pool);
    await assert.rejects(redactLegacyPlatformAuthorizationV1(pool, { privacyKey: '7c'.repeat(32), challengeId: originals[1].challengeId }), { code: 'MOBILE_PRIVACY_KEY_MISMATCH' });
    assert.deepEqual(await records(pool), stable);
    await pool.query('UPDATE public.mobile_operations SET terms_hash=$3 WHERE owner_key=$1 AND request_id=$2',
      [originals[1].ownerPublicKey, originals[1].intent.requestId, '00'.repeat(32)]);
    const corrupted = await records(pool);
    await assert.rejects(redactLegacyPlatformAuthorizationV1(pool, { privacyKey: TEST_PLATFORM_PRIVACY_KEY, challengeId: originals[1].challengeId }), { code: 'PLATFORM_LEGACY_REDACTION_TERMS_UNAVAILABLE' });
    assert.deepEqual(await records(pool), corrupted);
    await pool.query('UPDATE public.mobile_operations SET terms_hash=$3 WHERE owner_key=$1 AND request_id=$2',
      [originals[1].ownerPublicKey, originals[1].intent.requestId, operationTerms(originals[1])]);
    await redactLegacyPlatformAuthorizationV1(pool, { privacyKey: TEST_PLATFORM_PRIVACY_KEY, challengeId: originals[1].challengeId });
    assert.deepEqual(await store.receipt(originals[1]), accepted(originals[1]));
    assert.deepEqual(await store.consume(originals[1], Date.now()), { duplicate: true, response: accepted(originals[1]) });
    const redacted = JSON.stringify(await records(pool));
    for (const original of originals) for (const privateValue of [original.ownerPublicKey, original.intent.requestId, original.intent.recipient, original.intent.assetId])
      assert.equal(redacted.includes(privateValue), false);
    assert.deepEqual((await pool.query('SELECT * FROM public.platform_schema_migrations')).rows, history);
  });

  await t.test('explicit legacy redaction with missing COMMIT reply remains duplicate UNKNOWN on its same original key', async childTest => {
    const { pool, connectionString: originalURL } = await database(childTest);
    const originals = await seedLegacy(pool); await migratePlatformDatabase(pool);
    const proxy = await startCommitReplyProxy(originalURL), bounded = createPlatformPool(proxy.connectionString);
    try {
      await assert.rejects(redactLegacyPlatformAuthorizationV1(bounded, { privacyKey: TEST_PLATFORM_PRIVACY_KEY, challengeId: originals[0].challengeId }), /Query read timeout/);
      assert.equal(proxy.commitForwarded, true); assert.equal(bounded.totalCount, 0); assert.equal(bounded.idleCount, 0);
      const store = await createPostgresAuthorizationStore(pool, { privacyKey: TEST_PLATFORM_PRIVACY_KEY });
      assert.deepEqual(await store.receipt(originals[0]), unknown(originals[0]));
      assert.deepEqual(await store.consume(originals[0], Date.now()), { duplicate: true, response: unknown(originals[0]) });
      assert.equal((await redactLegacyPlatformAuthorizationV1(pool, { privacyKey: TEST_PLATFORM_PRIVACY_KEY, challengeId: originals[0].challengeId })).redacted, false);
    } finally { await bounded.end(); await proxy.close(); }
  });

  await t.test('changed checksum, unknown future version and missing history fail without rewriting records', async childTest => {
    const { pool } = await database(childTest);
    await seedLegacy(pool); await migratePlatformDatabase(pool);
    const before = await records(pool);
    await pool.query('UPDATE public.platform_schema_migrations SET checksum=$1', ['0'.repeat(64)]);
    await assert.rejects(migratePlatformDatabase(pool), { code: 'PLATFORM_MIGRATION_HISTORY_INVALID' });
    await assert.rejects(assertPlatformSchema(pool), { code: 'PLATFORM_MIGRATION_HISTORY_INVALID' });
    assert.equal((await pool.query('SELECT checksum FROM public.platform_schema_migrations')).rows[0].checksum, '0'.repeat(64));
    await pool.query('UPDATE public.platform_schema_migrations SET checksum=$1', [PLATFORM_MIGRATIONS[0].checksum]);
    await pool.query('INSERT INTO public.platform_schema_migrations(version,name,checksum) VALUES(99,$1,$2)', ['future.sql', 'f'.repeat(64)]);
    await assert.rejects(migratePlatformDatabase(pool), { code: 'PLATFORM_MIGRATION_HISTORY_INVALID' });
    await assert.rejects(assertPlatformSchema(pool), { code: 'PLATFORM_MIGRATION_HISTORY_INVALID' });
    await pool.query('DELETE FROM public.platform_schema_migrations WHERE version=99');
    await pool.query('UPDATE public.platform_schema_migrations SET version=2 WHERE version=1');
    await assert.rejects(migratePlatformDatabase(pool), { code: 'PLATFORM_MIGRATION_HISTORY_INVALID' });
    assert.deepEqual(await records(pool), before);
  });

  await t.test('partial/incompatible legacy schemas fail and roll back their new ledger', async childTest => {
    for (const mode of ['PARTIAL', 'COLUMN', 'UNIQUE_INDEX']) {
      const { pool } = await database(childTest);
      if (mode === 'PARTIAL') await pool.query(legacySQL.split(';')[0]);
      else {
        await pool.query(legacySQL);
        if (mode === 'COLUMN') await pool.query('ALTER TABLE public.mobile_operations ADD COLUMN unexpected text');
        else await pool.query('CREATE UNIQUE INDEX unexpected_unique ON public.mobile_authorizations(terms_hash)');
      }
      const original = challenge();
      await pool.query('INSERT INTO public.mobile_challenges VALUES($1,$2,$3,true)', [original.challengeId, original, original.expiresAt]);
      const before = (await pool.query('SELECT * FROM public.mobile_challenges')).rows;
      await assert.rejects(migratePlatformDatabase(pool), { code: 'PLATFORM_SCHEMA_INCOMPATIBLE' });
      assert.equal((await pool.query("SELECT to_regclass('public.platform_schema_migrations') AS relation")).rows[0].relation, null);
      assert.deepEqual((await pool.query('SELECT * FROM public.mobile_challenges')).rows, before);
      if (mode === 'PARTIAL') assert.equal((await pool.query("SELECT to_regclass('public.mobile_operations') AS relation")).rows[0].relation, null);
    }
  });

  await t.test('a real DDL failure rolls back every new table and ledger entry', async childTest => {
    const { pool } = await database(childTest);
    await pool.query(`CREATE FUNCTION public.reject_fixture_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$
      DECLARE command record;
      BEGIN
        FOR command IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
          IF command.object_identity='public.mobile_operations' THEN RAISE EXCEPTION 'CONTROLLED_DDL_FAILURE'; END IF;
        END LOOP;
      END $$;
      CREATE EVENT TRIGGER reject_fixture_ddl ON ddl_command_end WHEN TAG IN ('CREATE TABLE')
      EXECUTE FUNCTION public.reject_fixture_ddl()`);
    await assert.rejects(migratePlatformDatabase(pool), { code: 'P0001' });
    for (const name of ['platform_schema_migrations', 'mobile_challenges', 'mobile_operations', 'mobile_authorizations'])
      assert.equal((await pool.query('SELECT to_regclass($1) AS relation', ['public.' + name])).rows[0].relation, null);
    await pool.query('DROP EVENT TRIGGER reject_fixture_ddl');
    assert.deepEqual(await migratePlatformDatabase(pool), { version: 1, applied: [1] });
  });

  await t.test('a held migration lock times out within the client budget and can be retried after rollback', async childTest => {
    const { pool } = await database(childTest);
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_catalog.pg_advisory_xact_lock($1,$2)', PLATFORM_MIGRATION_LOCK_KEY);
      const began = Date.now();
      await assert.rejects(migratePlatformDatabase(pool), { code: '55P03' });
      assert.ok(Date.now() - began >= 3500 && Date.now() - began < 6500);
      assert.equal((await pool.query("SELECT to_regclass('public.platform_schema_migrations') AS relation")).rows[0].relation, null);
    } finally { await holder.query('ROLLBACK'); holder.release(); }
    assert.deepEqual(await migratePlatformDatabase(pool), { version: 1, applied: [1] });
  });

  await t.test('missing real COMMIT acknowledgement preserves the committed version and old records', async childTest => {
    const { pool, connectionString: originalURL } = await database(childTest);
    await seedLegacy(pool); const before = await records(pool);
    const proxy = await startCommitReplyProxy(originalURL);
    const bounded = createPlatformPool(proxy.connectionString);
    try {
      const began = Date.now();
      await assert.rejects(migratePlatformDatabase(bounded), /Query read timeout/);
      assert.ok(Date.now() - began >= 4500 && Date.now() - began < 10_000);
      assert.equal(proxy.commitForwarded, true);
      assert.equal(bounded.totalCount, 0); assert.equal(bounded.idleCount, 0);
      await assertPlatformSchema(pool);
      assert.deepEqual(await records(pool), before);
      assert.deepEqual(await migratePlatformDatabase(pool), { version: 1, applied: [] });
      assert.equal((await pool.query('SELECT count(*)::integer AS count FROM public.platform_schema_migrations')).rows[0].count, 1);
    } finally { await bounded.end(); await proxy.close(); }
  });

  await t.test('termination of the owning CLI closes its transaction without leaving a migration or lock', async childTest => {
    const { pool, connectionString: originalURL } = await database(childTest);
    const holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT pg_catalog.pg_advisory_xact_lock($1,$2)', PLATFORM_MIGRATION_LOCK_KEY);
    const application = 'migration_fixture_' + randomBytes(8).toString('hex');
    const target = new URL(originalURL); target.searchParams.set('application_name', application);
    const child = spawn(process.execPath, [new URL('../../src/migrate.mjs', import.meta.url).pathname], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DATABASE_URL: target.toString() },
    });
    const exited = once(child, 'exit');
    let output = ''; child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
    try {
      let observed = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const activity = await pool.query('SELECT wait_event FROM pg_stat_activity WHERE application_name=$1', [application]);
        if (activity.rows.some(row => row.wait_event === 'advisory')) { observed = true; break; }
        await pause(50);
      }
      assert.equal(observed, true);
      child.kill('SIGTERM');
      assert.deepEqual(await exited, [null, 'SIGTERM']);
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
      await holder.query('ROLLBACK'); holder.release();
    }
    assert.equal(output, '');
    let gone = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await pool.query('SELECT pid FROM pg_stat_activity WHERE application_name=$1', [application])).rows.length === 0) { gone = true; break; }
      await pause(50);
    }
    assert.equal(gone, true);
    assert.equal((await pool.query("SELECT to_regclass('public.platform_schema_migrations') AS relation")).rows[0].relation, null);
    assert.deepEqual(await migratePlatformDatabase(pool), { version: 1, applied: [1] });
  });
}
