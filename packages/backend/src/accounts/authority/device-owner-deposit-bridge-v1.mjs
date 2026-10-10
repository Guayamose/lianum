/** Private bootstrap, genuine account/actor references only. A new PROVE_D26
 * signature consents to ONE opening disclosed to the original fixed worker;
 * a separate FUND_D26 signature authorizes ONE original durable send. The
 * paired HTTP key is not claimed to be the hidden PC23 note owner key. D26
 * verifies that key/signature/commitment relation inside the genuine circuit.
 * Nothing here changes a diagnostic read into economic authority. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { randomBytes, createHash, createPublicKey, verify } from 'node:crypto';
import { assertOwnedNativeValueAccountAuthority, runDeviceOwnerDepositAuthorizationV1,
  readDeviceOwnerDepositStatusV1,installOriginalNativePrivateDepositV2 } from './native-value-account-authority-v2.mjs';
import { assertPairedOriginalAccountActorV2, assertPairedOriginalAccountActorAccountV2,
  pairedOriginalAccountActorDescriptorV2 } from '../../api/mobile/paired-original-account-actor-v2.mjs';
import { assertOwnedNativeValueWalletSystem } from '../../operations/deployments/native-value/native-value-wallet-binding-v2.mjs';
import { createNativeValueSystemStateReader } from '../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { normalizeOriginalAccountSignatureV2 } from '../../../../mobile-protocol/src/original-account-review-v2.mjs';
import { normalizeDeviceDepositConsentV1, validateDeviceDepositConsentFreshV1, deviceDepositConsentMessageV1,
  normalizeDeviceDepositStatementV1, normalizeDeviceDepositWitnessV1, deviceDepositWitnessBytesV1,
  DEVICE_DEPOSIT_CONSENT_V1 } from '../../../../mobile-protocol/src/device-deposit-consent-v1.mjs';
import * as Private from '../../../../mobile-protocol/src/device-native-private-deposit-v2.mjs';
import {createOriginalNativePrivateDepositProofClientV2,createOriginalNativePrivateDepositProofClientV3} from '../../../../proofs/src/jobs/native-device-private-deposit-client-v2.mjs';
const bridges = new WeakMap(), admissions = new WeakMap();
const sha = value => createHash('sha256').update(value).digest('hex');
const nonce = () => randomBytes(32).toString('hex');
function exact(value, names) {
  assert.ok(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype,
    'DEVICE_OWNER_BRIDGE_DATA');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort(), 'DEVICE_OWNER_BRIDGE_FIELDS');
  for (const name of names) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value'),
    'DEVICE_OWNER_BRIDGE_FIELDS');
}
/** Reject proxies before introspection, getters/functions and oversized nested
 * values before normalizing; this copies data, never constructor authorities. */
