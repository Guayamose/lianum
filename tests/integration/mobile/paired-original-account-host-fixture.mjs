/** HOST SUBSTRATE ONLY: original account/approval/session/keeper/journal remain
 * unmocked. Native ownership, RPC, owner IPC and proof-process bytes below are
 * explicit synthetic doubles. No node, prover, funded balance or economic
 * acceptance exists. A synthetic lost send leaves the actual journal UNKNOWN. */
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { derivePrivateAssetIdentity } from '@lianum/engine/notes/private-asset-runtime';
import { sha, genericAccountIdentity } from '@lianum/engine/accounts/journal';
import { encodeWalletPoolInputs } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
const h = value => createHash('sha256').update('MOBILE HOST SYNTHETIC ' + value).digest('hex');
const worlds = new WeakMap(), systems = new WeakMap(), owners = new WeakMap(), observers = new WeakMap(), assets = new WeakMap();
const owned = runtime => { const world = worlds.get(runtime); assert.ok(world, 'SYNTHETIC_RUNTIME_ORIGINAL'); return world; };
// Transitive recovery APIs must link, but this substrate never executes a
// native process or recovery constructor. Read only names, then deny every
// function except the explicit synthetic ports below.
async function deniedNativeFunctions(path, code) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const names=[...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(/g)].map(([,name])=>name);
  // Factory-owned public APIs use destructured exports; deny those too without
  // loading a transitive backend owner before all lower HOST ports are installed.
  for(const [,list] of source.matchAll(/export\s+const\s*\{([^}]+)\}/g))
    for(const name of list.split(',').map(value=>value.trim()).filter(Boolean))names.push(name);
  return Object.fromEntries(names.map(name=>[name,()=>{throw Error(code);}]));
}
mock.module('../../../packages/backend/src/chains/evm/runtime/local-evm-ownership.mjs', { exports: {
  assertLocalEvm: async runtime => owned(runtime),
  assertLocalEvmDeploymentProfile() { throw Error('HOST_DEPLOYMENT_FORBIDDEN'); },
} });
mock.module('../../../packages/backend/src/custody/processes/native-value-owner-process-v2.mjs', { exports: {
  ...await deniedNativeFunctions('../../../packages/backend/src/custody/processes/native-value-owner-process-v2.mjs', 'HOST_NATIVE_OWNER_PROCESS_FORBIDDEN'),
  createNativeValueOwnerProcess() { throw Error('HOST_NATIVE_OWNER_PROCESS_FORBIDDEN'); },
  nativeValueOwnerEconomicIdentityV1(owner, expected) {
    const world = owners.get(owner); assert.ok(world && !world.closed, 'SYNTHETIC_OWNER_ORIGINAL');
    for (const key of Object.keys(expected)) assert.equal(world[key], expected[key]);
    return { identitySHA256: sha(world.identity), processIdentitySHA256: h('owner process'), generation: world.generation };
  },
  assertOwnedNativeValueOwnerProcess(owner, expected) {
    const world = owners.get(owner); assert.ok(world && !world.closed, 'SYNTHETIC_OWNER_ORIGINAL');
    if (expected) for (const key of Object.keys(expected)) assert.equal(world[key], expected[key]);
  },
} });
mock.module('../../../packages/backend/src/custody/observers/native-value-owner-observer-v2.mjs', { exports: {
  async createNativeValueOwnerObserver({ runtime, system, poolIndex }) {
    const world = owned(runtime); assert.equal(world.system, system); assert.equal(poolIndex, 0);
    const observer = Object.freeze({ identity: world.identity,
      async readSnapshot() { return { identitySHA256: sha(world.identity), synthetic: true }; },
      async readTransaction() {
        world.observations++; world.observationStarted?.();
        if (world.observationGate) await world.observationGate;
        return null;
      },
    }); observers.set(observer, world); return observer;
  },
  assertOwnedNativeValueOwnerObserver(observer, { runtime, system, poolIndex }) {
    const world = observers.get(observer); assert.equal(world, owned(runtime)); assert.equal(world.system, system); assert.equal(poolIndex, 0);
  },
} });
mock.module('../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs', { exports: {
  ...Object.fromEntries(['assertNativeValueCurrentView', 'decodeFlatWords', 'decodeFlatPoolObservation', 'decodeFlatFieldTree',
    'decodeFlatHubState', 'decodeFlatOverflow', 'decodeFlatEvidenceHistory'].map(name => [name, () => { throw Error('HOST_NATIVE_BALANCE_OBSERVATION_FORBIDDEN'); }])),
  async createNativeValueSystemStateReader() { return Object.freeze({
    read() { throw Error('HOST_NATIVE_BALANCE_OBSERVATION_FORBIDDEN'); },
    assertCurrent() { throw Error('HOST_NATIVE_BALANCE_OBSERVATION_FORBIDDEN'); },
  }); },
} });
mock.module('../../../packages/backend/src/chains/shared/contracts/owned-pool-asset.mjs', { exports: {
  createOwnedPoolAsset() { throw Error('HOST_NATIVE_ASSET_CREATION_FORBIDDEN'); },
  createNativePoolAsset() { throw Error('HOST_NATIVE_ASSET_CREATION_FORBIDDEN'); },
  assertOwnedPoolAsset(runtime, asset) { assert.equal(assets.get(asset), owned(runtime)); },
} });
mock.module('../../../packages/proofs/src/execution/proof-process.mjs', { exports: {
  ...await deniedNativeFunctions('../../../packages/proofs/src/execution/proof-process.mjs', 'HOST_NATIVE_NOTE_PROOF_PROCESS_FORBIDDEN'),
  createNativeEconomicNoteProofProcessV1() { throw Error('HOST_NATIVE_NOTE_PROOF_PROCESS_FORBIDDEN'); },
  createProofProcess() { return Object.freeze({
    async prove(_mode, _inputs, publicInputs) { return { proof: 'ab'.repeat(32), publicInputs: [...publicInputs], metrics: { acceptedResult: true, SYNTHETIC_HOST_ONLY: true } }; },
    async close() {}, async abort() {},
  }); },
} });
// Only the recovery issuer/source ports are inert here. Their WeakMaps are
// test-owned, not economic authority; original account/session/actor and AEAD
// journals below are exercised. The real issuer/new-process test is separate.
const actualSystem = await deniedNativeFunctions('../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs','HOST_NATIVE_SYSTEM_FORBIDDEN');
mock.module('../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs', { exports: { ...actualSystem,
  assertOwnedNativeValueWalletSystem(runtime, system) { assert.equal(systems.get(system), owned(runtime), 'SYNTHETIC_SYSTEM_ORIGINAL'); },
  nativeValueOriginalRecoverySourceV1(runtime, system) {
    assert.equal(systems.get(system), owned(runtime), 'SYNTHETIC_SYSTEM_ORIGINAL'); return h('economic source');
  },
} });
const actualRecovery = await deniedNativeFunctions('../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs','HOST_NATIVE_RECOVERY_FORBIDDEN');
const hostAuthorities = new WeakMap(), hostTokens = new WeakMap();
const hostIdentity = Object.freeze({ profile: 'NATIVE_VALUE_ECONOMIC_RECOVERY_V1', directory: '/HOST_ONLY',
  runId: '00000000-0000-4000-8000-000000000001', sourceSHA256: h('economic source'), deadlineMs: 1234567890000 });
