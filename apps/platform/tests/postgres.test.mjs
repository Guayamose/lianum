import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createPostgresAuthorizationStore, authorizationKey } from '../src/authorization-store.mjs';
import { createPlatformPool } from '../src/database-pool.mjs';
import { startPlatformServer } from '../src/server.mjs';
import { startCommitReplyProxy } from './helpers/commit-reply-proxy.mjs';
import { startTestPostgres, poolFor } from './helpers/postgres-container.mjs';
import { MOBILE_AUTHORIZATION_PROFILE, mobileAuthorizationMessage, mobileReceiptMessage } from '../../../packages/mobile-protocol/src/authorization.mjs';
let createMobileApi;

const enabled = process.env.LIANUM_TEST_POSTGRES_DOCKER === '1';
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function identity() {
  const keys = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = keys.publicKey.export({ format: 'jwk' });
  return { privateKey: keys.privateKey, ownerPublicKey: '04' + Buffer.from(jwk.x, 'base64url').toString('hex') + Buffer.from(jwk.y, 'base64url').toString('hex') };
}
const owner = identity();
const intent = (fields = {}) => ({ requestId: 'request_' + randomBytes(8).toString('hex'), action: 'prepare', kind: 'EXIT',
  chain: 'ethereum', assetId: '11'.repeat(32), amountAtomic: '100', recipient: '0x' + '22'.repeat(20), maxFeeAtomic: '5', ...fields });
const challenge = (fields = {}) => ({ version: 1, profile: MOBILE_AUTHORIZATION_PROFILE, origin: 'https://wallet.example.test',
  challengeId: randomBytes(32).toString('hex'), nonce: randomBytes(32).toString('hex'), expiresAt: Date.now() + 60_000,
  ownerPublicKey: owner.ownerPublicKey, intent: intent(), ...fields });
const unknown = value => ({ status: 'UNKNOWN', requestId: value.intent.requestId, operationState: 'UNKNOWN', retryAllowed: false });
const accepted = value => ({ ...unknown(value), status: 'ACCEPTED', operationState: 'ADMITTED' });
function signed(value, key = owner.privateKey) {
  const bytes = sign('sha256', mobileAuthorizationMessage(value, { allowInsecureLocalhost: true }), { key, dsaEncoding: 'ieee-p1363' });
  const s = BigInt('0x' + bytes.subarray(32).toString('hex'));
  if (s > ORDER / 2n) Buffer.from((ORDER - s).toString(16).padStart(64, '0'), 'hex').copy(bytes, 32);
  return { challenge: value, signature: bytes.toString('hex') };
}
function receiptRequest(authorization) {
  const review = { authorization, nonce: randomBytes(32).toString('hex'), expiresAt: Date.now() + 60_000 };
  const bytes = sign('sha256', mobileReceiptMessage(review, { allowInsecureLocalhost: true }), { key: owner.privateKey, dsaEncoding: 'ieee-p1363' });
  const s = BigInt('0x' + bytes.subarray(32).toString('hex'));
  if (s > ORDER / 2n) Buffer.from((ORDER - s).toString(16).padStart(64, '0'), 'hex').copy(bytes, 32);
  return { ...review, signature: bytes.toString('hex') };
}
async function startChild(connectionString) {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [new URL('./helpers/platform-child.mjs', import.meta.url).pathname], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LIANUM_TEST_DATABASE_URL: connectionString, LIANUM_TEST_PORT: String(port) },
  });
  const exited = once(child, 'exit');
  let idleErrors=0;
  let diagnostics = ''; child.stderr.on('data', chunk => { diagnostics += chunk; });
  const started = new Promise((resolve, reject) => {
    let text = ''; const timeout = setTimeout(() => reject(new Error('TEST_CHILD_START_TIMEOUT')), 10_000);
    child.stdout.on('data', chunk => {
      text += chunk;
      while(text.includes('\n')) {
        const index=text.indexOf('\n'),line=text.slice(0,index);text=text.slice(index+1);
        const value=JSON.parse(line);
        if(value.testEvent==='SQL_IDLE_ERROR')idleErrors++;
        else {clearTimeout(timeout);resolve(value);}
      }
    });
    child.once('error', reject); child.once('exit', code => { clearTimeout(timeout); reject(new Error('TEST_CHILD_START_EXIT_' + code + ': ' + diagnostics)); });
  });
  const details = await started;
  return { child, exited, ...details, get idleErrors(){return idleErrors;},
    api: createMobileApi({ origin: details.origin, allowInsecureLocalhost: true }),
    async close() { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; } },
  };
}

