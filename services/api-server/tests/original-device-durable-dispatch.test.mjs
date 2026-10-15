/** Real PostgreSQL + actual dispatcher, signature codecs and branded journal.
 * Bridge/actor ports are explicit HOST doubles: no native proof, funded note,
 * network settlement, physical custody or economic acceptance is claimed. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { startTestPostgres, poolFor } from './helpers/postgres-container.mjs';
import { startCommitReplyProxy } from './helpers/commit-reply-proxy.mjs';
import { createPlatformPool } from '../src/storage/database-pool.mjs';
import { migrateOriginalDeviceDispatchSchemaV1, assertOriginalDeviceDispatchSchemaV1 } from '../src/original/original-device-schema-v1.mjs';
import { deviceReservationFixtureV1 } from '../../../apps/mobile/tests/helpers/device-reservation-fixture-v1.mjs';
import { deviceReservationConsentMessageV1 } from '@lianum/mobile-protocol/device-reservation-consent-v1';
import {normalizeDeviceDepositConsentV1,deviceDepositConsentMessageV1} from '@lianum/mobile-protocol/device-deposit-consent-v1';
import {normalizeDeviceExitConsentV1,deviceExitConsentMessageV1} from '@lianum/mobile-protocol/device-exit-consent-v1';
import {normalizeNativePrivateDepositConsentV2,deviceDepositConsentEitherMessageV2,DEVICE_NATIVE_PRIVATE_DEPOSIT_V2} from '@lianum/mobile-protocol/device/native-deposit-v2';
import {normalizeNativePrivateExitConsentV2,deviceExitConsentEitherMessageV2,DEVICE_NATIVE_PRIVATE_EXIT_V2} from '@lianum/mobile-protocol/device/native-withdrawal-v2';
import { signDeviceMessage,signNativePrivateDeviceConsentV2 } from '../../../apps/mobile/src/custody/signing.mjs';
const base = new URL('../../../packages/backend/src/', import.meta.url);
const fixture = deviceReservationFixtureV1(), actor = Object.freeze({
  async deviceDepositOriginalBinding() { return fixture.consent.binding; },
});
const issued = new Map(); let effects = 0, preflights = 0;
const bridge = Object.freeze({ async reserve(input) {
  assert.equal(issued.has(input.consent.challengeId), true); effects++;
  issued.delete(input.consent.challengeId); return { ORIGINAL_HOST_ONLY: true, observed: false };
} });
// Original bridge/issued-challenge ports are explicit inert HOST references.
// PoP normalization/signatures and durable PostgreSQL are the actual modules.
const effectIssued=new Map(),effectCalls=[];let effectPreflights=0;
function issuedEffect(value,method,input){const retained=effectIssued.get(input.consent.challengeId);
 assert.ok(retained&&retained.bridge===value&&retained.method===method,'HOST_ORIGINAL_EFFECT_CONSENT');
 assert.deepEqual(input.consent,retained.consent,'HOST_ORIGINAL_EFFECT_CONSENT');return input.consent;}
async function inertEffect(value,method,input){issuedEffect(value,method,input);effectIssued.delete(input.consent.challengeId);
 effectCalls.push({bridge:value,method,jobId:input.consent.jobId});return{ORIGINAL_HOST_ONLY:true,method,observed:false};}
const deposit=Object.freeze({fund(input){return inertEffect(deposit,'fund',input);}}),execution=Object.freeze({withdraw(input){return inertEffect(execution,'withdraw',input);}});
const privateDeposit=Object.freeze({fund(input){return inertEffect(privateDeposit,'fund',input);}}),privateExecution=Object.freeze({withdraw(input){return inertEffect(privateExecution,'withdraw',input);}});
const effectBrand=(value,legacy,privateOriginal)=>branded(value,value===privateOriginal?privateOriginal:legacy);
const branded = (value, expected) => { assert.equal(value, expected, 'HOST_ORIGINAL_REFERENCE'); return actor; };
mock.module(new URL('operations/recovery/native-original-source-lifecycle-v1.mjs', base), { exports: {
  assertPairedOriginalAccountActorV2(value) { assert.equal(value, actor); },
  pairedOriginalAccountActorDescriptorV2(value) { assert.equal(value, actor); return fixture.descriptor; },
} });
mock.module(new URL('accounts/authority/native-value-account-authority-v2.mjs', base), { exports: {
  deviceOwnerDepositBridgeActorV1(value) { return effectBrand(value,deposit,privateDeposit); },
  isOriginalNativePrivateDepositBridgeV2(value){effectBrand(value,deposit,privateDeposit);return value===privateDeposit;},
  assertDeviceOwnerDepositDurableRequestV1(value,input){effectBrand(value,deposit,privateDeposit);effectPreflights++;return issuedEffect(value,'fund',input);},

  deviceOwnerReservationBridgeActorV1(value) { return branded(value, bridge); },
  async assertDeviceOwnerReservationDurableRequestV1(value, input) {
    branded(value, bridge); preflights++;
    assert.deepEqual(issued.get(input.consent.challengeId), input.consent, 'HOST_ISSUED_CONSENT_REQUIRED');
    return input.consent;
  },

  deviceOwnerExecutionBridgeActorV1(value) { return effectBrand(value,execution,privateExecution); },
  isOriginalNativePrivateExecutionBridgeV2(value){effectBrand(value,execution,privateExecution);return value===privateExecution;},
  assertDeviceOwnerExecutionTransportBindingsV1(value,reservation){effectBrand(value,execution,privateExecution);branded(reservation,bridge);},
  assertDeviceOwnerExecutionDurableRequestV1(value,method,input){effectBrand(value,execution,privateExecution);effectPreflights++;assert.equal(method,'withdraw');return issuedEffect(value,method,input);},
} });
const { createOriginalDeviceDurableDispatchV1, runOriginalDeviceDurableDispatchV1, assertOriginalDeviceDurableDispatchBindingsV1, assertOriginalDeviceDurableRecoveryInfrastructureV1 }
  = await import(new URL('api/mobile/original-device-durable-dispatch-v1.mjs', base));
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
  // Missing original key metadata must fail before a one-use recovery issuer
  // is opened. This preflight creates no row and grants no economic authority.
  await assert.rejects(assertOriginalDeviceDurableRecoveryInfrastructureV1({pool,privacyKey:key}),{code:'DEVICE_DURABLE_RECOVERY_JOURNAL_REQUIRED'});
  assert.equal((await pool.query('SELECT count(*)::integer AS n FROM public.original_device_dispatch_meta_v1')).rows[0].n,1); // schema marker only
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
  const beforeRecovery=JSON.stringify(rows);
  await assert.rejects(assertOriginalDeviceDurableRecoveryInfrastructureV1({pool,privacyKey:'52'.repeat(32)}),{code:'DEVICE_DURABLE_RECOVERY_JOURNAL_REQUIRED'});
  assert.deepEqual(await assertOriginalDeviceDurableRecoveryInfrastructureV1({pool,privacyKey:key}),{originalInfrastructureVerified:true,economicAuthorityRestored:false});
  assert.equal(JSON.stringify((await pool.query('SELECT * FROM public.original_device_dispatch_v1 ORDER BY state')).rows),beforeRecovery);
  assert.equal(effects, 1);
  journal.close(); await assert.rejects(runOriginalDeviceDurableDispatchV1(journal, bridge, 'reserve', request()), { code: 'DEVICE_DURABLE_CLOSED' });
});


/** Real PG admission and actual V1/V2 PoP frames. The issued bridge references
 * above are explicit in-memory ports; no proof, funded note or send is faked. */
