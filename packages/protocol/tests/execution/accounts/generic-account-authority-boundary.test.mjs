/** Pure registry/constructor boundaries only. No mocked production ownership,
 * spawned chain, proof, compiler or alternate backend is admitted by this test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGenericBalanceAccountAuthority, genericBalanceAccountAsset, validateGenericAccountRecoveryObservation}
  from '../../../../backend/src/accounts/balances/generic-balance-account-authority.mjs';
import {bindGenericAccountRequest, validateGenericAccountConfig, validateBoundRequest, sha} from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import {identity as fixtureIdentity, ledger, artifact} from '../balances/generic-balance-fixtures.mjs';
import {PrivateNoteTree} from '../../../../engine/src/notes/private-note-tree.mjs';
import {inspectGenericSnapshot} from '../../../../engine/src/execution/local/local-ledger.mjs';
import {genericProofCalldata} from '../../../../engine/src/execution/local/local-deployment.mjs';
import {decodeGenericBalanceCalldata} from '../../../../backend/src/accounts/balances/generic-balance-observer.mjs';
import {digestWords} from '../../../../proofs/programs/generic-wrappers/abi.mjs';

const h = n => n.toString(16).padStart(64, '0');
const identity = {
  evmGenesis: h(1), pool: '2'.repeat(40), scope: h(3), policy: h(4), chainId: '31337',
  asset: {kind: 'NATIVE', address: '0'.repeat(40), codeHash: h(5), identity: h(6)},
};

test('registry adapter produces the exact account schema and binds pool, genesis, scope and asset', () => {
  const asset = genericBalanceAccountAsset(identity);
  const config = validateGenericAccountConfig({journalId: 'boundary_journal', accountId: 'boundary_account', lifetime: h(7), registry: [asset]});
  const input = {requestId: 'boundary_request', assetId: asset.assetId, kind: 'GRAPH', ownerOperationRef: h(8)};
  const bound = bindGenericAccountRequest(input, config);
  assert.deepEqual(validateBoundRequest(bound, config), bound);
  assert.ok(Object.isFrozen(asset));
  assert.deepEqual(Object.keys(asset).sort(), ['assetId', 'kind', 'symbol', 'decimals', 'chainId', 'genesis', 'pool', 'scope', 'policy', 'token', 'codeHash', 'assetIdentity', 'custody', 'trust'].sort());
  for (const changed of [
    {...identity, evmGenesis: h(11)}, {...identity, pool: 'a'.repeat(40)},
    {...identity, scope: h(12)}, {...identity, asset: {...identity.asset, identity: h(13)}},
  ]) assert.notEqual(genericBalanceAccountAsset(changed).assetId, asset.assetId);
  const token = genericBalanceAccountAsset({...identity, asset: {kind: 'ERC20', address: 'b'.repeat(40), codeHash: h(14), identity: h(15)}});
  assert.equal(token.kind, 'ERC20'); assert.equal(token.token, 'b'.repeat(40));
  assert.notEqual(token.assetId, asset.assetId);
  assert.throws(() => genericBalanceAccountAsset({...identity, asset: {...identity.asset, address: 'b'.repeat(40)}}));
  assert.throws(() => genericBalanceAccountAsset({...identity, evmGenesis: '0x' + h(1)}));
  assert.throws(() => genericBalanceAccountAsset({...identity, pool: 'not-an-address'}));
});

test('authority refuses unowned runtime/system and extra backend credentials before host work', async () => {
  let calls = 0;
  const input = {runtime: {async health() {calls++;}}, system: {}, poolIndex: 0,
    owner: {}, observer: {}, nativeExecution: {}, accountId: 'boundary_account', journalId: 'boundary_journal'};
  await assert.rejects(createGenericBalanceAccountAuthority(input), /NATIVE_OWNED_SYSTEM_CAPABILITY/);
  assert.equal(calls, 0);
  for (const key of ['backend', 'prover', 'rpc', 'ownerPassword', 'graph']) {
    await assert.rejects(createGenericBalanceAccountAuthority({...input, [key]: 'UNTRUSTED'}), /BALANCE_ACCOUNT_OPTIONS/);
  }
  assert.equal(calls, 0);
});

const prefix = value => '0x' + value;
const calldataHash = value => createHash('sha256').update(Buffer.from(value.slice(2), 'hex')).digest('hex');
const rootOf = commitments => new PrivateNoteTree(commitments).root;

// Deliberately invalid c0ffee proof bytes establish only the host observation
// boundary. No chain, owner process, prover, compiler or acceptance is mocked.
function recoveryFixture() {
  const identity = fixtureIdentity(), binding = { identitySHA256: sha(identity), ownerOperationRef: h(10),
    scope: identity.scope, policy: identity.policy, asset: identity.asset.identity,
    fundingCommitment: h(11), inputNullifier: h(12), reserveCommitment: h(13), changeCommitment: h(14),
    reserveNullifier: h(15), recoveryCommitment: h(16), admissionTag: h(17),
    fundingNotBefore: '5900', fundingValidUntil: '6200', settleBefore: '6500' };
  const initial = [prefix(binding.fundingCommitment)], reserved = [...initial,
    prefix(binding.reserveCommitment), prefix(binding.changeCommitment)];
  const initialRoots = [rootOf([]), rootOf(initial)], sourceRoots = [...initialRoots, rootOf(reserved)];
  const beforeSource = ledger(identity, { commitments: initial, roots: initialRoots, sequence: '1', outputs: 1, backing: '50000' });
  const afterSource = ledger(identity, { commitments: reserved, nullifiers: [prefix(binding.inputNullifier)], roots: sourceRoots,
    sequence: '2', reservations: 1, outputs: 1, backing: '50000' });
  const sourceWords = [binding.scope, binding.policy, binding.asset, rootOf(initial).slice(2), binding.inputNullifier,
    binding.reserveCommitment, binding.changeCommitment, binding.admissionTag].flatMap(digestWords)
    .concat(binding.fundingNotBefore, binding.fundingValidUntil);
  const sourceCalldata = genericProofCalldata(artifact, 'reserveGenericGuarded(bytes,bytes32[],uint64,bytes32)',
    Buffer.from('c0ffee', 'hex'), sourceWords, { expectedSequence: '1', expectedPostRoot: rootOf(reserved) });
  const source = { calldata: sourceCalldata, calldataSHA256: calldataHash(sourceCalldata), publicInputs: sourceWords,
    transactionHash: h(18), observation: null };
  source.observation = observed(identity, source, beforeSource, afterSource);
  // A separate graph consumed the actual first change and settled before F.
  const secondReserved = [...reserved, prefix(h(21)), prefix(h(22))];
  const intervening = [...secondReserved, ...[23, 24, 25, 26].map(value => prefix(h(value)))];
  const spent = [binding.inputNullifier, h(27), h(28)].map(prefix);
  const roots = [...sourceRoots, rootOf(secondReserved), rootOf(intervening)];
  const before = ledger(identity, { commitments: intervening, nullifiers: spent, roots,
    sequence: '4', reservations: 1, outputs: 5, backing: '50000', timestamp: '7000' });
  const recovered = [...intervening, prefix(binding.recoveryCommitment)];
  const after = ledger(identity, { commitments: recovered, nullifiers: [...spent, prefix(binding.reserveNullifier)],
    roots: [...roots, rootOf(recovered)], sequence: '5', reservations: 0, outputs: 6, backing: '50000', timestamp: '7050' });
  const publicInputs = [binding.scope, binding.policy, binding.asset, rootOf(intervening).slice(2),
    binding.reserveNullifier, binding.recoveryCommitment].flatMap(digestWords).concat(binding.settleBefore, '7000', '7300');
  const calldata = genericProofCalldata(artifact, 'recoverGeneric(bytes,bytes32[])', Buffer.from('c0ffee', 'hex'), publicInputs);
  const recovery = { calldata, calldataSHA256: calldataHash(calldata), publicInputs, transactionHash: h(29) };
  return { identity, artifact, binding, source, recovery, observation: observed(identity, recovery, before, after) };
}

function observed(identity, submission, before, after) {
  const decoded = decodeGenericBalanceCalldata(artifact, submission.calldata);
  const { publicState: state } = inspectGenericSnapshot({ ...after, scope: prefix(identity.scope) });
  return { identitySHA256: sha(identity), transaction: { hash: submission.transactionHash, to: identity.pool,
    value: '0', calldata: submission.calldata }, receipt: { transactionHash: submission.transactionHash,
    blockHash: after.blockHash, status: 1 }, before, after,
    stateAdvanced: { address: identity.pool, transactionHash: submission.transactionHash, blockHash: after.blockHash,
      sequence: state.sequence, root: state.root, spent: state.spentDigest, leaves: state.leaves, consumed: state.spent },
    transition: decoded.transition, ...(decoded.recovery ? { recovery: decoded.recovery } : {}) };
}

function rewriteRecovery(fixture, publicInputs) {
  const calldata = genericProofCalldata(artifact, 'recoverGeneric(bytes,bytes32[])', Buffer.from('c0ffee', 'hex'), publicInputs);
  fixture.recovery = { ...fixture.recovery, calldata, calldataSHA256: calldataHash(calldata), publicInputs };
  fixture.observation = observed(fixture.identity, fixture.recovery, fixture.observation.before, fixture.observation.after);
}

test('HOST NON-PROOF: exact F51 follows original S66 despite intervening change reuse and settlement', () => {
  const fixture = recoveryFixture(), source = structuredClone(fixture.source);
  const result = validateGenericAccountRecoveryObservation(fixture);
  assert.equal(result.transactionHash, fixture.recovery.transactionHash);
  assert.equal(result.recovery.reserveNullifier, fixture.binding.reserveNullifier);
  assert.equal(result.recovery.recoveryCommitment, fixture.binding.recoveryCommitment);
  assert.deepEqual(fixture.source, source, 'F51 validation must preserve the entire original S66');
  assert.equal(result.sourceObservationSHA256, sha(source.observation));
  const historical = recoveryFixture(), words = [...historical.recovery.publicInputs];
  words.splice(24, 8, ...digestWords(historical.source.observation.stateAdvanced.root.slice(2)));
  rewriteRecovery(historical, words);
  assert.equal(validateGenericAccountRecoveryObservation(historical).recovery.acceptedRoot,
    historical.source.observation.stateAdvanced.root.slice(2));
  fixture.recovery.transactionHash = null;
  assert.equal(validateGenericAccountRecoveryObservation(fixture).transactionHash, result.transactionHash,
    'an unknown hash may reconcile only the identical original calldata');
});

test('HOST NON-PROOF: foreign/latest-state/reorg/event/calldata and original-source substitutions fail closed', () => {
  const mutations = [
    f => { f.binding.identitySHA256 = h(99); },
    f => { f.binding.asset = h(99); },
    f => { f.observation = { spent: true }; },
    f => { f.observation.identitySHA256 = h(99); },
    f => { f.observation.transaction.hash = h(99); },
    f => { f.observation.transaction.to = 'ab'.repeat(20); },
    f => { f.observation.transaction.value = '1'; },
    f => { f.observation.transaction.calldata += '00'; },
    f => { f.recovery.calldataSHA256 = h(99); },
    f => { f.recovery.publicInputs[0] = '1'; },
    f => { f.observation.receipt.status = 0; },
    f => { f.observation.receipt.transactionHash = h(99); },
    f => { f.observation.after.canonicalBlockHashAfter = h(99); },
    f => { f.observation.stateAdvanced.leaves++; },
    f => { f.observation.transition.spentNullifiers = [h(99)]; },
    f => { f.observation.recovery.reserveNullifier = h(99); },
    f => { f.source.transactionHash = h(99); },
    f => { f.source.calldataSHA256 = h(99); },
    f => { f.source.observation.receipt.status = 0; },
    f => { f.source.observation.stateAdvanced.root = prefix(h(99)); },
    f => { f.source.observation.before.canonicalBlockHashBefore = h(99); },
    f => { f.binding.inputNullifier = h(99); },
    f => { f.binding.fundingCommitment = h(99); },
    f => { f.binding.recoveryCommitment = h(99); },
    f => { f.binding.settleBefore = '6499'; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const fixture = recoveryFixture(); mutate(fixture);
    assert.throws(() => validateGenericAccountRecoveryObservation(fixture), undefined, `mutation ${index}`);
  }
});

test('HOST NON-PROOF: recovery cutoff, exact window, accepted-root history and backing remain mandatory', () => {
  for (const [index, value] of [[48, '6499'], [49, '6499'], [50, '7301'], [50, '7000']]) {
    const fixture = recoveryFixture(), words = [...fixture.recovery.publicInputs]; words[index] = value;
    rewriteRecovery(fixture, words);
    assert.throws(() => validateGenericAccountRecoveryObservation(fixture));
  }
  const staleRoot = recoveryFixture(), words = [...staleRoot.recovery.publicInputs];
  words.splice(24, 8, ...digestWords(staleRoot.source.observation.before.rawState.slice(2, 66)));
  rewriteRecovery(staleRoot, words);
  assert.throws(() => validateGenericAccountRecoveryObservation(staleRoot), /RECOVERY_ROOT/);
  for (const timestamp of ['6999', '7300']) {
    const fixture = recoveryFixture(); fixture.observation.after.timestamp = timestamp;
    assert.throws(() => validateGenericAccountRecoveryObservation(fixture));
  }
  // Keep snapshot encoding coherent while changing both held and admitted funds.
  const fixture = recoveryFixture(), body = fixture.observation.after.rawBacking.slice(2).match(/.{64}/g);
  body[1] = body[2] = (49999n).toString(16).padStart(64, '0');
  fixture.observation.after.rawBacking = '0x' + body.join('');
  assert.throws(() => validateGenericAccountRecoveryObservation(fixture), /BACKING_CHANGED/);
  for (const [wordIndex, value] of [[5, 1], [6, 5]]) {
    const changed = recoveryFixture(), state = changed.observation.after.rawState.slice(2).match(/.{64}/g);
    state[wordIndex] = BigInt(value).toString(16).padStart(64, '0');
    changed.observation.after.rawState = '0x' + state.join('');
    assert.throws(() => validateGenericAccountRecoveryObservation(changed), /RECOVERY_(RESERVATIONS|CAPACITY)/);
  }
  const missingHistory = recoveryFixture();
  for (const position of ['before', 'after']) {
    const snapshot = missingHistory.observation[position];
    const state = inspectGenericSnapshot({ ...snapshot, scope: prefix(missingHistory.identity.scope) });
    const roots = state.roots.filter(root => root !== missingHistory.source.observation.stateAdvanced.root);
    missingHistory.observation[position] = ledger(missingHistory.identity, { commitments: state.commitments,
      nullifiers: state.nullifiers, roots, sequence: state.publicState.sequence,
      reservations: state.publicState.liveReservations, outputs: state.publicState.outputCapacity,
      backing: state.publicState.backedAmount, timestamp: snapshot.timestamp, blockHash: snapshot.blockHash });
  }
  assert.throws(() => validateGenericAccountRecoveryObservation(missingHistory), /SOURCE_HISTORY/);
});