test('real PostgreSQL durability, contention and mobile HTTP contract', { skip: !enabled && 'Run npm run test:postgres: creates only an isolated 256 MiB Docker fixture', timeout: 120_000 }, async t => {
  ({createMobileApi}=await import('../../mobile/src/api/wallet-api.mjs'));
  const database = await startTestPostgres(); t.after(() => database.close());
  let pool = poolFor(database.connectionString), store = await createPostgresAuthorizationStore(pool);
  t.after(async () => { if (pool) await pool.end(); });

  await t.test('JSONB key reordering preserves canonical challenge binding; altered/expired/missing originals fail closed', async () => {
    const original = challenge(); await store.put(original);
    const retained = (await pool.query('SELECT challenge FROM mobile_challenges WHERE challenge_id=$1', [original.challengeId])).rows[0].challenge;
    assert.notEqual(JSON.stringify(retained), JSON.stringify(original));
    assert.equal((await store.consume(original, Date.now())).duplicate, false);
    const changed = challenge(); await store.put(changed);
    await assert.rejects(store.consume({ ...changed, nonce: 'ff'.repeat(32) }, Date.now()), { code: 'MOBILE_CHALLENGE_NOT_AVAILABLE' });
    const expired = challenge(); await store.put(expired);
    await assert.rejects(store.consume(expired, expired.expiresAt), { code: 'MOBILE_CHALLENGE_NOT_AVAILABLE' });
    await assert.rejects(store.consume(challenge(), Date.now()), { code: 'MOBILE_CHALLENGE_NOT_AVAILABLE' });
  });

  await t.test('concurrent same challenge and new challenges for the same owner/request/action each consume once', async () => {
    const original = challenge(); await store.put(original);
    const results = await Promise.all(Array.from({ length: 16 }, () => store.consume(original, Date.now())));
    assert.equal(results.filter(result => !result.duplicate).length, 1);
    const response = accepted(original); await store.finish(authorizationKey(original), response);
    assert.deepEqual((await store.consume(original, Date.now())).response, response);
    const first = challenge(); const alternatives = Array.from({ length: 12 }, () => challenge({ intent: first.intent }));
    await Promise.all(alternatives.map(value => store.put(value)));
    const parallel = await Promise.all(alternatives.map(value => store.consume(value, Date.now())));
    assert.equal(parallel.filter(result => !result.duplicate).length, 1);
    assert.ok(parallel.every(result => result.response.requestId === first.intent.requestId));
  });

  await t.test('owner/request/action isolation and immutable original operation terms survive competing actions', async () => {
    const original = challenge(); await store.put(original); await store.consume(original, Date.now());
    const execute = challenge({ intent: { ...original.intent, action: 'execute' } }); await store.put(execute);
    assert.equal((await store.consume(execute, Date.now())).duplicate, false);
    const otherOwner = challenge({ ownerPublicKey: identity().ownerPublicKey, intent: original.intent }); await store.put(otherOwner);
    assert.equal((await store.consume(otherOwner, Date.now())).duplicate, false);
    for (const [field, value] of Object.entries({ amountAtomic: '101', maxFeeAtomic: '6', chain: 'base', recipient: 'other', assetId: 'aa'.repeat(32), kind: 'TOP_UP' })) {
      const changed = challenge({ intent: { ...original.intent, action: 'recover', [field]: value } }); await store.put(changed);
      await assert.rejects(store.consume(changed, Date.now()), { code: 'MOBILE_OPERATION_CONFLICT' });
    }
    const first = challenge(), second = challenge({ intent: { ...first.intent, action: 'execute', amountAtomic: '102' } });
    await store.put(first); await store.put(second);
    const results = await Promise.allSettled([store.consume(first, Date.now()), store.consume(second, Date.now())]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'MOBILE_OPERATION_CONFLICT');
  });

  await t.test('committed UNKNOWN and ACCEPTED survive pool/process reload and actual PostgreSQL restart', async () => {
    const pending = challenge(), complete = challenge(); await store.put(pending); await store.put(complete);
    await store.consume(pending, Date.now()); const admitted = await store.consume(complete, Date.now());
    await store.finish(admitted.key, accepted(complete)); await pool.end(); pool = null;
    await database.restart(); pool = poolFor(database.connectionString); store = await createPostgresAuthorizationStore(pool);
    assert.deepEqual(await store.consume(pending, Date.now()), { duplicate: true, response: unknown(pending) });
    assert.deepEqual(await store.consume(complete, Date.now()), { duplicate: true, response: accepted(complete) });
  });

  await t.test('lost COMMIT reply times out without dispatch and preserves real committed UNKNOWN on reconnect', async () => {
    const proxy = await startCommitReplyProxy(database.connectionString);
    const boundedPool = createPlatformPool(proxy.connectionString);
    let app, effects = 0;
    try {
      const boundedStore = await createPostgresAuthorizationStore(boundedPool);
      app = await startPlatformServer({ origin: 'https://wallet.example.test', store: boundedStore,
        executor: { capabilities: { prepare: true }, submit: async () => { effects++; return { admitted: true }; } } });
      const original = challenge(), authorization = signed(original);
      await boundedStore.put(original);
      const began = Date.now();
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/mobile/authorizations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authorization), signal: AbortSignal.timeout(10_000),
      });
      assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'MOBILE_PERSISTENCE_UNAVAILABLE' });
      assert.ok(Date.now() - began >= 4500 && Date.now() - began < 10_000);
      assert.equal(proxy.commitForwarded, true); assert.equal(effects, 0);
      assert.equal(boundedPool.idleCount, 0); assert.equal(boundedPool.totalCount, 0);
      const retained = await pool.query('SELECT response FROM mobile_authorizations WHERE authorization_key=$1', [authorizationKey(original)]);
      assert.equal(retained.rows.length, 1); assert.deepEqual(retained.rows[0].response, unknown(original));
      assert.deepEqual(await store.consume(original, Date.now()), { duplicate: true, response: unknown(original) });
      assert.equal((await pool.query('SELECT consumed FROM mobile_challenges WHERE challenge_id=$1', [original.challengeId])).rows[0].consumed, true);
    } finally { await app?.close(); await boundedPool.end(); await proxy.close(); }
  });

  let processServer;
  t.after(async () => { if (processServer) await processServer.close(); });
  await t.test('the native mobile client uses the real HTTP wrapper; signature admission never claims settled funds', async () => {
    processServer = await startChild(database.connectionString);
    const state = await processServer.api.state(); assert.equal(state.privatePortfolio, null); assert.equal(state.connection, 'READY');
    const original = await processServer.api.challenge(owner.ownerPublicKey, intent());
    const authorization = signed(original);
    const first = await processServer.api.submit(authorization); assert.deepEqual(first, accepted(original));
    assert.deepEqual(await processServer.api.submit(authorization), first);
    assert.equal(Number((await pool.query('SELECT count(*) FROM test_dispatches WHERE authorization_key=$1', [authorizationKey(original)])).rows[0].count), 1);
    const changed = { ...authorization, challenge: { ...original, intent: { ...original.intent, amountAtomic: '101' } } };
    const response = await fetch(processServer.origin + '/v1/mobile/authorizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed) });
    assert.equal(response.status, 403);
    const beforeRestart = processServer; await beforeRestart.close(); processServer = await startChild(database.connectionString);
    // Replaying the original signature targets its signed original origin. A
    // fresh challenge at the new process origin retains the same operation ID.
    const refreshed = await processServer.api.challenge(owner.ownerPublicKey, original.intent);
    assert.deepEqual(await processServer.api.submit(signed(refreshed)), first);
    assert.equal(Number((await pool.query('SELECT count(*) FROM test_dispatches WHERE authorization_key=$1', [authorizationKey(original)])).rows[0].count), 1);
  });

  await t.test('mobile signed receipt query joins an expired consumed original without consuming or dispatching again', async () => {
    // Controlled historical admission time; the real SQL rows and signatures
    // are genuine. This creates no chain effect or claimed economic terminal.
    const original = challenge({ origin: processServer.origin, expiresAt: Date.now() - 1 });
    await store.put(original); const admitted = await store.consume(original, original.expiresAt - 1);
    await store.finish(admitted.key, accepted(original));
    const authorization = signed(original), query = receiptRequest(authorization);
    const before = await pool.query(`SELECT
      (SELECT count(*) FROM mobile_authorizations)::text AS authorizations,
      (SELECT count(*) FROM mobile_challenges WHERE consumed)::text AS consumed,
      (SELECT count(*) FROM test_dispatches)::text AS dispatches`);
    const receipt = await processServer.api.receipt(query);
    assert.deepEqual(receipt.authorization, accepted(original));
    assert.equal(receipt.challengeId, original.challengeId); assert.equal(receipt.nonce, query.nonce);
    assert.equal(receipt.action, original.intent.action);
    assert.deepEqual(await processServer.api.receipt(query), receipt);
    const after = await pool.query(`SELECT
      (SELECT count(*) FROM mobile_authorizations)::text AS authorizations,
      (SELECT count(*) FROM mobile_challenges WHERE consumed)::text AS consumed,
      (SELECT count(*) FROM test_dispatches)::text AS dispatches`);
    assert.deepEqual(after.rows, before.rows);
    const substitute = signed({ ...original, nonce: randomBytes(32).toString('hex') });
    await assert.rejects(processServer.api.receipt(receiptRequest(substitute)), /MOBILE_SERVICE_UNAVAILABLE/);
    assert.deepEqual(await store.receipt(original), accepted(original));
  });

  await t.test('production Pool survives idle SQL connection loss with HTTP alive, then restores readiness without redispatch', async () => {
    const original=await processServer.api.challenge(owner.ownerPublicKey,intent());
    const authorization=signed(original),admitted=await processServer.api.submit(authorization);
    assert.deepEqual(admitted,accepted(original));
    // Populate the same idle Pool used by run.mjs; do not close/recreate it.
    assert.equal((await processServer.api.state()).connection,'READY');
    await database.stop();
    assert.equal((await fetch(processServer.origin+'/health/live')).status,200);
    assert.equal((await fetch(processServer.origin+'/health/ready')).status,503);
    assert.equal((await processServer.api.state()).connection,'DISCONNECTED');
    assert.equal(processServer.child.exitCode,null);
    assert.ok(processServer.idleErrors>0,'The production idle error event must actually occur');
    await database.start();
    assert.equal((await fetch(processServer.origin+'/health/ready')).status,200);
    assert.equal((await processServer.api.state()).connection,'READY');
    assert.deepEqual(await processServer.api.submit(authorization),admitted);
    assert.equal(Number((await pool.query('SELECT count(*) FROM test_dispatches WHERE authorization_key=$1',[authorizationKey(original)])).rows[0].count),1);
  });

  await t.test('lost reply and process crashes before/after dispatch retain UNKNOWN without a second dispatch', async () => {
    for (const recipient of ['lost_response', 'crash_before_effect', 'crash_after_effect']) {
      const original = await processServer.api.challenge(owner.ownerPublicKey, intent({ recipient, action: 'execute' }));
      const response = await processServer.api.submit(signed(original)); assert.deepEqual(response, unknown(original));
      if (recipient.startsWith('crash_')) { await processServer.exited; processServer = await startChild(database.connectionString); }
      const refreshed = await processServer.api.challenge(owner.ownerPublicKey, original.intent);
      assert.deepEqual(await processServer.api.submit(signed(refreshed)), response);
      const count = Number((await pool.query('SELECT count(*) FROM test_dispatches WHERE authorization_key=$1', [authorizationKey(original)])).rows[0].count);
      assert.equal(count, recipient === 'crash_before_effect' ? 0 : 1);
    }
  });
});