test('private Native V2 FUND and W39 preserve original SQL fencing and reject cross-version before admission', {timeout:60000}, async t=>{
 const pg=await startTestPostgres();t.after(()=>pg.close());const pool=poolFor(pg.connectionString);t.after(()=>pool.end());
 await migrateOriginalDeviceDispatchSchemaV1(pool);await assertOriginalDeviceDispatchSchemaV1(pool);
 const originals={depositBridge:privateDeposit,reservationBridge:bridge,executionBridge:privateExecution};
 const privateJournal=await createOriginalDeviceDurableDispatchV1({...originals,pool,privacyKey:key});t.after(()=>privateJournal.close());
 const legacyJournal=await createOriginalDeviceDurableDispatchV1({...bridges,pool,privacyKey:key});t.after(()=>legacyJournal.close());
 const hex=n=>n.toString(16).padStart(64,'0'),startCalls=effectCalls.length,startPreflights=effectPreflights;
 const next=()=>hex(++nextId);
 const rows=async()=> (await pool.query('SELECT operation_key,consent_key,terms_hash,state FROM public.original_device_dispatch_v1 ORDER BY operation_key')).rows;
 function frame(method,version,jobId=next()){
  const common={version,profile:method==='fund'?'LIANUM_DEVICE_ORIGINAL_D26_V1':'LIANUM_DEVICE_ORIGINAL_W39_V1',action:method==='fund'?'FUND_D26':'WITHDRAW_W39',...fixture.descriptor,
   challengeId:next(),nonce:next(),expiresAt:Date.now()+15000,binding:structuredClone(fixture.consent.binding),poolTerms:structuredClone(fixture.consent.poolTerms),rootId:hex(160),noteRevision:1,jobId,
   witnessSHA256:hex(161),proofSHA256:hex(162),publicInputsSHA256:hex(163),observed:{blockNumber:'1',blockHash:hex(164),timestamp:'6000'},openingDisclosure:null};
  if(method==='fund')common.statement={scope:common.poolTerms.scope,policy:common.poolTerms.policy,epoch:'10',amount:'500',output:hex(165)};
  else Object.assign(common,{parentJobId:hex(166),nativeBindingSHA256:hex(167),quoteId:hex(168),noteRole:'change',statement:{scope:common.poolTerms.scope,policy:common.poolTerms.policy,epoch:'10',root:hex(169),nullifier:hex(170),amount:'400',recipient:'e1'.repeat(20),commitment:hex(171)}});
  let consent,message;
  if(version===2){common.profile=method==='fund'?DEVICE_NATIVE_PRIVATE_DEPOSIT_V2:DEVICE_NATIVE_PRIVATE_EXIT_V2;common.privateProof=null;
   consent=(method==='fund'?normalizeNativePrivateDepositConsentV2:normalizeNativePrivateExitConsentV2)(common);
   message=(method==='fund'?deviceDepositConsentEitherMessageV2:deviceExitConsentEitherMessageV2)(consent);
  }else{consent=(method==='fund'?normalizeDeviceDepositConsentV1:normalizeDeviceExitConsentV1)(common);message=(method==='fund'?deviceDepositConsentMessageV1:deviceExitConsentMessageV1)(consent);}
  try{return{consent,signature:version===2?signNativePrivateDeviceConsentV2(deviceKey,consent):signDeviceMessage(deviceKey,message)};}finally{message.fill(0);}
 }
 function issuedRequest(method,version,selected,jobId){const input=frame(method,version,jobId);effectIssued.set(input.consent.challengeId,{bridge:selected,method,consent:structuredClone(input.consent)});return input;}
 // Original bridge markers choose the version; signed DTOs cannot select it.
 for(const[method,privateBridge,legacyBridge]of[['fund',privateDeposit,deposit],['withdraw',privateExecution,execution]]){
  await assert.rejects(runOriginalDeviceDurableDispatchV1(privateJournal,privateBridge,method,frame(method,1)));
  await assert.rejects(runOriginalDeviceDurableDispatchV1(legacyJournal,legacyBridge,method,frame(method,2)));
  const wrong=frame(method,2);wrong.signature='01'.repeat(64);
  await assert.rejects(runOriginalDeviceDurableDispatchV1(privateJournal,privateBridge,method,wrong),{code:'DEVICE_DURABLE_SIGNATURE'});
 }
 assert.equal(effectPreflights,startPreflights);assert.equal(effectCalls.length,startCalls);assert.deepEqual(await rows(),[]);
 for(const[method,selected]of[['fund',privateDeposit],['withdraw',privateExecution]])
  await assert.rejects(runOriginalDeviceDurableDispatchV1(privateJournal,selected,method,frame(method,2)),/HOST_ORIGINAL_EFFECT_CONSENT/);
 assert.equal(effectCalls.length,startCalls);assert.deepEqual(await rows(),[]);
 const accepted=[];
 for(const[method,selected]of[['fund',privateDeposit],['withdraw',privateExecution]]){
  const input=issuedRequest(method,2,selected);accepted.push(input);
  assert.deepEqual(await runOriginalDeviceDurableDispatchV1(privateJournal,selected,method,input),{ORIGINAL_HOST_ONLY:true,method,observed:false});
  await assert.rejects(runOriginalDeviceDurableDispatchV1(privateJournal,selected,method,issuedRequest(method,2,selected,input.consent.jobId)),{code:'DEVICE_DURABLE_ALREADY_ADMITTED'});
 }
 assert.equal(effectCalls.length,startCalls+2);assert.deepEqual((await rows()).map(r=>r.state),['RETURNED','RETURNED']);
 // Both private effect domains keep UNKNOWN when the real COMMIT succeeds but
 // its original transport reply is missing. Neither inert economic port runs.
 for(const[method,selected]of[['fund',privateDeposit],['withdraw',privateExecution]]){
  const proxy=await startCommitReplyProxy(pg.connectionString),uncertain=createPlatformPool(proxy.connectionString);let uncertainJournal;
  try{uncertainJournal=await createOriginalDeviceDurableDispatchV1({...originals,pool:uncertain,privacyKey:key});const input=issuedRequest(method,2,selected);accepted.push(input);
   await assert.rejects(runOriginalDeviceDurableDispatchV1(uncertainJournal,selected,method,input),/Query read timeout/);
   assert.equal(proxy.commitForwarded,true);assert.equal(uncertain.totalCount,0);assert.equal(effectCalls.length,startCalls+2);
   await assert.rejects(runOriginalDeviceDurableDispatchV1(privateJournal,selected,method,issuedRequest(method,2,selected,input.consent.jobId)),{code:'DEVICE_DURABLE_ALREADY_ADMITTED'});
  }finally{uncertainJournal?.close();await uncertain.end();await proxy.close();}
 }
 const retained=await rows();assert.equal(retained.length,4);assert.deepEqual(retained.map(r=>r.state).sort(),['RETURNED','RETURNED','UNKNOWN','UNKNOWN']);
 for(const r of retained){assert.deepEqual(Object.keys(r).sort(),['consent_key','operation_key','state','terms_hash']);for(const k of ['operation_key','consent_key','terms_hash'])assert.match(r[k],/^[0-9a-f]{64}$/);}
 const saved=JSON.stringify(retained);
 for(const value of [fixture.descriptor.origin,fixture.descriptor.devicePublicKey,fixture.descriptor.pairingId,fixture.consent.binding.accountIdentitySHA256,
  ...accepted.flatMap(input=>[input.consent.jobId,input.consent.rootId,input.consent.statement.output??input.consent.statement.commitment,input.signature])])assert.equal(saved.includes(value),false);
 await assert.rejects(createOriginalDeviceDurableDispatchV1({...originals,pool,privacyKey:'52'.repeat(32)}),{code:'DEVICE_DURABLE_PRIVACY_KEY_CHANGED'});
 assert.deepEqual(await assertOriginalDeviceDurableRecoveryInfrastructureV1({pool,privacyKey:key}),{originalInfrastructureVerified:true,economicAuthorityRestored:false});
 assert.equal(JSON.stringify(await rows()),saved);await assertOriginalDeviceDispatchSchemaV1(pool);assert.equal(effectCalls.length,startCalls+2);
});
