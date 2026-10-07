/** Explicit fake ABI fixtures: SHA is real, receipt/evidence field values and
 * proof bytes are fabricated. These tests start no chain, compiler or prover. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFlatTerminalObserver, assertOwnedFlatTerminalObserver, decodeFlatTerminalCalldata,
  inspectFlatTerminalDelta } from '../../../../src/execution/account/reconciliation/flat-terminal-observer.mjs';
import { encodeFlatTransaction } from '../../../../src/execution/encoding/transaction-codec.mjs';
import { encodeStatement } from '../../../../src/execution/encoding/statements.mjs';
import { decodeFlatWords } from '../../../../src/execution/account/reconciliation/flat-system-state.mjs';
import { PrivateNoteTree, privateSpentDigest } from '../../../../../engine/src/notes/private-note-tree.mjs';
import { boundedListDigest } from '../../../../../engine/src/execution/native/state/native-state.mjs';

const hash = value => createHash('sha256').update('FAKE terminal parser fixture: ' + value).digest('hex');
const field = value => BigInt(value).toString(16).padStart(64, '0'), zero = field(0), prefix = value => '0x' + value;
const abi = values => '0x' + values.map(value => typeof value === 'string' && value.startsWith('0x') ? value.slice(2)
  : typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : field(value)).join('');
const identity = { hubDomain: prefix(hash('hub')), pools: [0, 1].map(index => ({
  address: '0x' + String(index + 1).repeat(40), scope: prefix(hash('scope' + index)), domainCommitment: prefix(field(index + 1)),
})) };
const binding = { domainCommitment: field(1), envelope: field(10), inputCommitment: hash('input'), inputNullifier: hash('input nf'),
  reserveCommitment: hash('reserve'), reserveNullifier: hash('reserve nf'), changeCommitment: hash('change'),
  recoveryCommitment: hash('recovery'), settleBefore: '100', authorizationPublicInputsSHA256: hash('authorization inputs') };
const baseLeaves = [binding.inputCommitment, binding.reserveCommitment, binding.changeCommitment].map(prefix);
function poolRaw(scope, commitments, nullifiers, roots, sequence, reservations, capacity, admitted = 5, actual = 7) {
  const tree = new PrivateNoteTree(commitments), paddedRoots = [...roots, ...Array(65 - roots.length).fill(prefix(zero))];
  const count = Buffer.alloc(4); count.writeUInt32BE(roots.length);
  const history = createHash('sha256').update(Buffer.concat([Buffer.from([0x18]), Buffer.from(scope.slice(2), 'hex'), count,
    ...paddedRoots.map(value => Buffer.from(value.slice(2), 'hex'))])).digest('hex');
  return { rawState: abi([tree.root, privateSpentDigest(scope, nullifiers, nullifiers.length), sequence,
    commitments.length, nullifiers.length, reservations, capacity, ...commitments, ...Array(64 - commitments.length).fill(zero),
    ...nullifiers, ...Array(64 - nullifiers.length).fill(zero)]),
  rawHistory: abi([sequence, history, roots.length, ...paddedRoots]),
  rawBacking: abi([sequence, admitted, actual, Math.max(actual - admitted, 0), Math.max(admitted - actual, 0), 0]),
  nativeBalance: String(actual) };
}
function hubRaw(index, sequence, reserved, total, tags) {
  const padded = [...tags.map(prefix), ...Array(64 - tags.length).fill(prefix(zero))];
  return abi([identity.pools[index].domainCommitment, field(20 + index), 0,
    boundedListDigest(0x31, identity.hubDomain, padded, String(tags.length)), tags.length, tags.length / 4,
    field(30 + index), 0, 0, sequence, field(40 + index), 0, reserved, total,
    ...Array(64).fill(field(50 + index)), ...padded, ...Array(64).fill(zero)]);
}
function fixture(kind, poolIndex = 0) {
  const b = { ...binding, domainCommitment: field(poolIndex + 1) };
  const leaves = [...baseLeaves], root = new PrivateNoteTree(leaves).root;
  const roots = [new PrivateNoteTree().root, new PrivateNoteTree(leaves.slice(0, 1)).root, root];
  const statement = kind === 'recovery' ? { domainCommitment: b.domainCommitment, authorizationRoot: field(9),
    poolRoot: root.slice(2), reserveNullifier: b.reserveNullifier, recoveryCommitment: b.recoveryCommitment, settleBefore: b.settleBefore }
    : { domainCommitment: b.domainCommitment, authorizationRoot: field(9), evidenceState: field(40 + poolIndex),
      poolRoot: root.slice(2), reserveNullifier: b.reserveNullifier, outputs: [0, 1, 2, 3].map(i => hash('output' + i)),
      terminalTags: [0, 1, 2, 3].map(i => hash('tag' + i)), completionCommitments: [60, 61, 62, 63].map(field),
      validFrom: '80', validUntil: '100' };
  const outputs = kind === 'recovery' ? [b.recoveryCommitment] : statement.outputs, newLeaves = [...leaves, ...outputs.map(prefix)];
  const newRoot = new PrivateNoteTree(newLeaves).root, before = { timestamp: kind === 'recovery' ? '99' : '89', pools: [] },
    after = { timestamp: kind === 'recovery' ? '100' : '90', pools: [] };
  for (let i = 0; i < 2; i++) {
    const prior = poolRaw(identity.pools[i].scope, leaves, [prefix(b.inputNullifier)], roots, 2, 1, 1);
    const next = i === poolIndex ? poolRaw(identity.pools[i].scope, newLeaves, [prefix(b.inputNullifier), prefix(b.reserveNullifier)],
      [...roots, newRoot], 3, 0, 1 + outputs.length) : { ...prior };
    before.pools.push({ ...prior, rawHubState: hubRaw(i, 7, 4, 8, []) });
    after.pools.push({ ...next, rawHubState: hubRaw(i, 8, i === poolIndex ? 0 : 4, 4, kind === 'recovery' ? [] : statement.terminalTags) });
  }
  const words = decodeFlatWords(after.pools[poolIndex].rawState, 135);
  return { kind, statement, binding: b, poolIndex, identity, before, after, stateAdvanced: {
    address: identity.pools[poolIndex].address.slice(2), sequence: '3', root: newRoot,
    spent: words[1], leaves: newLeaves.length, consumed: 2,
  } };
}
function assetFixture(kind, poolIndex = 0, tokenPools = [true, true]) {
  const f = fixture(kind, poolIndex);
  f.identity = structuredClone(f.identity);
  for (let index = 0; index < 2; index++) {
    const token = tokenPools[index];
    f.identity.pools[index].asset = '0x' + (token ? String(index + 7).repeat(40) : '0'.repeat(40));
    for (const view of [f.before, f.after]) {
      const raw = view.pools[index];
      raw.assetBalance = '7'; raw.assetTotalSupply = token ? '1000' : null;
      // ERC20 backing is seven units while ETH is an unrelated donation.
      raw.nativeBalance = token ? String(11 + index) : '7';
      raw.rawBacking = changedWord(raw.rawBacking, 5, token ? raw.nativeBalance : 0);
    }
  }
  return f;
}
function packet(kind, statement) { return { proof: '11'.repeat(32), publicInputs: [...encodeStatement(kind, statement)] }; }
function calldata(kind, statement) {
  if (kind === 'recovery') return encodeFlatTransaction('recoverGeneric', packet(kind, statement));
  return encodeFlatTransaction('fulfillGeneric', { settlement: packet(kind, statement),
    completions: statement.completionCommitments.map(completionCommitment => packet('node', {
      domainCommitment: statement.domainCommitment, authorizationRoot: statement.authorizationRoot,
      evidenceState: statement.evidenceState, completionCommitment,
    })), healthFrom: '80', healthUntil: '99', healthSignatures: [0, 1, 2].map(index => ({
      signerIndex: String(index), v: '27', r: prefix(field(1)), s: prefix(field(1)),
    })) });
}
function changedWord(raw, index, value) { const words = decodeFlatWords(raw, (raw.length - 2) / 64); words[index] = prefix(field(value)); return abi(words); }

test('fake F41 and T138 calldata round-trip exactly, including every N32 and health argument', () => {
  for (const kind of ['recovery', 'settlement']) {
    const f = fixture(kind), data = calldata(kind, f.statement), parsed = decodeFlatTerminalCalldata(data);
    assert.equal(parsed.kind, kind); assert.deepEqual(parsed.statement, f.statement);
    assert.ok(Object.isFrozen(parsed.statement));
    assert.throws(() => decodeFlatTerminalCalldata(data + zero), /TRAILING/);
    assert.throws(() => decodeFlatTerminalCalldata(data.slice(0, -64)), /BOUNDS/);
    assert.throws(() => decodeFlatTerminalCalldata(data.slice(0, -1) + '\n'), /CALLDATA/);
    const wrongFirstOffset = data.slice(0, 10) + field(96) + data.slice(74);
    assert.throws(() => decodeFlatTerminalCalldata(wrongFirstOffset), /OFFSET/);
  }
  const f = fixture('settlement'), original = calldata('settlement', f.statement);
  const parsed = decodeFlatTerminalCalldata(original), changed = structuredClone(parsed.request);
  changed.completions[2].publicInputs[31] = String(Number(changed.completions[2].publicInputs[31]) + 1);
  assert.throws(() => encodeFlatTransaction('fulfillGeneric', changed), /COMPLETION_SLOT/);
  const substitute = { ...f.statement, reserveNullifier: hash('substitute') };
  assert.notDeepEqual(decodeFlatTerminalCalldata(calldata('settlement', substitute)).statement, f.statement);
});

test('fake historical F and T conserve both pools and all shared hub state on either selected pool', () => {
  for (const kind of ['recovery', 'settlement']) for (const index of [0, 1]) {
    const f = fixture(kind, index), result = inspectFlatTerminalDelta(f);
    assert.equal(result.after.sequence, '3'); assert.equal(result.after.backedAmount, '5');
    assert.equal(result.after.surplus, '2'); assert.equal(result.after.liveReservations, 0);
    assert.equal(result.outputs.length, kind === 'recovery' ? 1 : 4);
    assert.equal(result.hubSequenceAfter, '8'); assert.equal(result.classification, 'PURE_DELTA_CHECK_NOT_AUTHORITY');
  }
});

test('fake token and mixed-asset T/F deltas conserve actual units separately from unrelated ETH', () => {
  for (const kind of ['recovery', 'settlement']) for (const index of [0, 1]) {
    for (const tokens of [[true, true], [true, false], [false, true], [false, false]]) {
      const f = assetFixture(kind, index, tokens), result = inspectFlatTerminalDelta(f);
      assert.equal(result.before.actualAssetBalance, '7'); assert.equal(result.after.actualAssetBalance, '7');
      assert.equal(result.after.backedAmount, '5'); assert.equal(result.after.surplus, '2');
      assert.equal(result.before.unrelatedNative, tokens[index] ? String(11 + index) : '0');
      assert.equal(result.after.unrelatedNative, result.before.unrelatedNative);
      assert.equal(result.classification, 'PURE_DELTA_CHECK_NOT_AUTHORITY');
      assert.ok(Object.isFrozen(result.after));
    }
  }
});

test('fake ERC20 terminal snapshots require actual token balances even when ETH equals reported backing', () => {
  for (const kind of ['recovery', 'settlement']) for (const view of ['before', 'after']) {
    for (const index of [0, 1]) {
      const f = assetFixture(kind), raw = f[view].pools[index];
      delete raw.assetBalance;
      raw.nativeBalance = '7'; raw.rawBacking = changedWord(raw.rawBacking, 5, 7);
      assert.throws(() => inspectFlatTerminalDelta(f), /ASSET_BALANCE/);
    }
  }
});

test('fake actual-asset snapshots reject token/native substitution, supply drift and collateral edits', () => {
  for (const kind of ['recovery', 'settlement']) {
    const mutations = [
      [f => { f.after.pools[0].assetBalance = '8'; }, /ACTUAL_ASSET_BACKING/],
      [f => { f.after.pools[0].nativeBalance = '7'; }, /UNRELATED_NATIVE/],
      [f => { f.after.pools[0].assetTotalSupply = '6'; }, /ASSET_SUPPLY/],
      [f => { f.after.pools[0].assetTotalSupply = '1001'; }, /ASSET_SUPPLY_CHANGED/],
      [f => { f.after.pools[1].assetTotalSupply = '1001'; }, /ASSET_SUPPLY_CHANGED/],
      [f => { f.after.pools[0].assetBalance = '8'; f.after.pools[0].rawBacking = abi([3, 5, 8, 3, 0, 11]); }, /BACKING_CHANGED/],
      [f => { f.after.pools[0].nativeBalance = '12'; f.after.pools[0].rawBacking = abi([3, 5, 7, 2, 0, 12]); }, /BACKING_CHANGED/],
      [f => { f.after.pools[1].assetBalance = '8'; f.after.pools[1].rawBacking = abi([2, 5, 8, 3, 0, 12]); }, /OTHER_POOL_CHANGED/],
      [f => { f.after.pools[1].nativeBalance = '13'; f.after.pools[1].rawBacking = abi([2, 5, 7, 2, 0, 13]); }, /OTHER_POOL_CHANGED/],
    ];
    for (const [mutate, pattern] of mutations) {
      const f = assetFixture(kind); mutate(f); assert.throws(() => inspectFlatTerminalDelta(f), pattern);
    }
    for (const name of ['assetBalance', 'nativeBalance', 'assetTotalSupply']) {
      for (const value of [undefined, '', '07', '-1', '0x7', (1n << 256n).toString()]) {
        const f = assetFixture(kind); f.after.pools[0][name] = value;
        assert.throws(() => inspectFlatTerminalDelta(f), /ASSET_BALANCE|TERMINAL_INTEGER/);
      }
    }
    const native = assetFixture(kind, 0, [false, true]);
    native.after.pools[0].nativeBalance = '8';
    assert.throws(() => inspectFlatTerminalDelta(native), /NATIVE_BACKING/);
    const donation = assetFixture(kind, 0, [false, true]);
    donation.after.pools[0].rawBacking = changedWord(donation.after.pools[0].rawBacking, 5, 1);
    assert.throws(() => inspectFlatTerminalDelta(donation), /NATIVE_POOL/);
  }
});

test('fake F rejects substituted original nullifier, cutoff, output and late/early inclusion errors', () => {
  for (const [fieldName, value, pattern] of [['reserveNullifier', hash('wrong'), /ORIGINAL_NULLIFIER/],
    ['recoveryCommitment', hash('wrong'), /ORIGINAL_RECOVERY/], ['settleBefore', '99', /ORIGINAL_CUTOFF/]]) {
    const f = fixture('recovery'); f.statement[fieldName] = value; assert.throws(() => inspectFlatTerminalDelta(f), pattern);
  }
  const early = fixture('recovery'); early.before.timestamp = '97'; early.after.timestamp = '98';
  assert.throws(() => inspectFlatTerminalDelta(early), /RECOVERY_BEFORE_CUTOFF/);
  const late = fixture('settlement'); late.after.timestamp = '100';
  assert.throws(() => inspectFlatTerminalDelta(late), /SETTLEMENT_INCLUSION_TIME/);
  const widened = fixture('settlement'); widened.statement.validUntil = '101';
  assert.throws(() => inspectFlatTerminalDelta(widened), /SETTLEMENT_WINDOW/);
});

test('fake terminal deltas reject collateral pool edits, counter changes, backing drift and substituted events', () => {
  for (const kind of ['recovery', 'settlement']) {
    const mutations = [
      f => { f.after.pools[0].rawState = changedWord(f.after.pools[0].rawState, 6, 8); },
      f => { f.after.pools[0].rawBacking = abi([3, 5, 8, 3, 0, 0]); f.after.pools[0].nativeBalance = '8'; },
      f => { f.after.pools[0].rawBacking = abi([3, 6, 7, 1, 0, 0]); },
      f => { f.after.pools[0].rawBacking = abi([3, 5, 4, 0, 1, 0]); f.after.pools[0].nativeBalance = '4'; },
      f => { f.after.pools[1].rawState = changedWord(f.after.pools[1].rawState, 6, 2); },
      f => { f.stateAdvanced.sequence = '4'; },
      f => { f.stateAdvanced.leaves++; },
    ];
    for (const mutate of mutations) { const f = fixture(kind); mutate(f); assert.throws(() => inspectFlatTerminalDelta(f)); }
  }
});

test('independently valid fake pool snapshots still reject wrong ordered note/nullifier/history transitions', () => {
  for (const kind of ['recovery', 'settlement']) for (const mode of ['output', 'nullifier', 'history']) {
    const f = fixture(kind), old = f.after.pools[0], state = decodeFlatWords(old.rawState, 135);
    const commitments = state.slice(7, 7 + Number(BigInt(state[3]))), nullifiers = state.slice(71, 73);
    if (mode === 'output') commitments[commitments.length - 1] = prefix(hash('valid but different output'));
    if (mode === 'nullifier') nullifiers[1] = prefix(hash('valid but different nullifier'));
    const history = decodeFlatWords(f.before.pools[0].rawHistory, 68), count = Number(BigInt(history[2]));
    const roots = history.slice(3, 3 + count);
    if (mode === 'history') roots[1] = new PrivateNoteTree([prefix(hash('different historical note'))]).root;
    const root = new PrivateNoteTree(commitments).root; roots.push(root);
    f.after.pools[0] = { ...poolRaw(identity.pools[0].scope, commitments, nullifiers, roots, 3, 0,
      kind === 'recovery' ? 2 : 5), rawHubState: old.rawHubState };
    assert.throws(() => inspectFlatTerminalDelta(f), /EXACT_OUTPUT_APPEND|EXACT_NULLIFIER_APPEND|EXACT_ROOT_HISTORY/);
  }
});

test('fake hub snapshots reject changed domain evidence, receipts, revocations, capacity, tags and sequence', () => {
  for (const kind of ['recovery', 'settlement']) for (const index of [0, 1]) {
    for (const [position, value] of [[1, 123], [2, 1], [6, 123], [8, 1], [9, 9], [10, 123], [11, 1], [12, 8], [13, 8], [14, 123]]) {
      const f = fixture(kind); f.after.pools[index].rawHubState = changedWord(f.after.pools[index].rawHubState, position, value);
      assert.throws(() => inspectFlatTerminalDelta(f));
    }
    const f = fixture(kind); f.after.pools[index].rawHubState = changedWord(f.after.pools[index].rawHubState, 78, 123);
    assert.throws(() => inspectFlatTerminalDelta(f), /PADDING|TAG_DIGEST/);
  }
});

test('fake observer facades and parser results cannot mint the actual owned observer', async () => {
  let calls = 0; const runtime = { health() { calls++; }, block() { calls++; } }, system = { pools: [{}, {}] };
  await assert.rejects(createFlatTerminalObserver({ runtime, system, poolIndex: 0 }), /OWNED_SYSTEM_CAPABILITY/);
  await assert.rejects(createFlatTerminalObserver({ runtime, system, poolIndex: 0, rpcUrl: 'forbidden' }), /EXACT_FIELDS/);
  assert.throws(() => assertOwnedFlatTerminalObserver(inspectFlatTerminalDelta(fixture('recovery')),
    { runtime, system, poolIndex: 0 }), /OWNED_OBSERVER/);
  assert.throws(() => assertOwnedFlatTerminalObserver(inspectFlatTerminalDelta(assetFixture('settlement')),
    { runtime, system, poolIndex: 0 }), /OWNED_OBSERVER/);
  assert.equal(calls, 0);
});