function data(raw,maximum=8192) {
  let nodes = 0, bytes = 0;
  function visit(value, depth) {
    assert.ok(++nodes <= 512 && depth <= 8 && !types.isProxy(value), 'DEVICE_OWNER_BRIDGE_DATA');
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') { bytes += value.length; assert.ok(bytes <= maximum, 'DEVICE_OWNER_BRIDGE_DATA'); return value; }
    assert.ok(value && typeof value === 'object', 'DEVICE_OWNER_BRIDGE_DATA');
    const array = Array.isArray(value);
    assert.equal(Object.getPrototypeOf(value), array ? Array.prototype : Object.prototype, 'DEVICE_OWNER_BRIDGE_DATA');
    const result = array ? [] : {};
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      assert.ok(typeof key === 'string' && (!array || /^(0|[1-9][0-9]*)$/.test(key)), 'DEVICE_OWNER_BRIDGE_DATA');
      const row = Object.getOwnPropertyDescriptor(value, key);
      assert.ok(row.enumerable && Object.hasOwn(row, 'value'), 'DEVICE_OWNER_BRIDGE_DATA');
      Object.defineProperty(result, key, { value: visit(row.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    if (array) assert.equal(result.length, value.length, 'DEVICE_OWNER_BRIDGE_DATA'); return result;
  }
  return visit(raw, 0);
}
const wipe = value => { if (value && typeof value === 'object') {
  for (const key of Object.keys(value)) { if (typeof value[key] === 'object') wipe(value[key]); value[key] = null; }
} };
const opaque = () => Object.freeze(Object.defineProperty(Object.create(null), 'toJSON', {
  value() { throw Error('DEVICE_OWNER_BRIDGE_NOT_SERIALIZABLE'); },
}));
export function createDeviceOwnerDepositBridgeV1(input){assert.equal(arguments.length,1);return createBridge(input,false);}
/** Fixed private producer installed before funding, never selected by HTTP data. */
export function createOriginalNativePrivateDepositBridgeV2(input){assert.equal(arguments.length,1);return createBridge(input,true);}
export function isOriginalNativePrivateDepositBridgeV2(bridge){assert.equal(arguments.length,1);const s=bridges.get(bridge);assert.ok(s);s.original();return s.privateD26===true;}
export async function createOriginalNativePrivateWorkerDepositBridgeV3(input){assert.equal(arguments.length,1);return createBridge(input,true,true);}
export function isOriginalNativePrivateWorkerDepositBridgeV3(bridge){assert.equal(arguments.length,1);const s=bridges.get(bridge);assert.ok(s);s.original();return s.privateWorker===true;}
async function createBridge(input,privateD26,privateWorker=false) {
  assert.ok(arguments.length===2||arguments.length===3, 'DEVICE_OWNER_BRIDGE_ARGUMENTS');
  exact(input, ['actor', 'account', 'owner', 'runtime', 'system', 'poolIndex']);
  const { actor, account, owner, runtime, system, poolIndex } = input;
  const original = () => {
    assertPairedOriginalAccountActorV2(actor); assertPairedOriginalAccountActorAccountV2(actor, account);
    assertOwnedNativeValueAccountAuthority(account, { runtime, system, poolIndex, owner });
    assertOwnedNativeValueWalletSystem(runtime, system);
  };
  original(); const descriptor = pairedOriginalAccountActorDescriptorV2(actor);
  const reader = await createNativeValueSystemStateReader({ runtime, system, poolIndex }); original();
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(descriptor.devicePublicKey.slice(2, 66), 'hex').toString('base64url'),
    y: Buffer.from(descriptor.devicePublicKey.slice(66), 'hex').toString('base64url') } });
  const pending = new Map(), issuedJobs = new Map(),prepared=new Map(); let closed = false, busy = false;
  const live = () => { assert.ok(!closed, 'DEVICE_OWNER_BRIDGE_CLOSED'); original(); };
  async function current() { live(); const view = await reader.read(); live(); await reader.assertCurrent(view); live(); return view; }
  function asset(view) {
    const rows = account.config.registry.filter(row => row.assetId === account.assetId);
    assert.equal(rows.length, 1, 'DEVICE_OWNER_BRIDGE_ORIGINAL_ASSET'); const selected = rows[0];
    assert.equal(selected.pool, view.poolAddress.slice(2), 'DEVICE_OWNER_BRIDGE_ORIGINAL_POOL');
    assert.equal(selected.scope, view.domain.scope, 'DEVICE_OWNER_BRIDGE_ORIGINAL_SCOPE');
    assert.equal(selected.policy, view.domain.policy, 'DEVICE_OWNER_BRIDGE_ORIGINAL_POLICY');
    assert.equal(selected.assetIdentity, view.domain.asset, 'DEVICE_OWNER_BRIDGE_ORIGINAL_ASSET'); return selected;
  }
  async function retainedRead(input) {
    // First signature only releases the original private descriptor. The second,
    // distinct domain below is mandatory BEFORE any worker/journal admission.
    const bound = await actor.deviceDepositSignedReadBindingV1(input); live(); return bound;
  }
  function issue(action, bound, selected, view, fields) {
    for (const [id, row] of pending) if (row.consumed || row.value.expiresAt <= Date.now()) pending.delete(id);
    assert.ok(pending.size < 4, 'DEVICE_OWNER_BRIDGE_CHALLENGE_CAPACITY');
    const normalize=privateD26?Private.normalizeNativePrivateDepositConsentV2:normalizeDeviceDepositConsentV1;
    let value = { version: privateD26?2:1, profile: privateD26?Private.DEVICE_NATIVE_PRIVATE_DEPOSIT_V2:DEVICE_DEPOSIT_CONSENT_V1,
      action, ...descriptor, challengeId: nonce(), nonce: nonce(), expiresAt: Date.now() + 15_000,
      binding: bound, poolTerms: { scope: selected.scope, policy: selected.policy, codeHash: selected.codeHash,
        assetIdentity: selected.assetIdentity, domainCommitment: view.domainCommitment },
      ...fields, observed: { blockNumber: view.head.number, blockHash: view.head.hash, timestamp: view.head.timestamp },
      openingDisclosure: action === 'PROVE_D26' ? (privateD26?'ENCRYPTED_D26_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT':'ONE_D26_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER') : null,
      ...(privateD26?{privateProof:action==='PROVE_D26'?fields.privateProof:null}:{}) };
    if(privateD26&&action==='PROVE_D26')value.privateProof={...value.privateProof,transcriptSHA256:sha(Private.nativePrivateDepositTranscriptBytesV2(value))};
    value=normalize(value);
    pending.set(value.challengeId, { value, consumed: false }); return structuredClone(value);
  }
  async function authorize(input, action, consume = true) {
    exact(input, action === 'PROVE_D26' ? ['consent', 'signature', 'witness'] : ['consent', 'signature']); live();
    const value = Private.validateDeviceDepositConsentEitherFreshV2(data(input.consent));
    assert.equal(value.version,privateD26?2:1,'DEVICE_OWNER_BRIDGE_PROFILE');
    const row = pending.get(value.challengeId);
    assert.ok(row && !row.consumed && value.action === action && JSON.stringify(value) === JSON.stringify(row.value),
      'DEVICE_OWNER_BRIDGE_ORIGINAL_CONSENT');
    const signature = normalizeOriginalAccountSignatureV2(input.signature);
    assert.equal(verify('sha256', Private.deviceDepositConsentEitherMessageV2(value), { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'hex')), true, 'DEVICE_OWNER_BRIDGE_DEVICE_SIGNATURE');
    assert.deepEqual(await actor.deviceDepositOriginalBinding(), value.binding, 'DEVICE_OWNER_BRIDGE_BINDING_CHANGED'); live();
    Private.validateDeviceDepositConsentEitherFreshV2(value);
    let witness = null;
    if (action === 'PROVE_D26') {
      if(privateD26){witness=data(input.witness,16384);exact(witness,['type','profile','relation','role','jobId','recipientPublicKey','senderPublicKey','authorization','publicInputsSHA256','salt','iv','tag','ciphertext']);
        const own=prepared.get(value.jobId);assert.ok(own&&!own.admitted&&JSON.stringify(own.consent)===JSON.stringify(value),'DEVICE_OWNER_BRIDGE_PRIVATE_RECIPIENT');
        for(const name of ['profile','relation','role','jobId','recipientPublicKey'])assert.equal(witness[name],value.privateProof.recipient[name]);
        assert.deepEqual(witness.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:value.jobId,consentSHA256:sha(Private.deviceDepositConsentEitherMessageV2(value)),witnessSHA256:value.witnessSHA256});
        assert.equal(witness.publicInputsSHA256,sha(JSON.stringify(Private.nativePrivateDepositPublicInputsV2(value))));assert.ok(typeof witness.ciphertext==='string'&&witness.ciphertext.length<=16384);
      }else witness = normalizeDeviceDepositWitnessV1(data(input.witness));
      if(!privateD26){const bytes = deviceDepositWitnessBytesV1(witness);
      try { assert.equal(sha(bytes), value.witnessSHA256, 'DEVICE_OWNER_BRIDGE_WITNESS_CHANGED'); }
      finally { bytes.fill(0); }}
    }
    if (!consume) return value; // read-only ORIGINAL pending consent validation
    row.consumed = true; const capability = opaque();
    const own=privateD26&&action==='PROVE_D26'?prepared.get(value.jobId):null;
    if(own){own.admitted=true;clearTimeout(own.timer);}
    admissions.set(capability, { bridge, account, action, consent: value, witness, consumed: false,
      ...(own?{privateD26:true,client:own.client,signature}:{}) }); return capability;
  }
  const bridge = Object.freeze({
    async challengeJob(input) {
      assert.equal(arguments.length, 1, 'DEVICE_OWNER_BRIDGE_ARGUMENTS');
      exact(input, ['access', 'signature', 'statement', 'rootId', 'noteRevision', 'witnessSHA256', 'jobId']);
      assert.ok(!busy, 'DEVICE_OWNER_BRIDGE_BUSY'); busy = true;
      try {
        live(); const bound = await retainedRead({ challenge: data(input.access), signature: input.signature });
        const statement = normalizeDeviceDepositStatementV1(data(input.statement));
        const view = await current(), selected = asset(view);
        assert.equal(bound.assetId, selected.assetId, 'DEVICE_OWNER_BRIDGE_ORIGINAL_ASSET');
        assert.equal(statement.scope, selected.scope, 'DEVICE_OWNER_BRIDGE_SCOPE');
        assert.equal(statement.policy, selected.policy, 'DEVICE_OWNER_BRIDGE_POLICY');
        assert.equal(statement.epoch, (BigInt(view.head.timestamp) / 600n).toString(), 'DEVICE_OWNER_BRIDGE_EPOCH');
        assert.ok(!view.ledger.commitments.includes('0x' + statement.output), 'DEVICE_OWNER_BRIDGE_OUTPUT_PRESENT');
        const context = { statement, rootId: input.rootId, noteRevision: input.noteRevision, witnessSHA256: input.witnessSHA256 };
        let jobId = input.jobId;
        if (jobId === null) { assert.ok(issuedJobs.size < 64, 'DEVICE_OWNER_BRIDGE_JOB_CAPACITY'); jobId = nonce(); issuedJobs.set(jobId, context); }
        else assert.deepEqual(issuedJobs.get(jobId), context, 'DEVICE_OWNER_BRIDGE_ORIGINAL_JOB_REQUIRED');
        if(!privateD26)return issue('PROVE_D26', bound, selected, view, { ...context, jobId, proofSHA256: null, publicInputsSHA256: null });
        assert.ok(!prepared.has(jobId)&&prepared.size<4,'DEVICE_OWNER_BRIDGE_PRIVATE_CAPACITY');
        const client=(privateWorker?createOriginalNativePrivateDepositProofClientV3:createOriginalNativePrivateDepositProofClientV2)(),own={client,consent:null,admitted:false,timer:null};prepared.set(jobId,own);
        try{const words=[...statement.scope.match(/.{8}/g).map(x=>String(parseInt(x,16))),...statement.policy.match(/.{8}/g).map(x=>String(parseInt(x,16))),statement.epoch,statement.amount,...statement.output.match(/.{8}/g).map(x=>String(parseInt(x,16)))];
          const recipient=await client.prepare(words);live();await reader.assertCurrent(view);live();
          const value=issue('PROVE_D26',bound,selected,view,{...context,jobId,proofSHA256:null,publicInputsSHA256:null,privateProof:{profile:Private.DEVICE_NATIVE_PRIVATE_PROOF_V2,recipient,transcriptSHA256:'1'.repeat(64)}});own.consent=value;
          own.timer=setTimeout(()=>{if(!own.admitted){prepared.delete(jobId);void client.close();}},Math.max(1,value.expiresAt-Date.now()));own.timer.unref();return value;
        }catch(error){prepared.delete(jobId);await client.close();throw error;}
      } finally { busy = false; }
    },
    async prove(input) {
      assert.equal(arguments.length, 1, 'DEVICE_OWNER_BRIDGE_ARGUMENTS');
      assert.ok(!busy, 'DEVICE_OWNER_BRIDGE_BUSY'); busy = true;
      let admission, completion, failure, failed = false;
      try { admission = await authorize(input, 'PROVE_D26');
        // The same original call is retained through authority/prover cleanup.
        // A PROVED event alone is not a bridge-idle or cleanup receipt.
        completion = Promise.withResolvers(); completion.promise.catch(() => {});
        bridges.get(bridge).proofCompletion = completion.promise;
        // The account owns the fixed job, latch and all resulting public proof
        // data. HTTP closure never retries/aborts this admitted original job.
        return await runDeviceOwnerDepositAuthorizationV1(account, bridge, admission);
      } catch (error) { failed = true; failure = error; throw error; }
      finally {
        if (admission) wipe(admissions.get(admission)?.witness);
        if(privateD26&&admission){const j=admissions.get(admission).consent.jobId,own=prepared.get(j);prepared.delete(j);if(own){clearTimeout(own.timer);await own.client.close();}}busy = false;
        // Resolve only AFTER the original authority Promise and its prover.close
        // have completed and this bridge released its unchanged busy guard.
        if (completion) { if (failed) completion.reject(failure); else completion.resolve(); }
      }
    },
    async challengeFunding(input) {
      assert.equal(arguments.length, 1, 'DEVICE_OWNER_BRIDGE_ARGUMENTS');
      exact(input, ['access', 'signature', 'jobId']); live(); assert.ok(!busy, 'DEVICE_OWNER_BRIDGE_BUSY'); busy = true;
      try {
        const bound = await retainedRead({ challenge: data(input.access), signature: input.signature });
        const job = await readDeviceOwnerDepositStatusV1(account, bridge, input.jobId); live();
        assert.equal(job.stage, 'PROVED', 'DEVICE_OWNER_BRIDGE_PROVED_REQUIRED');
        const view = await current(), selected = asset(view);
        assert.equal(job.statement.epoch, (BigInt(view.head.timestamp) / 600n).toString(), 'DEVICE_OWNER_BRIDGE_EPOCH');
        return issue('FUND_D26', bound, selected, view, job.consentFields);
      } finally { busy = false; }
    },
    async fund(input) {
      assert.equal(arguments.length, 1, 'DEVICE_OWNER_BRIDGE_ARGUMENTS');
      assert.ok(!busy, 'DEVICE_OWNER_BRIDGE_BUSY'); busy = true;
      const completion = Promise.withResolvers(); completion.promise.catch(() => {});
      bridges.get(bridge).fundingCompletion = completion.promise;
      let failed = false, failure;
      try { return await runDeviceOwnerDepositAuthorizationV1(account, bridge, await authorize(input, 'FUND_D26')); }
      catch (error) { failed = true; failure = error; throw error; }
      finally {
        busy = false;
        if (failed) completion.reject(failure); else completion.resolve();
      }
    },
    async challengeObservation(input) {
      assert.equal(arguments.length, 1, 'DEVICE_OWNER_BRIDGE_ARGUMENTS');
      exact(input, ['access', 'signature', 'jobId']); live(); assert.ok(!busy, 'DEVICE_OWNER_BRIDGE_BUSY'); busy = true;
      try {
        const bound = await retainedRead({ challenge: data(input.access), signature: input.signature });
        const job = await readDeviceOwnerDepositStatusV1(account, bridge, input.jobId); live();
        assert.ok(['FUNDING_UNKNOWN', 'CONFIRMED'].includes(job.stage), 'DEVICE_OWNER_BRIDGE_ORIGINAL_SEND_REQUIRED');
        const view = await current(); return issue('OBSERVE_D26', bound, asset(view), view, job.consentFields);
      } finally { busy = false; }
    },
    async observe(input) {
      assert.equal(arguments.length, 1, 'DEVICE_OWNER_BRIDGE_ARGUMENTS');
      assert.ok(!busy, 'DEVICE_OWNER_BRIDGE_BUSY'); busy = true;
      const completion = Promise.withResolvers(); completion.promise.catch(() => {});
      bridges.get(bridge).observationCompletion = completion.promise;
      let failed = false, failure;
      try { return await runDeviceOwnerDepositAuthorizationV1(account, bridge, await authorize(input, 'OBSERVE_D26')); }
      catch (error) { failed = true; failure = error; throw error; }
      finally {
        busy = false;
        if (failed) completion.reject(failure); else completion.resolve();
      }
    },
    close() { assert.equal(arguments.length, 0); closed = true; pending.clear();
      if(!privateD26)return {closed:true,originalWorkRetained:true};
      const stops=[...prepared.values()].filter(v=>!v.admitted).map(v=>{clearTimeout(v.timer);return v.client.close();});
      return Promise.all(stops).then(()=>({closed:true,originalWorkRetained:true})); },
  });
  bridges.set(bridge, { account, actor, original, descriptor,privateD26,privateWorker,
    async durableFunding(input) {
      assert.ok(!busy, 'DEVICE_OWNER_BRIDGE_BUSY'); busy = true;
      try { return await authorize(input, 'FUND_D26', false); } finally { busy = false; }
    },
  });if(privateD26)await installOriginalNativePrivateDepositV2(account,bridge); return bridge;
}
/** Validate a pending FUND signature before SQL consumes an admission. No
 * challenge, permission, journal mutation, proof or send is created here. */
