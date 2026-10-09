/** Real PostgreSQL + actual dispatcher, signature codecs and branded journal.
 * Bridge/actor ports are explicit HOST doubles: no native proof, funded note,
 * network settlement, physical custody or economic acceptance is claimed. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { startTestPostgres, poolFor } from './helpers/postgres-container.mjs';
import { startCommitReplyProxy } from './helpers/commit-reply-proxy.mjs';
import { createPlatformPool } from '../src/database-pool.mjs';
import { migrateOriginalDeviceDispatchSchemaV1, assertOriginalDeviceDispatchSchemaV1 } from '../src/original-device-schema-v1.mjs';
import { deviceReservationFixtureV1 } from '../../mobile/tests/helpers/device-reservation-fixture-v1.mjs';
import { deviceReservationConsentMessageV1 } from '../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';
import { signDeviceMessage } from '../../mobile/src/custody/signing.mjs';
const base = new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/', import.meta.url);
const fixture = deviceReservationFixtureV1(), actor = Object.freeze({
  async deviceDepositOriginalBinding() { return fixture.consent.binding; },
});
const issued = new Map(); let effects = 0, preflights = 0;
const bridge = Object.freeze({ async reserve(input) {
  assert.equal(issued.has(input.consent.challengeId), true); effects++;
  issued.delete(input.consent.challengeId); return { ORIGINAL_HOST_ONLY: true, observed: false };
} });
const deposit = Object.freeze({}), execution = Object.freeze({});
const branded = (value, expected) => { assert.equal(value, expected, 'HOST_ORIGINAL_REFERENCE'); return actor; };
mock.module(new URL('mobile/paired-original-account-actor-v2.mjs', base), { exports: {
  assertPairedOriginalAccountActorV2(value) { assert.equal(value, actor); },
  pairedOriginalAccountActorDescriptorV2(value) { assert.equal(value, actor); return fixture.descriptor; },
} });
mock.module(new URL('global-state/device-owner-deposit-bridge-v1.mjs', base), { exports: {
  deviceOwnerDepositBridgeActorV1(value) { return branded(value, deposit); },
  assertDeviceOwnerDepositDurableRequestV1() { throw Error('HOST_DEPOSIT_FORBIDDEN'); },
} });
mock.module(new URL('global-state/device-owner-reservation-bridge-v1.mjs', base), { exports: {
  deviceOwnerReservationBridgeActorV1(value) { return branded(value, bridge); },
  async assertDeviceOwnerReservationDurableRequestV1(value, input) {
    branded(value, bridge); preflights++;
    assert.deepEqual(issued.get(input.consent.challengeId), input.consent, 'HOST_ISSUED_CONSENT_REQUIRED');
    return input.consent;
  },
} });
mock.module(new URL('global-state/device-owner-execution-bridge-v1.mjs', base), { exports: {
  deviceOwnerExecutionBridgeActorV1(value) { return branded(value, execution); },
  assertDeviceOwnerExecutionTransportBindingsV1(value, reservation) { branded(value, execution); branded(reservation, bridge); },
  assertDeviceOwnerExecutionDurableRequestV1() { throw Error('HOST_EXECUTION_FORBIDDEN'); },
} });
const { createOriginalDeviceDurableDispatchV1, runOriginalDeviceDurableDispatchV1, assertOriginalDeviceDurableDispatchBindingsV1 }
  = await import(new URL('mobile/original-device-durable-dispatch-v1.mjs', base));
const bridges = { depositBridge: deposit, reservationBridge: bridge, executionBridge: execution };
const key = '51'.repeat(32), deviceKey = new Uint8Array(32).fill(11);
let nextId = 100;
function request(jobId = fixture.consent.jobId, register = true) {
  const consent = structuredClone(fixture.consent);
  Object.assign(consent, { action: 'RESERVE_S', challengeId: (++nextId).toString(16).padStart(64, '0'),
    nonce: (++nextId).toString(16).padStart(64, '0'), jobId, expiresAt: Date.now() + 15000,
    proofSHA256: '73'.repeat(32), publicInputsSHA256: '74'.repeat(32), openingDisclosure: null });
  if (register) issued.set(consent.challengeId, structuredClone(consent));
  return { consent, signature: signDeviceMessage(deviceKey, deviceReservationConsentMessageV1(consent)) };
}
test('original effects are fenced by real SQL across duplicate consent, missing COMMIT reply and key changes', { timeout: 60000 }, async t => {
  const pg = await startTestPostgres(); t.after(() => pg.close());
  const pool = poolFor(pg.connectionString); t.after(() => pool.end());
  await assert.rejects(assertOriginalDeviceDispatchSchemaV1(pool));
  assert.deepEqual(await migrateOriginalDeviceDispatchSchemaV1(pool), { version: 1, created: true });
  assert.deepEqual(await migrateOriginalDeviceDispatchSchemaV1(pool), { version: 1, created: false });
  const journal = await createOriginalDeviceDurableDispatchV1({ ...bridges, pool, privacyKey: key });
  t.after(() => journal.close());
  assert.equal(assertOriginalDeviceDurableDispatchBindingsV1(journal, bridges), actor);
  assert.throws(() => assertOriginalDeviceDurableDispatchBindingsV1({ ...journal }, bridges), { code: 'DEVICE_DURABLE_ORIGINAL_REQUIRED' });
  const accepted = request();
  const invalid = request(); invalid.signature = '01'.repeat(64);
  await assert.rejects(runOriginalDeviceDurableDispatchV1(journal, bridge, 'reserve', invalid));
  assert.equal(preflights, 0); assert.equal(effects, 0);
  const madeUp = request(undefined, false);
  await assert.rejects(runOriginalDeviceDurableDispatchV1(journal, bridge, 'reserve', madeUp), /HOST_ISSUED_CONSENT_REQUIRED/);
  assert.equal((await pool.query('SELECT count(*)::integer AS n FROM public.original_device_dispatch_v1')).rows[0].n, 0);
  await assert.rejects(runOriginalDeviceDurableDispatchV1(journal, execution, 'reserve', accepted), { code: 'DEVICE_DURABLE_ORIGINAL_EFFECT' });
  assert.deepEqual(await runOriginalDeviceDurableDispatchV1(journal, bridge, 'reserve', accepted), { ORIGINAL_HOST_ONLY: true, observed: false });
  const freshDuplicate = request();
  await assert.rejects(runOriginalDeviceDurableDispatchV1(journal, bridge, 'reserve', freshDuplicate), { code: 'DEVICE_DURABLE_ALREADY_ADMITTED' });
  assert.equal(effects, 1);
  await assert.rejects(createOriginalDeviceDurableDispatchV1({ ...bridges, pool, privacyKey: '52'.repeat(32) }), { code: 'DEVICE_DURABLE_PRIVACY_KEY_CHANGED' });
  const proxy = await startCommitReplyProxy(pg.connectionString), uncertain = createPlatformPool(proxy.connectionString);
  try {
    const lostJournal = await createOriginalDeviceDurableDispatchV1({ ...bridges, pool: uncertain, privacyKey: key });
    try {
      const lost = request('91'.repeat(32));
      await assert.rejects(runOriginalDeviceDurableDispatchV1(lostJournal, bridge, 'reserve', lost), /Query read timeout/);
      assert.equal(proxy.commitForwarded, true); assert.equal(effects, 1);
      assert.equal(uncertain.totalCount, 0);
      await assert.rejects(runOriginalDeviceDurableDispatchV1(journal, bridge, 'reserve', request(lost.consent.jobId)), { code: 'DEVICE_DURABLE_ALREADY_ADMITTED' });
    } finally { lostJournal.close(); }
  } finally { await uncertain.end(); await proxy.close(); }
  const rows = (await pool.query('SELECT * FROM public.original_device_dispatch_v1 ORDER BY state')).rows;
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(row => row.state), ['RETURNED', 'UNKNOWN']);
  for (const row of rows) for (const name of ['operation_key', 'consent_key', 'terms_hash']) assert.match(row[name], /^[0-9a-f]{64}$/);
  const stored = JSON.stringify(rows);
  for (const privateValue of [fixture.descriptor.devicePublicKey, fixture.descriptor.pairingId,
    accepted.consent.binding.accountIdentitySHA256, accepted.consent.jobId, accepted.consent.statement.inputCommitment])
    assert.equal(stored.includes(privateValue), false);
  assert.equal(effects, 1);
  journal.close(); await assert.rejects(runOriginalDeviceDurableDispatchV1(journal, bridge, 'reserve', request()), { code: 'DEVICE_DURABLE_CLOSED' });
});