mock.module('../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs', { exports: { ...actualRecovery,
  assertNativeEconomicRecoveryCaptureV1(authority) { assert.equal(hostAuthorities.get(authority), hostIdentity, 'HOST_ORIGINAL_ISSUER_REQUIRED'); return hostIdentity; },
  nativeEconomicRecoverySectionIdentityV1(token, section) { const row = hostTokens.get(token); assert.equal(row?.section, section, 'HOST_ORIGINAL_SECTION_REQUIRED'); return hostIdentity; },
  consumeNativeEconomicRecoverySectionV1(token, section) { const row = hostTokens.get(token); assert.equal(row?.section, section, 'HOST_ORIGINAL_SECTION_REQUIRED');
    assert.equal(row.consumed, false, 'HOST_SECTION_CONSUMED'); assert.ok(row.record); row.consumed = true; return structuredClone(row.record); },
} });
export function hostEconomicRecovery() {
  const authority = Object.freeze(Object.create(null)); hostAuthorities.set(authority, hostIdentity);
  return { authority, token(section) { const token = Object.freeze(Object.create(null)); hostTokens.set(token, { section, consumed: false, record: null }); return token; },
    retain(token, record) { const row = hostTokens.get(token); assert.ok(row && row.record === null); row.record = structuredClone(record); } };
}
const { createNativeValueAccountAuthority } = await import('../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs');
const { createNativeValueManualGraphAccountSession } = await import('@lianum/backend/operations/recovery/native-original-source-lifecycle-v1');
export const createActorModule = () => import('../../../packages/backend/src/operations/recovery/native-original-source-lifecycle-v1.mjs');
export function device() {
  const keys = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }), jwk = keys.publicKey.export({ format: 'jwk' });
  const publicKey = '04' + Buffer.from(jwk.x, 'base64url').toString('hex') + Buffer.from(jwk.y, 'base64url').toString('hex');
  return { publicKey, sign(message) {
    const bytes = sign('sha256', message, { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
    const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const s = BigInt('0x' + bytes.subarray(32).toString('hex'));
    if (s > order / 2n) Buffer.from((order - s).toString(16).padStart(64, '0'), 'hex').copy(bytes, 32);
    return bytes.toString('hex');
  } };
}
export async function fixture(t, { execute = true, kind = 'TOP_UP', role = kind === 'EXIT' ? 'source' : null, nativeExecution = null } = {}) {
  assert.ok(kind === 'TOP_UP' || kind === 'EXIT');
  assert.ok(!execute || kind === 'TOP_UP', 'HOST_EXIT_EXECUTION_FORBIDDEN');
  const ownerKind = kind === 'TOP_UP' ? 'deposit' : 'withdraw_' + role;
  const scratch = await mkdtemp(join(tmpdir(), 'lianum-mobile-original-host-'));
  const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(key => [key, h(key)]));
  domain.ledgerNamespace = domain.hubDomain;
  domain.asset = derivePrivateAssetIdentity(31337, '0x' + '0'.repeat(40), '0x' + '0'.repeat(64)).slice(2);
  const world = { poolIndex: 0, identity: { pool: '12'.repeat(20), domain, domainCommitment: '1'.padStart(64, '0') },
    closed: false, generation: 1, scopeChanged: false, unavailable: false, sends: 0, observations: 0, proofs: 0, recoveryClosers: [] };
  world.runtime = { metadata: { scratchDirectory: scratch, chainId: '31337', evmGenesis: '0x' + h('genesis') },
    transactions: [], time: async () => 6000n,
    async send(_label, request) { world.sends++; const transactionHash = '0x' + h('lost original transaction');
      this.transactions.push({ request: structuredClone(request), transactionHash, senderNonce: '0' });
      throw Object.assign(Error('SYNTHETIC_LOST_SEND_ACK'), { transactionRecord: { transactionHash } }); },
    async receipt() { return null; }, async transaction() { return null; },
  };
  const assetCapability = Object.freeze({}); assets.set(assetCapability, world);
  world.system = { sender: '0x' + '34'.repeat(20), claimsEnabled: false, bootstrap: { host: 'SYNTHETIC_ONLY' },
    pools: [{ address: '0x' + world.identity.pool, asset: '0x' + '0'.repeat(40), codeHash: '0x' + h('pool code'),
      assetCapability, artifact: {}, domain }] };
  let review = null;
  const summary = () => ({ closed: world.closed, profile: 'FIXED_LOCAL_FLAT_OWNER_CUSTODY_V1',
    manualNoteProfile: 'NATIVE_VALUE_OWNER_NOTE_CONSENT_V1', identitySHA256: sha(world.identity),
    keyScopeSHA256: world.scopeChanged ? h('wrong key scope') : h('key scope'),
    processIdentitySHA256: h('owner process'), processGeneration: world.generation, operations: { [ownerKind]: 'PREPARED' } });
  world.owner = { publicView: { summary: async () => {
    world.summaryStarted?.(); if (world.summaryGate) await world.summaryGate; return summary();
  } }, ownerView: {
    nativeNotePreparations: async () => ({ version: 1, records: review ? [{ review: structuredClone(review), ownerState: 'PREPARED' }] : [] }),
    async preparationTerms({ kind: selectedKind }) { return { identitySHA256: sha(world.identity), kind: selectedKind,
      observed: { blockHash: h('head'), timestamp: '6000' }, eligible: false,
      note: { role: role ?? 'source', amount: '100', recipient: '56'.repeat(20), status: kind === 'TOP_UP' ? 'UNISSUED' : 'LOCKED', observedUnspent: kind === 'EXIT' },
      prepared: { stage: 'PREPARED', epoch: '10', amount: '100', recipient: '56'.repeat(20), submissionBound: false } }; },
  }, ownerProof: { async deposit() { world.proofs++; const statement = { scope: domain.scope, policy: domain.policy, epoch: '10', amount: '100', output: h('synthetic commitment') };
    return { inputs: { SYNTHETIC_HOST_ONLY: true }, statement, publicInputs: encodeWalletPoolInputs('deposit_balance', statement) }; } },
  owner: { async bindSubmission() { return { dispatchAllowed: true }; } } };
  worlds.set(world.runtime, world); systems.set(world.system, world); owners.set(world.owner, world);
  const account = await createNativeValueAccountAuthority({ runtime: world.runtime, system: world.system, poolIndex: 0,
    owner: world.owner, nativeExecution, accountId: 'original_mobile_host_account', journalId: 'original_mobile_host_journal' });
  const body = { requestId: 'original_mobile_host_request', kind, ownerOperationRef: h('original request'), assetId: account.assetId };
  if (kind === 'TOP_UP') await account.ownerActions.registerTopUp(body.ownerOperationRef);
  else await account.ownerActions.registerExit(body.ownerOperationRef, role);
  review = { version: 1, profile: 'NATIVE_VALUE_OWNER_NOTE_REVIEW_V1', processIdentitySHA256: h('owner process'),
    processGeneration: 1, keyScopeSHA256: h('key scope'), originalAccountLifetime: account.config.lifetime,
    generationId: sha(genericAccountIdentity(account.config)), request: body, kind, ownerKind,
    ownerIdentitySHA256: sha(world.identity), accountIdentitySHA256: sha(genericAccountIdentity(account.config)), asset: account.registry[0],
    epoch: '10', amount: '100', recipient: '56'.repeat(20), role, noteStatus: kind === 'TOP_UP' ? null : 'AVAILABLE',
    observed: { blockHash: h('head'), timestamp: '6000' }, effect: kind === 'TOP_UP'
      ? 'CREATE_ORIGINAL_PRIVATE_DEPOSIT_PREPARATION' : 'LOCK_ORIGINAL_NOTE_FOR_FULL_WITHDRAWAL_PREPARATION',
    fundingApproval: 'EXISTING_EXACT_TOKEN_ALLOWANCE_REQUIRED_WHEN_APPLICABLE',
    registration: 'ORIGINAL_NATIVE_VALUE_AUTHORITY_OWNER_LOCAL_NOTE_PREPARATION', spending: 'SEPARATE_ACCOUNT_PREPARE_AND_EXECUTE_REVIEW_REQUIRED' };
  const approval = await account.ownerActions.registerNativeManualNote(review);
  const joined = await createNativeValueManualGraphAccountSession({ runtime: world.runtime, system: world.system, poolIndex: 0,
    account, journal: { path: join(scratch, 'original-keeper.vault'), password: 'HOST_ONLY_NOT_SECRET' } });
  joined.bindManualNote(approval);
  joined.session.prepare(body); await joined.session.idle();
  if (execute) { joined.session.execute(body.requestId); await joined.session.idle();
    const status = await account.privateStatus(); assert.equal(status.operations[0].stage, 'UNKNOWN');
    assert.equal(status.operations[0].submission.dispatchLatched, true); assert.equal(world.sends, 1); }
  t.after(async () => { for (const close of world.recoveryClosers.toReversed()) await close(); await joined.session.close(); await account.close(); world.closed = true; await rm(scratch, { recursive: true, force: true }); });
  return { world, account, approval, session: joined.session, body, review, device: device() };
}