export function assertDeviceOwnerDepositDurableRequestV1(bridge, input) {
  assert.equal(arguments.length, 2); deviceOwnerDepositBridgeActorV1(bridge);
  return bridges.get(bridge).durableFunding(input);
}
/** Private same-realm waiting seam, no endpoint, IDs, executor or authority
 * supplied by a caller. It waits for the retained original proof call only. */
export async function awaitDeviceOwnerDepositOriginalProofV1(bridge) {
  assert.equal(arguments.length, 1); assert.ok(!types.isProxy(bridge), 'DEVICE_OWNER_BRIDGE_ORIGINAL_REQUIRED');
  const value = bridges.get(bridge); assert.ok(value && value.proofCompletion, 'DEVICE_OWNER_BRIDGE_ORIGINAL_PROOF_REQUIRED');
  value.original(); const original = value.proofCompletion; await original; value.original();
}
/** Same admitted FUND call only. HTTP loss has no resend/cancel authority.
 * Rejection preserves the original authorization/send/observation cause. */
export async function awaitDeviceOwnerDepositOriginalFundingV1(bridge) {
  assert.equal(arguments.length, 1); assert.ok(!types.isProxy(bridge), 'DEVICE_OWNER_BRIDGE_ORIGINAL_REQUIRED');
  const value = bridges.get(bridge); assert.ok(value && value.fundingCompletion, 'DEVICE_OWNER_BRIDGE_ORIGINAL_FUNDING_REQUIRED');
  value.original(); const original = value.fundingCompletion; await original; value.original();
}
/** Private await of the SAME original observation. HTTP rejection publishes no
 * cause and grants no retry; the bridge retains the original Promise only. */
