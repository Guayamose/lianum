/** Host-only shape and wiring checks. Recursive fields are intentionally
 * synthetic: no prover/compiler/native chain runs or acceptance claims here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createGenericNativeExecutionKeeper, assertOwnedGenericNativeExecutionKeeper,
  validateGenericNativeExecutionPreparation } from '../../../../../backend/src/execution/native/dispatch/generic-native-execution.mjs';
import { createGenericBalanceNativePreparation, genericBalanceNativeTerms,
  prepareGenericBalanceNativeCapsules } from '../../../../src/execution/balances/generic-balance-native-preparation.mjs';
import { capsuleAuthorizationWords, dependencyCapsuleCommitment } from '../../../../src/execution/native/dispatch/native-capsules.mjs';
import { compileFundedGraph, fundedSigningRequests, fundedAuthorizationWords, attachFundedSignatures } from '../../../../src/execution/graph/funded-graph.mjs';
import { freshKey, signature } from '../../../../src/notes/private-note-encoding.mjs';

const h = value => createHash('sha256').update('generic-native-execution-host:' + value).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const synthetic = publicInputs => ({ proof: Buffer.alloc(32, 1), publicInputs,
  proofFields: Array(458).fill('1'), vkFields: Array(115).fill('2') });
const note = (key, value, label) => ({ type: 4, rho: h(label + ':rho'), x: hex(key.x), y: hex(key.y), value: String(value), secret: h(label + ':secret') });
function fixture(count, shape = 'chain') {
  const owner = freshKey(), change = freshKey(), recovery = freshKey(), payoutKeys = Array.from({ length: count }, () => freshKey());
  const domains = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(key => [key, h(key)]));
  // Reverse input order intentionally. The existing graph codec determines
  // canonical topological slot order before this execution boundary sees it.
  const preparation = createGenericBalanceNativePreparation({ ...domains, operationId: h('operation'),
    fundingNotBefore: '100', fundingValidUntil: '200', settleBefore: '5000',
    nodes: Array.from({ length: count }, (_, slot) => ({ id: `node-${slot}`,
      dependsOn: shape === 'chain' && slot ? [`node-${slot - 1}`]
        : shape === 'fan-in' && slot === count - 1 ? Array.from({ length: slot }, (_, i) => `node-${i}`) : [],
      evidencePolicy: h('evidence:' + slot),
      actionTemplate: { chainDomain: h('chain:' + slot), signerIdentity: h('signer:' + slot),
        sourceCommitment: h('source:' + slot), destinationCommitment: h('destination:' + slot),
        amount: String(slot + 100), custodyKind: 1, custodyCommitment: h('custody:' + slot), executionFrom: '100', executionUntil: '4900' },
      recipientOffer: { x: hex(payoutKeys[slot].x), y: hex(payoutKeys[slot].y), value: '25',
        secret: h('payout:' + slot), randomness: h('randomness:' + slot) },
    })).reverse() });
  const terms = genericBalanceNativeTerms(preparation);
  const compiled = compileFundedGraph({ scope: domains.scope, policy: domains.policy, asset: domains.asset, ...terms,
    reservationNonce: h('reservation'), reserveSecret: h('reserve'), graphNonce: h('graph'),
    inputNote: note(owner, count * 25 + 7, 'input'), changeNote: note(change, 7, 'change'), recoveryNote: note(recovery, count * 25, 'recovery'),
    paddingSalts: Array.from({ length: 4 }, (_, slot) => h('padding:' + slot)),
  });
  const requests = fundedSigningRequests(compiled);
  const signed = attachFundedSignatures(compiled, { ownerSignature: hex(signature(owner, requests.owner.message)),
    invoiceSignatures: requests.invoices.map(request => hex(signature(payoutKeys[request.slot], request.message))) });
  const authorizationWords = fundedAuthorizationWords(signed.authorizationStatement);
  const { capsules, rolePackets, providerRiskSalts } = prepareGenericBalanceNativeCapsules({ preparation, signed, authorizationWords });
  const prepared = { authorization: synthetic(authorizationWords), capsuleAuthorization: synthetic(capsuleAuthorizationWords(capsules.statement)),
    reserveCommitment: capsules.statement.reserveCommitment, reserveNullifier: capsules.statement.reserveNullifier,
    settleBefore: preparation.config.settleBefore, rolePackets, providerRiskSalts };
  return { prepared, domains };
}

test('one through four canonical active slots retain all four completion packets', () => {
  for (const count of [1, 2, 3, 4]) {
    const { prepared, domains } = fixture(count, count === 4 ? 'fan-in' : 'chain');
    const before = structuredClone(prepared), result = validateGenericNativeExecutionPreparation(prepared, domains);
    assert.equal(result.activeCount, count);
    assert.equal(result.prepared.rolePackets.node.length, 4);
    assert.deepEqual(result.prepared.rolePackets.ready.map(value => value !== null), Array.from({ length: 4 }, (_, slot) => slot < count));
    assert.deepEqual(structuredClone(prepared), before);
    result.prepared.authorization.proof.fill(0);
    result.prepared.rolePackets.node[0].receiptSpendSecret = h('changed');
    assert.equal(prepared.authorization.proof[0], 1);
    assert.equal(structuredClone(prepared).rolePackets.node[0].receiptSpendSecret, before.rolePackets.node[0].receiptSpendSecret);
    if (count === 4) assert.deepEqual(result.prepared.rolePackets.dependency[3].dependencyCapsule.predecessors.map(source => source.sourceSlot), [0, 1, 2]);
  }
});

test('binds A0/C, owned domains, reserve and every scoped packet before native work', () => {
  for (const mutate of [
    f => { f.domains.scope = h('other-pool'); },
    f => { f.prepared.reserveCommitment = h('other-reserve'); },
    f => { f.prepared.reserveNullifier = h('other-nullifier'); },
    f => { f.prepared.settleBefore = '5001'; },
    f => { f.prepared.rolePackets.node[0].scope = h('other-pool'); },
    f => { f.prepared.rolePackets.ready[0].action.amount = '99'; },
    f => { f.prepared.providerRiskSalts[0] = h('other-risk'); },
    f => { f.prepared.rolePackets.ready[3] = {}; },
  ]) {
    const f = fixture(2); f.prepared = structuredClone(f.prepared); mutate(f);
    assert.throws(() => validateGenericNativeExecutionPreparation(f.prepared, f.domains), /PAEG_/);
  }
});

test('even a rehashed dependency packet cannot look forward or select a different predecessor', () => {
  for (const sourceSlot of [1, 2, 3]) {
    const { prepared: original, domains } = fixture(2), prepared = structuredClone(original);
    const packet = prepared.rolePackets.dependency[1];
    packet.dependencyCapsule.predecessors[0].sourceSlot = sourceSlot;
    // Existing dependency codec already rejects forward/self slots. If a
    // shape mutation reaches execution it must still fail before any send.
    assert.throws(() => {
      packet.dependencyCapsuleCommitment = dependencyCapsuleCommitment(packet, packet.dependencyCapsule);
      validateGenericNativeExecutionPreparation(prepared, domains);
    }, /PAEG_/);
  }
});

test('proof preparation rejects extra interfaces, sparse fields and getters', () => {
  const f = fixture(1);
  assert.throws(() => validateGenericNativeExecutionPreparation({ ...f.prepared, prove: () => true }, f.domains), /FIELDS/);
  const access = { ...f.prepared }; Object.defineProperty(access, 'authorization', { get() { throw Error('getter executed'); } });
  assert.throws(() => validateGenericNativeExecutionPreparation(access, f.domains), /FIELDS/);
  const sparse = structuredClone(f.prepared); delete sparse.authorization.publicInputs[0];
  assert.throws(() => validateGenericNativeExecutionPreparation(sparse, f.domains), /ARRAY/);
  const changed = structuredClone(f.prepared); changed.capsuleAuthorization.proofFields[0] = '01';
  assert.throws(() => validateGenericNativeExecutionPreparation(changed, f.domains), /INTEGER/);
  changed.capsuleAuthorization.proofFields[0] = '1\n';
  assert.throws(() => validateGenericNativeExecutionPreparation(changed, f.domains), /INTEGER/);
  assert.throws(() => validateGenericNativeExecutionPreparation(f.prepared, { ...f.domains, scope: f.domains.scope + '\n' }), /HASH/);
});

test('factory refuses lookalike owned capabilities before runtime, callbacks or providers run', () => {
  let calls = 0;
  const binding = { runtime: { health() { calls++; } }, system: {}, poolIndex: 0 };
  assert.throws(() => createGenericNativeExecutionKeeper({ ...binding, observer: {}, solana: {}, bitcoin: {} },
    { onStage() { calls++; } }), /NATIVE_OWNED_SYSTEM_CAPABILITY/);
  assert.throws(() => assertOwnedGenericNativeExecutionKeeper(Object.freeze({ execute() {} }), binding), /OWNED_KEEPER_CAPABILITY/);
  assert.equal(calls, 0);
  assert.throws(() => createGenericNativeExecutionKeeper({ ...binding, observer: {}, solana: {}, bitcoin: {}, rpc: 'http://127.0.0.1' }), /FIELDS/);
  assert.throws(() => createGenericNativeExecutionKeeper({ ...binding, observer: {}, solana: {}, bitcoin: {} }, { prove() {} }), /FIELDS/);
});

test('fixed host wiring retains serial pinned roles, owned gates and original terminal reconciliation', () => {
  const source = readFileSync(new URL('../../src/paeg/generic-native-execution.mjs', import.meta.url), 'utf8');
  for (const role of ["role('dependency', ['dependency'])", "role('ready', ['ready'])", "role('receipt', ['admission'])",
    "role('node', ['node'])", "role('assembler', ['aggregate_pair', 'aggregate_all', 'fulfill'])"]) assert.ok(source.includes(role));
  assert.match(source, /for \(const \{ slot, family, recipientIndex, provider, native \} of providers\)/);
  assert.equal([...source.matchAll(/await provider\.execute\(/g)].length, 1);
  assert.match(source, /await provider\.reconcile\(\)/);
  assert.match(source, /commitment: 'finalized'/);
  assert.match(source, /await bitcoin\.confirm\(dispatched\.signedNative\.txid\)/);
  assert.match(source, /slot < 4; slot\+\+/);
  assert.match(source, /fulfillData\(fulfillment\.proof, fulfillment\.publicInputs, await health\(\)\)/);
  assert.match(source, /runtime\.receipt\(record\.terminal\.transactionHash\)/);
  assert.match(source, /transaction\.input === record\.terminal\.calldata/);
  assert.match(source, /STARTED_NO_RESTART/);
  assert.match(source, /RESERVE_ALREADY_STARTED/);
  assert.match(source, /selected\.forEach\(release\)/);
  assert.match(source, /wipePrivate\(prepared\)/);
  assert.doesNotMatch(source, /Promise\.all|createLocalEvm\(|createOwnedBitcoinRuntime\(|createOwnedSolana|compileNativeSystem\(/);
});

test('abort latches before awaited proof cleanup and leaves completed records and caller runtimes intact', () => {
  const source = readFileSync(new URL('../../src/paeg/generic-native-execution.mjs', import.meta.url), 'utf8');
  const abort = source.slice(source.indexOf('    abort() {'), source.indexOf('    inspect(ownerOperationRef)'));
  assert.ok(abort.indexOf('aborted = true') >= 0);
  assert.ok(abort.indexOf('aborted = true') < abort.indexOf('await facade.close()'));
  assert.ok(abort.indexOf("work.record.status = 'CANCELLED_NO_RESTART'") < abort.indexOf('await facade.close()'));
  assert.match(abort, /work\.record\.status !== 'SETTLED'/);
  assert.match(abort, /abortPromise \?\?=/);
  assert.match(abort, /facade\.report\(\)/);
  assert.match(abort, /exited: proofRoles\.every\(result => result\.exited === true\)/);
  assert.doesNotMatch(abort, /provider\.|runtime\.|bitcoin\.|solana\.|\.send\(|\.execute\(/);
  assert.match(source, /activeWork = \{ record, roles \}/);
  assert.match(source, /try \{ running\(\); proof = await facade\.prove/);
  assert.match(source, /const send = async[^]*?\{\n    running\(\);/);
  assert.match(source, /record\.status = aborted \? 'CANCELLED_NO_RESTART' : 'FAILED_NO_RESTART'/);
});
