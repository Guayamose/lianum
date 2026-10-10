/** Durable admission for existing ORIGINAL device effects. SQL holds keyed
 * commitments only. It cannot recreate a bridge, approve a proof, declare a
 * payment final, or retry an uncertain send. Native journals remain canonical.
 * The explicit operator supplies its bounded PostgreSQL pool and stable key. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { createHmac, createPublicKey, verify } from 'node:crypto';
import { cloneInput } from '../../execution/account/preparation/readiness-inputs.mjs';
import { assertPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2 }
  from './paired-original-account-actor-v2.mjs';
import { deviceOwnerDepositBridgeActorV1, assertDeviceOwnerDepositDurableRequestV1 } from '../../accounts/authority/device-owner-deposit-bridge-v1.mjs';
import { deviceOwnerReservationBridgeActorV1, assertDeviceOwnerReservationDurableRequestV1 } from '../../accounts/authority/device-owner-reservation-bridge-v1.mjs';
import { deviceOwnerExecutionBridgeActorV1, assertDeviceOwnerExecutionTransportBindingsV1, assertDeviceOwnerExecutionDurableRequestV1 }
  from '../../accounts/authority/device-owner-execution-bridge-v1.mjs';
import { normalizeOriginalAccountSignatureV2 } from '../../../../mobile-protocol/src/original-account-review-v2.mjs';
import { validateDeviceDepositConsentFreshV1, deviceDepositConsentMessageV1 }
  from '../../../../mobile-protocol/src/device-deposit-consent-v1.mjs';
import { validateDeviceReservationConsentFreshV1, deviceReservationConsentMessageV1 }
  from '../../../../mobile-protocol/src/device-reservation-consent-v1.mjs';
import { validateDeviceExecutionConsentFreshV1, deviceExecutionConsentMessageV1 }
  from '../../../../mobile-protocol/src/device-execution-consent-v1.mjs';
import { validateDeviceExitConsentFreshV1, deviceExitConsentMessageV1 }
  from '../../../../mobile-protocol/src/device-exit-consent-v1.mjs';

const owned = new WeakMap();
const LOCK = Object.freeze([0x4c49414e, 0x44535031]);
const KEY_ROW = 'ORIGINAL_DEVICE_DISPATCH_PRIVACY_KEY_V1';
const fail = code => { throw Object.assign(new Error(code), { code }); };
function exact(value, names) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== names.length || !names.every(name =>
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value'))) fail('DEVICE_DURABLE_CONFIGURATION');
}
// These are the existing signed effect domains. Reads, proof jobs and reviews
// retain their original implementations and do not create SQL effect authority.
const EFFECTS = Object.freeze({
  fund: ['deposit', 'FUND_D26', validateDeviceDepositConsentFreshV1, deviceDepositConsentMessageV1, value => value],
  reserve: ['reservation', 'RESERVE_S', validateDeviceReservationConsentFreshV1, deviceReservationConsentMessageV1, value => value],
  execute: ['execution', 'EXECUTE_NATIVE', validateDeviceExecutionConsentFreshV1, deviceExecutionConsentMessageV1, value => value.reservation],
  recover: ['execution', 'RECOVER_NATIVE', validateDeviceExecutionConsentFreshV1, deviceExecutionConsentMessageV1, value => value.reservation],
  withdraw: ['execution', 'WITHDRAW_W39', validateDeviceExitConsentFreshV1, deviceExitConsentMessageV1, value => value],
});
/** Validate the operator's existing key marker BEFORE a one-use economic
 * recovery issuer is opened. A missing/different SQL journal cannot consume
 * the captured account merely by failing later during listener installation.
 * This authenticates infrastructure only; it restores no bridge or outcome. */
