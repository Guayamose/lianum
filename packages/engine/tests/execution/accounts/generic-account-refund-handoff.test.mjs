/** HOST STORAGE TESTS ONLY. The 458 coherent field encodings are deliberately
 * synthetic dummy bytes, NOT a valid proof. No cryptographic proof acceptance,
 * prover/compiler, owner child, native runtime, chain, or transaction is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vault } from '../../../src/crypto/vault.mjs';
import { canonical } from '../../../src/crypto/privacy.mjs';
import { derivePrivateWalletAssetIdentity } from '../../../src/wallet/notes/private-wallet-asset-binding.mjs';
import { derivePrivateAssetPoolScope } from '../../../src/notes/private-asset-runtime.mjs';
import { PrivateNoteTree } from '../../../src/notes/private-note-tree.mjs';
import { loadProofProfile, wipePrivate } from '@lianum/proofs/execution/proof-worker';
import { FUNDED_GRAPH_PROFILE, FUNDED_DOMAINS, fundedHash, fundedAuthorizationWords }
  from '../../../src/execution/graph/funded-graph.mjs';
import { openGenericRefundHandoff, deriveGenericRefundBinding, HANDOFF_SCHEMA, HANDOFF_CLASSIFICATION }
  from '../../../../backend/src/execution/accounts/generic-account-refund-handoff.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const h = text => createHash('sha256').update('SYNTHETIC-NON-PROOF-STORAGE-FIXTURE:' + text).digest('hex');
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const clone = value => structuredClone(value);
const ownerVK = loadProofProfile('authorization').vkFields;

function fixture(label = 'one') {
  const identity = { walletId: 'synthetic-handoff-test-wallet', chainId: '31337', pool: '11'.repeat(20),
    asset: { kind: 'NATIVE', address: '0'.repeat(40), codeHash: '0'.repeat(64), identity: '' },
    backing: 'SYNTHETIC_LOCAL_POOL_ASSET', poolAbiSHA256: h('abi') };
  for (const key of ['evmGenesis', 'bitcoinGenesis', 'solanaGenesis', 'poolCodeHash', 'policy',
    'deploymentDomain', 'verifierSetHash', 'issuerLifetime', 'hubDomain', 'registryCommitment']) identity[key] = h(key);
  identity.asset.identity = derivePrivateWalletAssetIdentity(identity.chainId, identity.asset.address, identity.asset.codeHash);
  identity.scope = derivePrivateAssetPoolScope(identity.chainId, '0x' + identity.pool,
    '0x' + identity.deploymentDomain, '0x' + identity.asset.identity).slice(2);
  const statement = { profile: FUNDED_GRAPH_PROFILE.id, scope: identity.scope, policy: identity.policy,
    asset: identity.asset.identity, fundingNotBefore: '100', fundingValidUntil: '200', settleBefore: '300' };
  for (const key of ['operationId', 'inputCommitment', 'inputNullifier', 'reservationIntent', 'graphCommitment',
    'treeRoot', 'reserveNullifier', 'changeCommitment', 'recoveryCommitment']) statement[key] = h(label + ':' + key);
  statement.reserveCommitment = fundedHash(FUNDED_DOMAINS.reserve, [Buffer.from(FUNDED_GRAPH_PROFILE.id),
    ...['scope', 'policy', 'asset', 'reservationIntent', 'graphCommitment'].map(key => Buffer.from(statement[key], 'hex'))]);
  statement.outputs = Array.from({ length: 4 }, (_, i) => h(label + ':output:' + i));
  const proofFields = Array.from({ length: 458 }, (_, i) => String(i + 1));
  const authorization = { proof: Buffer.concat(proofFields.map(field => Buffer.from(BigInt(field).toString(16).padStart(64, '0'), 'hex'))),
    publicInputs: fundedAuthorizationWords(statement), proofFields, vkFields: [...ownerVK],
    metrics: { fixture: 'SYNTHETIC_DUMMY_BYTES_NOT_PROOF_ACCEPTANCE' } };
  const ownerOperationRef = h('ref:' + label);
  const binding = deriveGenericRefundBinding({ identity, ownerOperationRef, authorization });
  return { identity, statement, ownerOperationRef, authorization, binding };
}

async function setup(t) {
  // Every temporary fixture stays within this test directory and is removed after its test.
  const directory = await mkdtemp(join(root, '.host-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = fixture(), path = join(directory, 'handoff.vault'), password = 'synthetic-test-only-storage-password';
  const vault = new Vault(path);
  let keeper = null, fault = null, failReadback = false, handles = [];
  const checkpoints = [];
  const deps = {
    keeper: {
      async readCheckpoint() { return clone(keeper); },
      async compareAndSwapCheckpoint({ expected, next }) {
        if (canonical(keeper) !== canonical(expected)) throw Object.assign(Error('fixture checkpoint conflict'), { code: 'FIXTURE_CHECKPOINT_CONFLICT' });
        if (fault === 'keeper-before' && next.pending !== null) { fault = null; throw Error('fixture before keeper retention'); }
        // Compare and assign with no intervening async boundary: this is the
        // test keeper's atomic operation. A durable keeper must supply its own.
        keeper = clone(next); checkpoints.push(clone(next));
        if (fault === 'keeper-after' && next.pending === null) { fault = null; throw Error('fixture lost keeper reply'); }
        if (fault === 'keeper-bad-echo') { fault = null; return { ...next, handoffId: h('wrong-store') }; }
        return clone(next);
      },
    },
    vaultFactory: () => ({
      create: (...args) => vault.create(...args),
      async read(...args) {
        if (failReadback) { failReadback = false; throw Error('fixture readback lost'); }
        return vault.read(...args);
      },
      async update(...args) {
        if (fault === 'before') { fault = null; throw Error('fixture write absent'); }
        if (fault === 'cas-data') {
          fault = null;
          await vault.update(password, args[1], data => ({ ...data, handoffId: h('changed-vault') }));
        }
        const result = await vault.update(...args);
        if (fault === 'after') { fault = null; throw Error('fixture lost write acknowledgement'); }
        if (fault === 'readback') { fault = null; failReadback = true; }
        return result;
      },
    }),
  };
  const config = { path, password, identity: f.identity, create: true, checkpoint: null };
  const opened = await openGenericRefundHandoff(config, deps); handles.push(opened);
  t.after(() => { for (const handle of handles) handle.privateStore.close(); });
  return { ...f, ...opened, config, deps, vault, path, password, directory, checkpoints,
    get checkpoint() { return clone(keeper); },
    fault(value) { fault = value; },
    request() { return { ownerOperationRef: f.ownerOperationRef, binding: clone(f.binding) }; },
    input() { return { ownerOperationRef: f.ownerOperationRef, binding: clone(f.binding), authorization: clone(f.authorization) }; },
    async reopen(overrides = {}) {
      const handle = await openGenericRefundHandoff({ ...config, create: false, checkpoint: keeper, ...overrides }, deps);
      handles.push(handle); return handle;
    },
  };
}

test('HOST NON-PROOF: exact encrypted bytes survive owner absence, duplicate retain and restart', async t => {
  const f = await setup(t), input = f.input(), originalBytes = Buffer.from(input.authorization.proof);
  const before = await f.vault.read(f.password);
  assert.equal(before.revision, 0);
  const receipt = await f.privateStore.retain(input);
  assert.deepEqual(receipt, { schema: HANDOFF_SCHEMA, classification: HANDOFF_CLASSIFICATION,
    ownerOperationRef: f.ownerOperationRef, retained: true });
  const retained = await f.vault.read(f.password);
  assert.equal(retained.revision, 1);
  assert.equal(retained.data.entry.authorization.proof, originalBytes.toString('base64'));
  assert.equal(Object.hasOwn(retained.data.entry.authorization, 'metrics'), false);
  assert.deepEqual(f.checkpoints.map(cp => [cp.acknowledged?.revision ?? null, cp.pending?.revision ?? null]),
    [[null, 0], [0, null], [0, 1], [1, null]]);
  assert.deepEqual(await f.privateStore.retain(f.input()), receipt);
  assert.equal((await f.vault.read(f.password)).revision, 1);
  input.authorization.proof.fill(255); input.binding.recoveryCommitment = h('mutated');
  f.privateStore.close();
  const restarted = await f.reopen(), read = await restarted.privateStore.read(f.request());
  assert.deepEqual(read.authorization.proof, originalBytes);
  assert.deepEqual(read.authorization.publicInputs, f.authorization.publicInputs);
  assert.deepEqual(read.binding, f.binding);
  read.authorization.proof.fill(0); read.binding.settleBefore = '1';
  assert.deepEqual((await restarted.privateStore.read(f.request())).authorization.proof, originalBytes);
});

test('HOST NON-PROOF: private A0 produces the unchanged existing F51 witness with public membership only', async t => {
  const f = await setup(t); await f.privateStore.retain(f.input());
  f.privateStore.close(); const { privateStore } = await f.reopen();
  const tree = new PrivateNoteTree(['0x' + h('unrelated-leaf'), '0x' + f.binding.reserveCommitment]);
  const path = tree.path(1), membership = { identitySHA256: digest(f.identity), acceptedRoot: path.root.slice(2),
    siblings: path.siblings.map(value => value.slice(2)), leafIndex: path.index, validFrom: '300', validUntil: '600' };
  const result = await privateStore.refundInputs({ ...f.request(), membership });
  assert.equal(result.mode, 'refund'); assert.equal(result.expectedPublicInputs.length, 51);
  assert.deepEqual(result.witness.owner_inputs, f.authorization.publicInputs);
  assert.deepEqual(result.witness.owner_proof, f.authorization.proofFields);
  assert.deepEqual(result.witness.owner_vk, ownerVK);
  assert.equal(result.witness.settle_before, '300');
  for (const mutation of [
    m => { m.identitySHA256 = h('foreign-domain'); }, m => { m.acceptedRoot = h('false-root'); },
    m => { m.leafIndex = 0; }, m => { m.siblings[0] = h('false-sibling'); },
    m => { m.validFrom = '299'; }, m => { m.validUntil = '300'; },
    m => { m.validUntil = String(1n << 64n); }, m => { m.ownerKey = 'forbidden'; },
  ]) {
    const changed = clone(membership); mutation(changed);
    await assert.rejects(async () => privateStore.refundInputs({ ...f.request(), membership: changed }));
  }
});

for (const fault of ['after', 'readback', 'keeper-after']) test(`HOST NON-PROOF: committed ${fault} recovers from keeper checkpoint without new A0`, async t => {
  const f = await setup(t); f.fault(fault);
  await assert.rejects(f.privateStore.retain(f.input()), { code: 'REFUND_HANDOFF_WRITE_UNCERTAIN' });
  await assert.rejects(f.privateStore.read(f.request()), { code: 'REFUND_HANDOFF_REOPEN_REQUIRED' });
  const original = Buffer.from(f.authorization.proof); wipePrivate(f.authorization);
  f.privateStore.close();
  const { privateStore } = await f.reopen();
  assert.deepEqual((await privateStore.read(f.request())).authorization.proof, original);
  assert.equal(f.checkpoint.pending, null);
});

test('HOST NON-PROOF: absent write stays blocked on restart, exact surviving candidate may retry', async t => {
  const f = await setup(t); f.fault('before');
  await assert.rejects(f.privateStore.retain(f.input()), { code: 'REFUND_HANDOFF_WRITE_UNCERTAIN' });
  assert.equal((await f.vault.read(f.password)).data.entry, null);
  await assert.rejects(f.reopen(), { code: 'REFUND_HANDOFF_PENDING_WRITE_ABSENT' });
  const receipt = await f.privateStore.resumePendingWrite(); assert.equal(receipt.retained, true);
  assert.deepEqual((await f.privateStore.read(f.request())).authorization.proof, f.authorization.proof);
  await assert.rejects(f.privateStore.resumePendingWrite(), { code: 'REFUND_HANDOFF_NO_PENDING_WRITE' });
});

test('HOST NON-PROOF: stale checkpoint, ciphertext rollback, tamper, wrong password and store swap fail closed', async t => {
  const f = await setup(t), initialCheckpoint = f.checkpoint, initialCiphertext = await readFile(f.path);
  await f.privateStore.retain(f.input()); const acknowledged = f.checkpoint, goodCiphertext = await readFile(f.path);
  await assert.rejects(f.reopen({ checkpoint: initialCheckpoint }), { code: 'REFUND_HANDOFF_KEEPER_CHANGED' });
  await assert.rejects(f.reopen({ password: 'wrong-synthetic-password' }), /authentication failed/);
  await assert.rejects(f.reopen({ checkpoint: { ...acknowledged, handoffId: h('other-store') } }), { code: 'REFUND_HANDOFF_KEEPER_CHANGED' });
  await writeFile(f.path, initialCiphertext);
  await assert.rejects(f.reopen({ checkpoint: acknowledged }), { code: 'REFUND_HANDOFF_CHECKPOINT_STATE' });
  await writeFile(f.path, goodCiphertext);
  const envelope = JSON.parse(goodCiphertext); envelope.cipher.tag = '0'.repeat(32);
  await writeFile(f.path, JSON.stringify(envelope));
  await assert.rejects(f.reopen({ checkpoint: acknowledged }), /authentication failed/);
});

test('HOST NON-PROOF: immutable reference, proof bytes, recovery, domains and profile pins reject rebinding', async t => {
  const f = await setup(t); await f.privateStore.retain(f.input());
  await assert.rejects(f.privateStore.read({ ...f.request(), ownerOperationRef: h('other-ref') }), { code: 'REFUND_HANDOFF_REF_REBOUND' });
  for (const key of Object.keys(f.binding)) {
    const binding = clone(f.binding); binding[key] = typeof binding[key] === 'string' ? binding[key] + '1' : 'changed';
    await assert.rejects(f.privateStore.read({ ...f.request(), binding }), { code: 'REFUND_HANDOFF_BINDING_CHANGED' });
  }
  const changedProof = f.input();
  changedProof.authorization.proof[31] = 9; changedProof.authorization.proofFields[0] = '9';
  await assert.rejects(async () => f.privateStore.retain(changedProof), { code: 'REFUND_HANDOFF_BINDING_CHANGED' });
  changedProof.binding = deriveGenericRefundBinding({ identity: f.identity,
    ownerOperationRef: f.ownerOperationRef, authorization: changedProof.authorization });
  await assert.rejects(f.privateStore.retain(changedProof), { code: 'REFUND_HANDOFF_ORIGINAL_A0_CHANGED' });
  const other = fixture('two');
  await assert.rejects(f.privateStore.retain({ ownerOperationRef: other.ownerOperationRef, binding: other.binding,
    authorization: other.authorization }), { code: 'REFUND_HANDOFF_REF_REBOUND' });
  for (const key of ['hubDomain', 'registryCommitment', 'issuerLifetime', 'poolCodeHash', 'verifierSetHash', 'evmGenesis']) {
    await assert.rejects(f.reopen({ identity: { ...f.identity, [key]: h('changed:' + key) } }), { code: 'REFUND_HANDOFF_CHECKPOINT_IDENTITY' });
  }
  await assert.rejects(f.reopen({ checkpoint: { ...f.checkpoint, profileSHA256: h('other-profile') } }), { code: 'REFUND_HANDOFF_CHECKPOINT_PROFILE' });
});

test('HOST NON-PROOF: incoherent recursive data, wrong literal owner key and invalid A0 terms never enter storage', async t => {
  const f = await setup(t);
  for (const [mutate, code] of [
    [a => { a.proofFields[0] = '8'; }, 'REFUND_HANDOFF_RECURSIVE_BYTES'],
    [a => { a.proof[31] = 8; }, 'REFUND_HANDOFF_RECURSIVE_BYTES'],
    [a => { a.vkFields[0] = a.vkFields[0] === '0' ? '1' : '0'; }, 'REFUND_HANDOFF_OWNER_KEY_CHANGED'],
    [a => { a.sourceOpening = {}; }, 'REFUND_HANDOFF_FIELDS'],
  ]) {
    const input = f.input(); mutate(input.authorization);
    await assert.rejects(async () => f.privateStore.retain(input), { code });
  }
  for (const mutate of [
    a => { a.publicInputs[0] = String((BigInt(a.publicInputs[0]) + 1n) % (1n << 32n)); },
    a => { a.publicInputs[72] = '1'; }, a => { a.publicInputs[136] = '200'; },
    a => { a.publicInputs[137] = '301'; }, a => { a.publicInputs[138] = '199'; },
  ]) {
    const input = f.input(); mutate(input.authorization);
    await assert.rejects(async () => f.privateStore.retain(input));
  }
  assert.equal((await f.vault.read(f.password)).data.entry, null);
});

test('HOST NON-PROOF: keeper acknowledgement is exact and CAS cannot adopt another write', async t => {
  const f = await setup(t); f.fault('keeper-bad-echo');
  await assert.rejects(f.privateStore.retain(f.input()), { code: 'REFUND_HANDOFF_WRITE_UNCERTAIN' });
  assert.equal((await f.vault.read(f.password)).data.entry, null);
  await f.privateStore.resumePendingWrite();
  const other = await setup(t); other.fault('cas-data');
  await assert.rejects(other.privateStore.retain(other.input()), { code: 'REFUND_HANDOFF_WRITE_UNCERTAIN' });
  await assert.rejects(other.privateStore.resumePendingWrite(), { code: 'REFUND_HANDOFF_WRITE_UNCERTAIN' });
  await assert.rejects(other.reopen(), { code: 'REFUND_HANDOFF_CHECKPOINT_STORE' });
});

test('HOST NON-PROOF: no A0 tuple, bindings, proof, keys, packets or checkpoint in public projection or encrypted disk', async t => {
  const f = await setup(t); await f.privateStore.retain(f.input());
  const projection = await f.publicView.summary();
  assert.deepEqual(Object.keys(f.publicView), ['summary']);
  assert.deepEqual(projection, { schema: HANDOFF_SCHEMA, classification: HANDOFF_CLASSIFICATION, retained: true });
  const visible = JSON.stringify(projection), disk = await readFile(f.path, 'utf8');
  for (const secret of [f.ownerOperationRef, f.binding.operationId, f.binding.fundingCommitment, f.binding.reserveCommitment,
    f.binding.recoveryCommitment, JSON.stringify(f.authorization.publicInputs), Buffer.from(f.authorization.proof).toString('base64')]) {
    assert.equal(visible.includes(secret), false); assert.equal(disk.includes(secret), false);
  }
  const stored = await f.vault.read(f.password);
  assert.deepEqual(Object.keys(stored.data.entry).sort(), ['authorization', 'binding', 'ownerOperationRef']);
  const text = JSON.stringify(stored.data);
  for (const prohibited of ['privateKeyPem', 'sourceOpening', 'capsuleAuthorization', 'rolePackets', 'providerRiskSalts', 'reserveSecret', 'nodes', 'signature']) {
    assert.equal(text.includes('"' + prohibited + '"'), false);
  }
  assert.equal(JSON.stringify(f.checkpoint).includes(f.binding.fundingCommitment), false);
  for (const prohibited of ['send', 'execute', 'verify', 'prove', 'authorizeWithdrawal', 'sign']) {
    assert.equal(typeof f.privateStore[prohibited], 'undefined');
  }
});

test('HOST NON-PROOF: first retention binds the entire original envelope, including private tuple fields', async t => {
  const f = await setup(t);
  for (const mutate of [
    a => { a.proof[31] = 9; a.proofFields[0] = '9'; },
    a => { a.publicInputs[64] = '9'; }, // treeRoot is otherwise absent from the derived summary
    a => { a.publicInputs[96] = '9'; }, // first output is otherwise absent from the derived summary
  ]) {
    const input = f.input(); mutate(input.authorization);
    await assert.rejects(async () => f.privateStore.retain(input), { code: 'REFUND_HANDOFF_BINDING_CHANGED' });
    assert.equal((await f.vault.read(f.password)).data.entry, null);
  }
});

test('HOST NON-PROOF: mistaken create on existing vault never changes ciphertext or keeper checkpoint', async t => {
  const f = await setup(t); await f.privateStore.retain(f.input());
  const keeper = f.checkpoint, ciphertext = await readFile(f.path);
  await assert.rejects(openGenericRefundHandoff(f.config, f.deps), { code: 'REFUND_HANDOFF_CREATE_PATH_EXISTS' });
  assert.deepEqual(f.checkpoint, keeper); assert.deepEqual(await readFile(f.path), ciphertext);
  assert.deepEqual((await f.privateStore.read(f.request())).authorization.proof, f.authorization.proof);
});

test('HOST NON-PROOF: concurrent handles cannot leave keeper pointing at losing candidate', async t => {
  const f = await setup(t), second = await f.reopen(), other = fixture('other-concurrent');
  const inputs = [f.input(), { ownerOperationRef: other.ownerOperationRef, authorization: other.authorization, binding: other.binding }];
  const results = await Promise.allSettled([f.privateStore.retain(inputs[0]), second.privateStore.retain(inputs[1])]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const winnerIndex = results.findIndex(result => result.status === 'fulfilled'), winner = inputs[winnerIndex];
  const disk = await f.vault.read(f.password);
  assert.equal(f.checkpoint.pending, null);
  assert.deepEqual(f.checkpoint.acknowledged, { revision: disk.revision, stateSHA256: digest(disk.data) });
  assert.equal(disk.data.entry.ownerOperationRef, winner.ownerOperationRef);
  const reopened = await f.reopen();
  assert.deepEqual((await reopened.privateStore.read({ ownerOperationRef: winner.ownerOperationRef,
    binding: winner.binding })).authorization.proof, Buffer.from(winner.authorization.proof));
});

test('HOST NON-PROOF: stale reopen cannot overwrite newer keeper acknowledgement', async t => {
  const f = await setup(t), oldCheckpoint = f.checkpoint;
  let signalRead, releaseRead;
  const capturedRead = new Promise(resolve => { signalRead = resolve; });
  const releasedRead = new Promise(resolve => { releaseRead = resolve; });
  const staleOpen = openGenericRefundHandoff({ ...f.config, create: false, checkpoint: oldCheckpoint }, {
    keeper: f.deps.keeper,
    vaultFactory: () => ({
      async read(password) {
        const old = await f.vault.read(password); signalRead(); await releasedRead; return old;
      },
    }),
  });
  // Consume rejection immediately so intentionally delayed awaits do not leak it.
  const rejected = assert.rejects(staleOpen, { code: 'FIXTURE_CHECKPOINT_CONFLICT' });
  await capturedRead;
  await f.privateStore.retain(f.input()); const current = f.checkpoint;
  releaseRead(); await rejected;
  assert.deepEqual(f.checkpoint, current);
  assert.deepEqual((await f.privateStore.read(f.request())).authorization.proof, f.authorization.proof);
});

test('HOST NON-PROOF: lost initial-create reply recovers exact empty vault from pending checkpoint', async t => {
  const f = await setup(t), path = join(f.directory, 'lost-create.vault'), vault = new Vault(path);
  let retained = null;
  const keeper = {
    async readCheckpoint() { return clone(retained); },
    async compareAndSwapCheckpoint({ expected, next }) {
      assert.deepEqual(retained, expected); retained = clone(next); return clone(next);
    },
  };
  const config = { ...f.config, path }, deps = { keeper, vaultFactory: () => ({
    async create(...args) { await vault.create(...args); throw Error('fixture lost create reply'); },
  }) };
  await assert.rejects(openGenericRefundHandoff(config, deps), /lost create reply/);
  assert.equal(retained.acknowledged, null); assert.equal(retained.pending.revision, 0);
  const reopened = await openGenericRefundHandoff({ ...config, create: false, checkpoint: retained }, { keeper });
  t.after(() => reopened.privateStore.close());
  assert.deepEqual(await reopened.publicView.summary(), { schema: HANDOFF_SCHEMA, classification: HANDOFF_CLASSIFICATION, retained: false });
  assert.equal(retained.pending, null);
});
