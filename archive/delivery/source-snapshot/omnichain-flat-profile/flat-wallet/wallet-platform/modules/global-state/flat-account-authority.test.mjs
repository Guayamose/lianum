/** Explicit fake historical records and source boundaries only. These tests
 * start no owner child, native runtime, hash backend, compiler or proof worker. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PrivateNoteTree, privateSpentDigest } from '../../../../../omnichain-product/src/private-note-tree.mjs';
import { encodeWalletPoolInputs } from '../../../../../omnichain-product/src/private-wallet-note-encoding.mjs';
import { derivePrivateAssetIdentity } from '../../../../../omnichain-product/src/private-asset-runtime.mjs';
import { ownerDigest, flatOwnerSnapshot } from '../../../mobile-core/flat-owner-custody.mjs';
import { encodeStatement } from '../paeg/statements.mjs';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from '../paeg/transaction-codec.mjs';
import { flatAccountAsset, flatAccountGraphBinding, flatAccountCalldataHash, validateFlatAccountOwnerObservation, validateFlatManualGraphAdmissionTime }
  from './flat-account-validation.mjs';
import { createFlatAccountAuthority, assertOwnedFlatAccountAuthority, projectFlatAccountOwnerView } from './flat-account-authority.mjs';

const h = value => createHash('sha256').update('flat account test: ' + value).digest('hex');
const field = value => '00' + h(value).slice(2), ZERO = '0'.repeat(64), prefix = value => '0x' + value;
const word = value => typeof value === 'string' && value.startsWith('0x') ? value.slice(2).padStart(64, '0')
  : BigInt(value).toString(16).padStart(64, '0');
const words = values => '0x' + values.map(word).join('');
const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace']
  .map(name => [name, h(name)]));
domain.ledgerNamespace = domain.hubDomain;
domain.asset = derivePrivateAssetIdentity('31337', prefix('0'.repeat(40)), prefix(ZERO)).slice(2);
const identity = { pool: '12'.repeat(20), domain, domainCommitment: field('domain') };
const artifact = { evm: { methodIdentifiers: Object.fromEntries(Object.values(FLAT_TRANSACTION_METHODS)
  .map(value => [value.signature, value.selector])) } };
const proof = publicInputs => ({ proof: 'c0ffee'.padEnd(64, '0'), publicInputs });

function snapshot({ commitments = [], nullifiers = [], sequence = '0', reservations = 0, outputs = 0,
  backing = '0', roots, timestamp = '6000', blockHash = h('block-' + sequence) } = {}) {
  const root = new PrivateNoteTree(commitments).root; roots ??= [root];
  const count = Buffer.alloc(4); count.writeUInt32BE(roots.length);
  const padded = roots.concat(Array(65 - roots.length).fill(prefix(ZERO)));
  const history = prefix(createHash('sha256').update(Buffer.concat([Buffer.from([0x18]),
    Buffer.from(domain.scope, 'hex'), count, ...padded.map(value => Buffer.from(value.slice(2), 'hex'))])).digest('hex'));
  return { identitySHA256: ownerDigest(identity), blockHash, canonicalBlockHashBefore: blockHash,
    canonicalBlockHashAfter: blockHash, timestamp,
    rawState: words([root, privateSpentDigest(prefix(domain.scope), nullifiers), sequence, commitments.length,
      nullifiers.length, reservations, outputs, ...commitments, ...Array(64 - commitments.length).fill(prefix(ZERO)),
      ...nullifiers, ...Array(64 - nullifiers.length).fill(prefix(ZERO))]),
    rawHistory: words([sequence, history, roots.length, ...padded]), rawBacking: words([sequence, backing, backing, 0, 0, 0]) };
}
function depositFixture() {
  const statement = { scope: domain.scope, policy: domain.policy, epoch: '10', amount: '50000', output: h('deposit') };
  const publicInputs = encodeWalletPoolInputs('deposit_balance', statement), calldata = encodeFlatTransaction('depositBalance', proof(publicInputs));
  const before = snapshot(), first = flatOwnerSnapshot(before, identity);
  const commitments = [prefix(statement.output)], root = new PrivateNoteTree(commitments).root;
  const after = snapshot({ commitments, roots: [...first.roots, root], sequence: '1', outputs: 1, backing: '50000' });
  const state = flatOwnerSnapshot(after, identity).publicState, hash = h('transaction');
  const submission = { kind: 'deposit', calldata, calldataSHA256: flatAccountCalldataHash(calldata),
    publicInputs, statement, before, epoch: '10', transactionHash: hash, observation: null };
  const observation = { identitySHA256: ownerDigest(identity), transaction: { hash, to: identity.pool, value: '50000', calldata },
    receipt: { transactionHash: hash, blockHash: after.blockHash, status: 1 }, before, after,
    stateAdvanced: { address: identity.pool, transactionHash: hash, blockHash: after.blockHash,
      sequence: '1', root, spent: state.spentDigest, leaves: 1, consumed: 0 } };
  return { identity, artifact, submission, authorization: null, observation };
}
function preparedFixture() {
  const authorization = { domainCommitment: identity.domainCommitment, envelope: field('envelope') };
  const core = { value: { context: h('context'), reserveCommitment: h('reserve'), reserveNullifier: h('reserve-nf'), settleBefore: '7000' } };
  const common = { ...authorization, domain, core };
  return { authorization: proof(encodeStatement('authorization', authorization)), rolePackets: {
    reservation: { ...common, funding: { value: { inputCommitment: h('input'), inputNullifier: h('input-nf'),
      reserveCommitment: core.value.reserveCommitment, changeCommitment: h('change'),
      operationId: h('operation'), fundingNotBefore: '5900', fundingValidUntil: '6200' } } },
    recovery: { ...common, recovery: { value: { ...core.value, recoveryCommitment: h('recovery') } } },
    assembler: { ...common }, local: Array.from({ length: 4 }, () => ({ ...common })),
    dependency: Array.from({ length: 4 }, () => ({ ...common })),
  } };
}

function reservationFixture() {
  const deposit = depositFixture(), before = deposit.observation.after, first = flatOwnerSnapshot(before, identity);
  const authorization = { domainCommitment: identity.domainCommitment, envelope: field('envelope') };
  const statement = { ...authorization, inputRoot: first.publicState.root.slice(2), inputNullifier: h('source-nf'),
    reserveCommitment: h('reserve'), changeCommitment: h('change'), admissionTag: h('admission'),
    fundingNotBefore: '5900', fundingValidUntil: '6200' };
  const publicInputs = encodeStatement('reservation', statement), commitments = first.commitments.concat([
    prefix(statement.reserveCommitment), prefix(statement.changeCommitment)]), nullifiers = [prefix(statement.inputNullifier)];
  const root = new PrivateNoteTree(commitments).root;
  const calldata = encodeFlatTransaction('reserveGenericGuarded', { authorization: proof(encodeStatement('authorization', authorization)),
    reservation: proof(publicInputs), expectedSequence: '1', expectedPostRoot: root });
  const after = snapshot({ commitments, nullifiers, roots: [...first.roots, root], sequence: '2',
    reservations: 1, outputs: 1, backing: '50000' });
  const state = flatOwnerSnapshot(after, identity).publicState, hash = h('reservation-tx');
  return { identity, artifact, authorization, submission: { kind: 'reservation', calldata,
    calldataSHA256: flatAccountCalldataHash(calldata), publicInputs, statement, before,
    epoch: null, transactionHash: hash, observation: null },
  observation: { identitySHA256: ownerDigest(identity), transaction: { hash, to: identity.pool, value: '0', calldata },
    receipt: { transactionHash: hash, blockHash: after.blockHash, status: 1 }, before, after,
    stateAdvanced: { address: identity.pool, transactionHash: hash, blockHash: after.blockHash,
      sequence: '2', root, spent: state.spentDigest, leaves: 3, consumed: 1 } } };
}

function withdrawalFixture() {
  const deposit = depositFixture(), before = deposit.observation.after, first = flatOwnerSnapshot(before, identity);
  const statement = { scope: domain.scope, policy: domain.policy, epoch: '10', root: first.publicState.root.slice(2),
    nullifier: h('source-nf'), amount: '50000', recipient: '34'.repeat(20) };
  const publicInputs = encodeWalletPoolInputs('withdraw_balance', statement), calldata = encodeFlatTransaction('withdrawBalance', proof(publicInputs));
  const after = snapshot({ commitments: first.commitments, nullifiers: [prefix(statement.nullifier)],
    roots: first.roots, sequence: '2', outputs: 0, backing: '0' });
  const state = flatOwnerSnapshot(after, identity).publicState, hash = h('withdrawal-tx');
  return { identity, artifact, authorization: null, submission: { kind: 'withdraw_source', calldata,
    calldataSHA256: flatAccountCalldataHash(calldata), publicInputs, statement, before,
    epoch: '10', transactionHash: hash, observation: null },
  observation: { identitySHA256: ownerDigest(identity), transaction: { hash, to: identity.pool, value: '0', calldata },
    receipt: { transactionHash: hash, blockHash: after.blockHash, status: 1 }, before, after,
    stateAdvanced: { address: identity.pool, transactionHash: hash, blockHash: after.blockHash,
      sequence: '2', root: state.root, spent: state.spentDigest, leaves: 1, consumed: 1 },
    withdrawal: { address: identity.pool, transactionHash: hash, blockHash: after.blockHash,
      recipient: statement.recipient, amount: statement.amount, nullifier: statement.nullifier } } };
}

test('single native ETH registry binds real domain, pool code and genesis', () => {
  const input = { identity, chainId: '31337', genesis: h('genesis'), poolCodeHash: h('pool-code') };
  const asset = flatAccountAsset(input);
  assert.equal(asset.symbol, 'ETH'); assert.equal(asset.token, '0'.repeat(40));
  assert.equal(asset.pool, identity.pool); assert.equal(asset.codeHash, input.poolCodeHash);
  for (const changed of [{ genesis: h('other-genesis') }, { poolCodeHash: h('other-code') },
    { identity: { ...identity, domainCommitment: field('other-domain') } }])
    assert.notEqual(flatAccountAsset({ ...input, ...changed }).assetId, asset.assetId);
  assert.throws(() => flatAccountAsset({ ...input, poolCodeHash: 'alleged code' }));
});

test('public bootstrap cannot supply observer, proof authority or copied runtime capabilities', async () => {
  const input = { runtime: {}, system: {}, poolIndex: 0, owner: {}, nativeExecution: {},
    accountId: 'test-account', journalId: 'test-journal' };
  await assert.rejects(createFlatAccountAuthority(input), /FLAT_OWNED_SYSTEM_CAPABILITY_REQUIRED/);
  for (const key of ['observer', 'rpcURL', 'proofFactory', 'registry'])
    await assert.rejects(createFlatAccountAuthority({ ...input, [key]: {} }), /COMMITMENT_EXACT_FIELDS/);
  let invoked = false;
  const accessor = { ...input }; Object.defineProperty(accessor, 'owner', { enumerable: true,
    get() { invoked = true; return {}; } });
  await assert.rejects(createFlatAccountAuthority(accessor), /COMMITMENT_DATA_FIELDS/);
  assert.equal(invoked, false);
  assert.throws(() => assertOwnedFlatAccountAuthority({ authority: { execute: async () => true } }),
    /FLAT_ACCOUNT_OWNED_AUTHORITY_REQUIRED/);
});

test('graph binds exact U16, original packets, domain and reserve/recovery identities', () => {
  const prepared = preparedFixture(), binding = flatAccountGraphBinding(prepared, identity);
  assert.deepEqual(Object.keys(binding).sort(), ['domainCommitment', 'envelope', 'inputCommitment', 'inputNullifier',
    'reserveCommitment', 'reserveNullifier', 'changeCommitment', 'recoveryCommitment', 'settleBefore',
    'authorizationPublicInputsSHA256'].sort());
  assert.equal(binding.recoveryCommitment, h('recovery'));
  const mutate = change => { const input = structuredClone(prepared); change(input); assert.throws(() => flatAccountGraphBinding(input, identity)); };
  mutate(value => { value.authorization.inputs = { owner_witness: 'forbidden' }; });
  mutate(value => { value.rolePackets.local[1].envelope = field('foreign-envelope'); });
  mutate(value => { value.rolePackets.recovery.recovery.value.reserveNullifier = h('foreign-nf'); });
  mutate(value => { value.rolePackets.dependency.pop(); });
  mutate(value => { value.rawOwnerKey = h('forbidden'); });
});

test('D26 validates exact original owned observation and full backing delta', () => {
  const fixture = depositFixture(), result = validateFlatAccountOwnerObservation(fixture);
  assert.equal(result.transactionHash, fixture.submission.transactionHash);
  const mutate = change => { const input = structuredClone(fixture); change(input); assert.throws(() => validateFlatAccountOwnerObservation(input)); };
  mutate(value => { value.observation = { confirmed: true }; });
  mutate(value => { value.observation.transaction.hash = h('replacement-transaction'); });
  mutate(value => { value.observation.transaction.value = '49999'; });
  mutate(value => { value.observation.receipt.status = 0; });
  mutate(value => { value.submission.calldataSHA256 = h('replacement-calldata'); });
  mutate(value => { value.observation.after.rawBacking = words(['1', '50000', '50001', '1', '0', '0']); });
  mutate(value => { value.observation.stateAdvanced.transactionHash = h('replacement-event'); });
  mutate(value => { value.observation.after.timestamp = '6600'; });
});

test('cached confirmation is tied to the complete original historical observation', () => {
  const fixture = depositFixture(); fixture.submission.observation = structuredClone(fixture.observation);
  assert.ok(validateFlatAccountOwnerObservation(fixture));
  // A later head with the same visible leaf cannot replace the original block.
  fixture.observation.after.timestamp = '6001';
  assert.throws(() => validateFlatAccountOwnerObservation(fixture), /ORIGINAL_OBSERVATION_CHANGED/);
});

test('S58 binds the original U, guards, funding window and conserved backing', () => {
  const fixture = reservationFixture(); assert.ok(validateFlatAccountOwnerObservation(fixture));
  const mutate = change => { const input = structuredClone(fixture); change(input); assert.throws(() => validateFlatAccountOwnerObservation(input)); };
  mutate(value => { value.authorization.envelope = field('replacement-envelope'); });
  mutate(value => { value.observation.after.timestamp = '6200'; });
  mutate(value => { value.observation.after.rawBacking = words(['2', '49999', '49999', '0', '0', '0']); });
  mutate(value => { value.submission.before = snapshot(); });
});

test('W39 binds the retained exit recipient, value, nullifier and exact burn', () => {
  const fixture = withdrawalFixture(); assert.ok(validateFlatAccountOwnerObservation(fixture));
  const mutate = change => { const input = structuredClone(fixture); change(input); assert.throws(() => validateFlatAccountOwnerObservation(input)); };
  mutate(value => { value.observation.withdrawal.recipient = '56'.repeat(20); });
  mutate(value => { value.observation.withdrawal.amount = '49999'; });
  mutate(value => { value.observation.withdrawal.nullifier = h('replacement-nf'); });
  mutate(value => { value.observation.after.rawBacking = words(['2', '1', '1', '0', '0', '0']); });
});

test('source boundaries keep recovery read-only until the owned executor and forbid request injection', async () => {
  const source = await readFile(new URL('./flat-account-authority.mjs', import.meta.url), 'utf8');
  assert.match(source, /exactRecord\(input, \['runtime', 'system', 'poolIndex', 'owner', 'nativeExecution', 'accountId', 'journalId'\]\)/);
  assert.equal((source.match(/runtime\.send\(/g) ?? []).length, 1);
  assert.match(source, /await update\(ref, \{ submission \}\);[\s\S]*?owner\.owner\.bindSubmission/);
  assert.match(source, /dispatchLatched: true[\s\S]*?runtime\.send/);
  const reconcile = source.slice(source.indexOf('async function reconcileOriginal'), source.indexOf('async function recoverOriginal'));
  assert.doesNotMatch(reconcile, /\.execute\(|\.send\(/);
  const recover = source.slice(source.indexOf('async function recoverOriginal'), source.indexOf('async function unresolved'));
  assert.match(recover, /await confirmOwner\(ref, false\)/);
  assert.match(recover, /nativeExecution\.recover\(ref\)/);
  assert.doesNotMatch(recover, /owner\.owner\.|owner\.restart|\.send\(|createBalanceNote/);
  const graph = source.slice(source.indexOf('async function executeGraph'), source.indexOf('async function confirmTerminal'));
  assert.ok(graph.indexOf('await owner.suspend()') < graph.indexOf('nativeExecution.execute(ref)'));
  assert.doesNotMatch(source, /generic-balance-native-proofs|reserveInputs|refundInputs|authorizationInputs|owner_witness/);
});

function ownerViewFixture() {
  return { asset: { assetId: h('asset'), symbol: 'ETH', decimals: 18, privateMaterial: 'MUST_NOT_LEAVE' },
    current: { observed: { observedAt: 123456789, blockNumber: '12', blockHash: h('current-block'), timestamp: '7200' },
      balances: { available: '30000', reserved: '0', recovery: '20000', locked: '0' },
      backing: { held: '50000', liabilities: '50000', surplus: '0', deficit: '0' } },
    requests: [
      { requestId: 'deposit-request', kind: 'TOP_UP', state: 'CONFIRMED', disposition: 'APPLIED' },
      { requestId: 'fulfilled-request', kind: 'GRAPH', state: 'CONFIRMED', disposition: 'FULFILLED' },
      { requestId: 'recovered-request', kind: 'GRAPH', state: 'CONFIRMED', disposition: 'RECOVERED' },
      { requestId: 'unresolved-request', kind: 'GRAPH', state: 'UNRESOLVED', disposition: null },
    ] };
}

test('private owner projection distinguishes applied, fulfilled, recovered and unresolved requests', () => {
  const input = ownerViewFixture(), view = projectFlatAccountOwnerView(input);
  assert.equal(view.status, 'LIVE');
  assert.deepEqual(view.requests.map(value => value.disposition), ['APPLIED', 'FULFILLED', 'RECOVERED', null]);
  assert.deepEqual(view.balances, input.current.balances);
  assert.deepEqual(Object.keys(view).sort(), ['version', 'status', 'asset', 'observed', 'balances', 'backing', 'requests'].sort());
  assert.deepEqual(Object.keys(view.asset).sort(), ['assetId', 'symbol', 'decimals'].sort());
  for (const row of view.requests) assert.deepEqual(Object.keys(row).sort(), ['requestId', 'kind', 'state', 'disposition'].sort());
  assert.doesNotMatch(JSON.stringify(view), /MUST_NOT_LEAVE|ownerOperationRef|calldata|proof|secret|privateMaterial/);
  input.requests[1].disposition = 'APPLIED';
  assert.throws(() => projectFlatAccountOwnerView(input), /OWNER_VIEW_DISPOSITION/);
});

test('stale or unavailable owner view never preserves terminal success or fabricates zero balances', () => {
  const input = ownerViewFixture();
  input.requests[2] = { ...input.requests[2], state: 'STALE', disposition: null };
  let view = projectFlatAccountOwnerView(input);
  assert.equal(view.status, 'STALE'); assert.equal(view.requests[2].disposition, null);
  input.current = null; view = projectFlatAccountOwnerView(input);
  assert.equal(view.status, 'UNAVAILABLE'); assert.equal(view.observed, null);
  assert.equal(view.balances, null); assert.equal(view.backing, null);
  assert.deepEqual(view.requests.map(value => value.state), ['STALE', 'STALE', 'STALE', 'UNRESOLVED']);
  assert.ok(view.requests.every(value => value.disposition === null));
});

test('owner projection rejects action-derived recovery, hidden fields and deficient backing', () => {
  const mutate = change => { const input = ownerViewFixture(); change(input); assert.throws(() => projectFlatAccountOwnerView(input)); };
  mutate(value => { value.requests[3].disposition = 'RECOVERED'; });
  mutate(value => { value.requests[3].action = 'recover'; });
  mutate(value => { value.requests[1].ownerOperationRef = h('private-ref'); });
  mutate(value => { value.requests[0].disposition = 'FULFILLED'; });
  mutate(value => { value.current.backing.held = '49999'; });
  mutate(value => { value.current.backing.surplus = '1'; });
  mutate(value => { value.current.balances.available = '-1'; });
  mutate(value => { value.current.balances.recovery = '30001'; });
  mutate(value => { value.requests.push({ ...value.requests[0] }); });
});

test('owner presentation keeps token units separate and rejects normalized terminators', () => {
  const input = ownerViewFixture(); input.asset = { assetId: h('vault-share'), symbol: 'BLTV', decimals: 6 };
  assert.equal(projectFlatAccountOwnerView(input).asset.symbol, 'BLTV');
  for (const suffix of ['\n', '\r\n']) {
    const amount = structuredClone(input); amount.current.balances.available += suffix;
    assert.throws(() => projectFlatAccountOwnerView(amount), /OWNER_VIEW_AMOUNT/);
    const request = structuredClone(input); request.requests[0].requestId += suffix;
    assert.throws(() => projectFlatAccountOwnerView(request), /OWNER_VIEW_REQUEST_ID/);
  }
});

test('token registry cannot substitute a native kind, token or code hash', () => {
  const token = '23'.repeat(20), codeHash = h('token-code');
  const tokenIdentity = { ...identity, domain: { ...identity.domain,
    asset: derivePrivateAssetIdentity('31337', prefix(token), prefix(codeHash)).slice(2) },
  assetBinding: { token, codeHash } };
  const metadata = { kind: 'ERC20', address: prefix(token), codeHash: prefix(codeHash), symbol: 'PALT', decimals: 6 };
  const input = { identity: tokenIdentity, chainId: '31337', genesis: h('genesis'),
    poolCodeHash: h('pool-code'), assetMetadata: metadata };
  const asset = flatAccountAsset(input);
  assert.equal(asset.kind, 'ERC20'); assert.equal(asset.token, token); assert.equal(asset.codeHash, codeHash);
  assert.equal(asset.decimals, 6);
  const claim = flatAccountAsset({ ...input, assetMetadata: { ...metadata, symbol: 'cBTC', decimals: 8 } });
  assert.equal(claim.symbol, 'CBTC'); assert.equal(claim.kind, 'ERC20');
  assert.equal(claim.assetId, asset.assetId); assert.equal(claim.token, token);
  for (const change of [{ kind: 'NATIVE' }, { address: prefix('24'.repeat(20)) }, { codeHash: prefix(h('other-code')) }])
    assert.throws(() => flatAccountAsset({ ...input, assetMetadata: { ...metadata, ...change } }), /ASSET_/);
  assert.throws(() => flatAccountAsset({ ...input, assetMetadata: null }), /TOKEN_METADATA_REQUIRED/);
});

test('private owner producer revalidates original history without mutation or native reconciliation', async () => {
  const source = await readFile(new URL('./flat-account-authority.mjs', import.meta.url), 'utf8');
  const reader = source.slice(source.indexOf('async function readRetainedOwnerOutcome'), source.indexOf('const authority = Object.freeze'));
  assert.match(reader, /validateOutcome\(entry\.outcome, bound\)/);
  assert.match(reader, /observer\.readTransaction/);
  assert.match(reader, /validateFlatAccountOwnerObservation/);
  assert.match(reader, /ownerViewTerminalObserver\.observe/);
  assert.match(reader, /runtime\.checkReceipt\(receipt\)/);
  assert.match(reader, /runtime\.assertCanonical\(receipt\)/);
  assert.match(reader, /owner\.ownerView\.summary\(\)/);
  assert.match(reader, /summary\.observed\.blockHash, view\.head\.hash/);
  assert.match(reader, /reader\.assertCurrent\(view\)/);
  assert.match(reader, /if \(entries\[index\]\.outcome === null\) continue/);
  assert.doesNotMatch(reader, /nativeExecution\.|confirmOwner\(|confirmTerminal\(|await update\(|await write\(|\.send\(|\.prove\(|acknowledgeSubmitted/);
  assert.match(source, /ownerView: \(\) => exclusive\(privateOwnerView\)/);
});


test('manual graph admission is bounded by original owned-chain funding window and unchanged cutoff', () => {
  const original = Object.freeze({ fundingNotBefore: '1000', fundingValidUntil: '1800', executionUntil: '2000', settleBefore: '2100' });
  for (const timestamp of ['1000', '1799']) assert.doesNotThrow(() => validateFlatManualGraphAdmissionTime(original, timestamp));
  for (const timestamp of ['999', '1800', '2000', '2100', '999999'])
    assert.throws(() => validateFlatManualGraphAdmissionTime(original, timestamp), /PREPARATION_EXPIRED/);
  for (const terms of [{ ...original, fundingValidUntil: '2001' }, { ...original, settleBefore: '1999' },
    { ...original, executionUntil: '1799' }]) assert.throws(() => validateFlatManualGraphAdmissionTime(terms, '1200'), /WINDOW/);
  for (const timestamp of ['1200\n', '001200', '-1', Number(1200)])
    assert.throws(() => validateFlatManualGraphAdmissionTime(original, timestamp), /TIME/);
});