export async function assertOriginalDeviceDurableRecoveryInfrastructureV1(input){
 if(arguments.length!==1)fail('DEVICE_DURABLE_CONFIGURATION');exact(input,['pool','privacyKey']);
 const {pool,privacyKey}=input;
 if(!pool||types.isProxy(pool)||typeof pool.connect!=='function'||typeof pool.query!=='function'
  ||typeof privacyKey!=='string'||!/^[0-9a-f]{64}$/.test(privacyKey)||privacyKey==='0'.repeat(64))fail('DEVICE_DURABLE_CONFIGURATION');
 const bytes=Buffer.from(privacyKey,'hex');
 try{
  const keyPin=createHmac('sha256',bytes).update('LIANUM_ORIGINAL_DEVICE_DISPATCH_V1\nkey-pin\n').update(KEY_ROW).digest('hex');
  await pool.query('SELECT operation_key,consent_key,terms_hash,state FROM public.original_device_dispatch_v1 LIMIT 0');
  const marker=await pool.query('SELECT value FROM public.original_device_dispatch_meta_v1 WHERE metadata_key=$1',[KEY_ROW]);
  if(marker.rows.length!==1||marker.rows[0].value!==keyPin)fail('DEVICE_DURABLE_RECOVERY_JOURNAL_REQUIRED');
  return Object.freeze({originalInfrastructureVerified:true,economicAuthorityRestored:false});
 }finally{bytes.fill(0);}
}
export async function createOriginalDeviceDurableDispatchV1(input) {
  if (arguments.length !== 1) fail('DEVICE_DURABLE_CONFIGURATION');
  exact(input, ['depositBridge', 'reservationBridge', 'executionBridge', 'pool', 'privacyKey']);
  const { depositBridge, reservationBridge, executionBridge, pool, privacyKey } = input;
  if (!pool || types.isProxy(pool) || typeof pool.connect !== 'function' || typeof pool.query !== 'function'
    || typeof privacyKey !== 'string' || !/^[0-9a-f]{64}$/.test(privacyKey)
    || privacyKey === '0'.repeat(64)) fail('DEVICE_DURABLE_CONFIGURATION');
  const actor = deviceOwnerDepositBridgeActorV1(depositBridge);
  const original = () => {
    assertPairedOriginalAccountActorV2(actor);
    assert.equal(deviceOwnerDepositBridgeActorV1(depositBridge), actor, 'DEVICE_DURABLE_ORIGINAL_BRIDGE');
    assert.equal(deviceOwnerReservationBridgeActorV1(reservationBridge), actor, 'DEVICE_DURABLE_ORIGINAL_BRIDGE');
    assert.equal(deviceOwnerExecutionBridgeActorV1(executionBridge), actor, 'DEVICE_DURABLE_ORIGINAL_BRIDGE');
    assertDeviceOwnerExecutionTransportBindingsV1(executionBridge, reservationBridge);
  };
  original();
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor), keyBytes = Buffer.from(privacyKey, 'hex');
  const signer = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(descriptor.devicePublicKey.slice(2, 66), 'hex').toString('base64url'),
    y: Buffer.from(descriptor.devicePublicKey.slice(66), 'hex').toString('base64url') } });
  let closed = false;
  const mac = (domain, bytes) => createHmac('sha256', keyBytes)
    .update('LIANUM_ORIGINAL_DEVICE_DISPATCH_V1\n' + domain + '\n').update(bytes).digest('hex');
  const keyPin = mac('key-pin', KEY_ROW);
  const live = () => { if (closed) fail('DEVICE_DURABLE_CLOSED'); original(); };
  // Migration is explicit. Startup performs no CREATE, adoption or redaction.
  try {
    await pool.query('SELECT operation_key,consent_key,terms_hash,state FROM public.original_device_dispatch_v1 LIMIT 0');
    const metadata = await pool.query('SELECT value FROM public.original_device_dispatch_meta_v1 WHERE metadata_key=$1', [KEY_ROW]);
    if (metadata.rows.length > 1 || (metadata.rows.length === 1 && metadata.rows[0].value !== keyPin)) fail('DEVICE_DURABLE_PRIVACY_KEY_CHANGED');
    live();
  } catch (error) { keyBytes.fill(0); throw error; }
  const journal = Object.freeze({ close() {
    if (arguments.length !== 0) fail('DEVICE_DURABLE_CONFIGURATION');
    closed = true; keyBytes.fill(0);
  } });
  const bridgeByRole = { deposit: depositBridge, reservation: reservationBridge, execution: executionBridge };
  owned.set(journal, { actor, depositBridge, reservationBridge, executionBridge, live,
    async run(bridge, method, input) {
      live(); const effect = EFFECTS[method];
      if (!effect || bridgeByRole[effect[0]] !== bridge) fail('DEVICE_DURABLE_ORIGINAL_EFFECT');
      exact(input, ['consent', 'signature']);
      // A data-only signed frame is normalized before any database access. The
      // actual bridge later checks its pending original challenge and account.
      const consent = effect[2](cloneInput(input.consent)), base = effect[4](consent);
      if (consent.action !== effect[1] || base.origin !== descriptor.origin
        || base.pairingId !== descriptor.pairingId || base.devicePublicKey !== descriptor.devicePublicKey)
        fail('DEVICE_DURABLE_ORIGINAL_CONSENT');
      const signature = normalizeOriginalAccountSignatureV2(input.signature), message = effect[3](consent);
      let termsHash;
      try {
        if (!verify('sha256', message, { key: signer, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex')))
          fail('DEVICE_DURABLE_SIGNATURE');
        termsHash = mac('terms', message);
      } finally { message.fill(0); }
      assert.deepEqual(await actor.deviceDepositOriginalBinding(), base.binding, 'DEVICE_DURABLE_BINDING_CHANGED'); live();
      // Only the bridge's actual issued challenge can occupy a durable slot.
      // Signature framing alone cannot poison an economic job with a made-up
      // job/challenge. These checks neither consume consent nor mint a grant.
      const preflight = method === 'fund' ? await assertDeviceOwnerDepositDurableRequestV1(bridge, { consent, signature })
        : method === 'reserve' ? await assertDeviceOwnerReservationDurableRequestV1(bridge, { consent, signature })
        : await assertDeviceOwnerExecutionDurableRequestV1(bridge, method, { consent, signature });
      assert.deepEqual(preflight, consent, 'DEVICE_DURABLE_ORIGINAL_CONSENT'); live();
      // Different fresh challenges for this SAME economic job cannot create a
      // second send. Account lifetime, device pairing and action are bound.
      const operationKey = mac('operation', JSON.stringify([base.binding.accountIdentitySHA256,
        base.binding.originalAccountLifetime, base.binding.requestId, base.jobId, consent.action]));
      const consentKey = mac('consent', JSON.stringify([descriptor.origin, descriptor.pairingId, base.challengeId]));
      const client = await pool.connect(); let failure, commitAttempted = false, duplicate = false;
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout='4000ms'");
        await client.query("SET LOCAL statement_timeout='4500ms'");
        await client.query('SELECT pg_catalog.pg_advisory_xact_lock($1,$2)', LOCK);
        await client.query('INSERT INTO public.original_device_dispatch_meta_v1(metadata_key,value) VALUES($1,$2) ON CONFLICT DO NOTHING', [KEY_ROW, keyPin]);
        const retained = await client.query('SELECT value FROM public.original_device_dispatch_meta_v1 WHERE metadata_key=$1', [KEY_ROW]);
        if (retained.rows.length !== 1 || retained.rows[0].value !== keyPin) fail('DEVICE_DURABLE_PRIVACY_KEY_CHANGED');
        const inserted = await client.query("INSERT INTO public.original_device_dispatch_v1(operation_key,consent_key,terms_hash,state) VALUES($1,$2,$3,'UNKNOWN') ON CONFLICT DO NOTHING RETURNING operation_key", [operationKey, consentKey, termsHash]);
        if (inserted.rows.length > 1 || (inserted.rows.length === 1 && inserted.rows[0].operation_key !== operationKey)) fail('DEVICE_DURABLE_RECORD_INVALID');
        duplicate = inserted.rows.length === 0;
        if (duplicate) {
          const existing = await client.query('SELECT operation_key FROM public.original_device_dispatch_v1 WHERE operation_key=$1 OR consent_key=$2', [operationKey, consentKey]);
          if (existing.rows.length !== 1 || existing.rows[0].operation_key !== operationKey) fail('DEVICE_DURABLE_RECORD_INVALID');
        }
        commitAttempted = true; await client.query('COMMIT');
      } catch (error) {
        failure = error;
        // Never infer rollback after an unacknowledged COMMIT. Discard that
        // owned connection; no economic method has been called yet.
        if (!commitAttempted) { try { await client.query('ROLLBACK'); } catch {} }
        throw error;
      } finally { client.release(failure); }
      if (duplicate) fail('DEVICE_DURABLE_ALREADY_ADMITTED');
      live(); effect[2](consent); // the 15-second consent budget survives SQL
      // Pass the immutable normalized consent and original signature only.
      // This invokes the SAME bridge, not a supplied executor or callback.
      const value = await bridge[method]({ consent, signature });
      await pool.query("UPDATE public.original_device_dispatch_v1 SET state='RETURNED' WHERE operation_key=$1 AND state='UNKNOWN'", [operationKey]);
      return value; // RETURNED is transport completion, never payment finality
    },
  });
  return journal;
}
export function assertOriginalDeviceDurableDispatchBindingsV1(journal, input) {
  if (arguments.length !== 2 || types.isProxy(journal)) fail('DEVICE_DURABLE_ORIGINAL_REQUIRED');
  exact(input, ['depositBridge', 'reservationBridge', 'executionBridge']);
  const row = owned.get(journal);
  if (!row || row.depositBridge !== input.depositBridge || row.reservationBridge !== input.reservationBridge
    || row.executionBridge !== input.executionBridge) fail('DEVICE_DURABLE_ORIGINAL_REQUIRED');
  row.live(); return row.actor;
}
export function runOriginalDeviceDurableDispatchV1(journal, bridge, method, input) {
  if (arguments.length !== 4 || types.isProxy(journal)) fail('DEVICE_DURABLE_ORIGINAL_REQUIRED');
  const row = owned.get(journal); if (!row) fail('DEVICE_DURABLE_ORIGINAL_REQUIRED');
  return row.run(bridge, method, input);
}