export async function awaitDeviceOwnerDepositOriginalObservationV1(bridge) {
  assert.equal(arguments.length, 1); assert.ok(!types.isProxy(bridge), 'DEVICE_OWNER_BRIDGE_ORIGINAL_REQUIRED');
  const value = bridges.get(bridge); assert.ok(value && value.observationCompletion, 'DEVICE_OWNER_BRIDGE_ORIGINAL_OBSERVATION_REQUIRED');
  value.original(); const original = value.observationCompletion; await original; value.original();
}
export function deviceOwnerDepositBridgeActorV1(bridge) {
  assert.equal(arguments.length, 1); assert.ok(!types.isProxy(bridge), 'DEVICE_OWNER_BRIDGE_ORIGINAL_REQUIRED');
  const value = bridges.get(bridge); assert.ok(value, 'DEVICE_OWNER_BRIDGE_ORIGINAL_REQUIRED'); value.original(); return value.actor;
}
export function assertDeviceOwnerDepositBridgeV1(bridge, account) {
  assert.equal(arguments.length, 2); assert.ok(!types.isProxy(bridge), 'DEVICE_OWNER_BRIDGE_ORIGINAL_REQUIRED');
  const value = bridges.get(bridge); assert.ok(value && value.account === account, 'DEVICE_OWNER_BRIDGE_ORIGINAL_REQUIRED');
  value.original(); return value.descriptor;
}
/** Consumes only a retained original signature admission; no fake/JSON/Proxy
 * can obtain the account's fixed worker or sender through this seam. */
export function consumeDeviceOwnerDepositAuthorizationV1(bridge, admission, account) {
  assert.equal(arguments.length, 3); assertDeviceOwnerDepositBridgeV1(bridge, account);
  assert.ok(!types.isProxy(admission), 'DEVICE_OWNER_BRIDGE_ORIGINAL_REQUIRED');
  const row = admissions.get(admission);
  assert.ok(row && row.bridge === bridge && row.account === account && !row.consumed, 'DEVICE_OWNER_BRIDGE_ORIGINAL_REQUIRED');
  Private.validateDeviceDepositConsentEitherFreshV2(row.consent); row.consumed = true;
  return { action: row.action, consent: row.consent, witness: row.witness,
    ...(row.privateD26?{privateD26:true,client:row.client,signature:row.signature}:{}) };
}
