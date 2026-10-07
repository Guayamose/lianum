/** Synthetic read-only traces only. No owned runtime, compiler, signer, proof,
 * chain, deployment or actual encrypted adapter lifecycle is started here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
import { prepareVaultAction, encodeVaultCall, vaultActionCommitment, validateVaultReceipt,
  previewVaultDeposit, previewVaultRedeem, VAULT_TOPICS } from './backed-vault.mjs';
import { inspectBackedVaultTransition, inspectBackedVaultApproval, createOwnedBackedVault,
  assertOwnedBackedVault, assertOwnedBackedVaultReceipt, ownedBackedVaultBinding } from './owned-backed-vault.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const h = value => sha('EXPLICITLY SYNTHETIC OWNED VAULT TEST ' + value);
const address = value => h(value).slice(0, 40), w = value => BigInt(value).toString(16).padStart(64, '0');
const aw = value => value.padStart(64, '0'), clone = value => structuredClone(value);
const code = '0x60006000', owner = address('owner');
const identity = { chainId: '31337', genesisHash: h('genesis'), domain: h('domain'), runtimeId: h('runtime'),
  asset: address('asset'), vault: address('vault'), assetCodeSHA256: sha(Buffer.from(code.slice(2), 'hex')),
  vaultCodeSHA256: sha(Buffer.from(code.slice(2), 'hex')) };
const deployment = { identity, assetSupply: '10000', asset: { transactionHash: h('asset creation'), runtimeCode: code },
  vault: { transactionHash: h('vault creation'), runtimeCode: code } };
const log = (contract, topics, data, index) => ({ address: contract, topics, data, logIndex: String(index), removed: false });

function trace(kind = 'deposit', same = false, donation = '0') {
  const receiver = same ? owner : address('receiver'), amount = '100';
  const quote = { blockNumber: '90', blockHash: h('quote'), blockTimestamp: '1000', totalAssets: '1000', totalShares: '1000' };
  const action = prepareVaultAction({ identity, kind, sender: owner, owner, receiver, amount,
    minimumOutput: kind === 'deposit' ? '50' : '99', deadline: '1200', nonce: h(kind), quote });
  const before = { snapshot: { ...quote, blockNumber: '91', blockHash: h('parent'), blockTimestamp: '1010',
    totalAssets: String(1000n + BigInt(donation)) }, assetSupply: '10000', senderAssets: '3000', receiverAssets: same ? '3000' : '2000',
    senderShares: '300', receiverShares: same ? '300' : '200', allowance: kind === 'deposit' ? amount : '35', usedNonce: '0' };
  const state = { totalAssets: before.snapshot.totalAssets, totalShares: before.snapshot.totalShares };
  const assets = kind === 'deposit' ? amount : previewVaultRedeem(amount, state);
  const shares = kind === 'deposit' ? previewVaultDeposit(amount, state) : amount;
  const after = clone(before); after.usedNonce = '1';
  after.snapshot = { blockNumber: '92', blockHash: h('included'), blockTimestamp: '1011',
    totalAssets: String(BigInt(state.totalAssets) + (kind === 'deposit' ? BigInt(assets) : -BigInt(assets))),
    totalShares: String(BigInt(state.totalShares) + (kind === 'deposit' ? BigInt(shares) : -BigInt(shares))) };
  if (kind === 'deposit') {
    after.senderAssets = String(BigInt(before.senderAssets) - BigInt(assets));
    after.receiverShares = String(BigInt(before.receiverShares) + BigInt(shares));
    after.allowance = '0';
    if (same) { after.receiverAssets = after.senderAssets; after.senderShares = after.receiverShares; }
  } else {
    after.receiverAssets = String(BigInt(before.receiverAssets) + BigInt(assets));
    after.senderShares = String(BigInt(before.senderShares) - BigInt(shares));
    if (same) { after.senderAssets = after.receiverAssets; after.receiverShares = after.senderShares; }
  }
  const t = VAULT_TOPICS.transfer, z = '0'.repeat(64);
  const logs = kind === 'deposit' ? [
    log(identity.asset, [t, aw(owner), aw(identity.vault)], w(assets), 0),
    log(identity.vault, [t, z, aw(receiver)], w(shares), 1),
    log(identity.vault, [VAULT_TOPICS.deposit, aw(owner), aw(receiver)], w(assets) + w(shares), 2),
  ] : [
    log(identity.vault, [t, aw(owner), z], w(shares), 0),
    log(identity.asset, [t, aw(identity.vault), aw(receiver)], w(assets), 1),
    log(identity.vault, [VAULT_TOPICS.withdraw, aw(owner), aw(receiver), aw(owner)], w(assets) + w(shares), 2),
  ];
  logs.push(log(identity.vault, [VAULT_TOPICS.action, vaultActionCommitment(action), action.nonce],
    [kind === 'deposit' ? 1 : 2, assets, shares, state.totalAssets, state.totalShares, after.snapshot.totalAssets, after.snapshot.totalShares].map(w).join(''), 3));
  const receipt = { identity, transactionHash: h('transaction'), blockNumber: '92', blockHash: h('included'), blockTimestamp: '1011',
    status: '1', from: owner, to: identity.vault, input: encodeVaultCall(action), logs };
  return { action, receipt, before, after, parentHash: before.snapshot.blockHash };
}

function approvalTrace() {
  const t = trace(); t.before.allowance = '999'; t.after = clone(t.before);
  t.after.snapshot = { ...t.before.snapshot, blockNumber: '92', blockHash: h('included'), blockTimestamp: '1011' };
  t.after.allowance = t.action.amount;
  t.receipt.to = identity.asset;
  t.receipt.input = '095ea7b3' + aw(identity.vault) + w(t.action.amount);
  t.receipt.logs = [log(identity.asset, [publicKeccak256(Buffer.from('Approval(address,address,uint256)')).toString('hex'),
    aw(owner), aw(identity.vault)], w(t.action.amount), 0)];
  return t;
}

for (const kind of ['deposit', 'redeem']) for (const same of [false, true]) {
  test(`${kind} checks complete supplied historical balances with ${same ? 'one' : 'two'} participants`, () => {
    const t = trace(kind, same, '250'), result = inspectBackedVaultTransition(t);
    assert.equal(result.privateSpendable, false);
    assert.equal(result.assurance, 'supplied-historical-state-consistency-only');
    assert.equal(result.assets, kind === 'deposit' ? '100' : '124');
    assert.equal(result.shares, kind === 'deposit' ? '80' : '100');
    assert.ok(Object.isFrozen(result.after.snapshot));
    assert.throws(() => assertOwnedBackedVaultReceipt({}, result), /OWNED_VAULT_RECEIPT_CAPABILITY_REQUIRED/);
  });
}

test('matched event amounts cannot replace actual backing, supply or participant deltas', () => {
  const mutations = [
    t => { t.before.snapshot.totalAssets = '999'; }, t => { t.before.snapshot.totalShares = '999'; },
    t => { t.after.snapshot.totalAssets = '1099'; }, t => { t.after.snapshot.totalShares = '1099'; },
    t => { t.after.senderAssets = '3000'; }, t => { t.after.receiverAssets = '1999'; },
    t => { t.after.senderShares = '301'; }, t => { t.after.receiverShares = '200'; },
    t => { t.after.assetSupply = '10001'; }, t => { t.before.assetSupply = '5000'; },
    t => { t.before.usedNonce = '1'; }, t => { t.after.usedNonce = '0'; },
    t => { t.before.allowance = String((1n << 256n) - 1n); }, t => { t.after.allowance = '1'; },
    t => { t.after.snapshot.blockHash = h('replacement'); }, t => { t.after.snapshot.blockNumber = '93'; },
    t => { t.before.snapshot.blockNumber = '90'; }, t => { t.parentHash = h('different parent'); },
    t => { t.before.snapshot.blockTimestamp = '1011'; }, t => { t.after.snapshot.blockTimestamp = '1012'; },
    t => { t.after.senderAssets = '2900\n'; }, t => { t.before.snapshot.blockHash = 'f'.repeat(63) + '\n'; },
  ];
  for (const change of mutations) {
    const t = trace(); change(t);
    // The original event-only codec is deliberately still satisfied here.
    assert.equal(validateVaultReceipt(t.receipt, t.action).privateSpendable, false);
    assert.throws(() => inspectBackedVaultTransition(t));
  }
});

test('redeem verifies owner burn, receiver assets, fixed allowance and conservation', () => {
  for (const change of [
    t => { t.after.senderShares = '300'; }, t => { t.after.receiverAssets = '2000'; },
    t => { t.after.receiverShares = '201'; }, t => { t.after.senderAssets = '3001'; },
    t => { t.after.allowance = '0'; }, t => { t.before.snapshot.totalShares = '199'; },
  ]) { const t = trace('redeem'); change(t); assert.throws(() => inspectBackedVaultTransition(t)); }
});

test('aliased recipients cannot carry inconsistent duplicate balance fields', () => {
  for (const kind of ['deposit', 'redeem']) for (const key of ['senderAssets', 'receiverAssets', 'senderShares', 'receiverShares']) {
    const t = trace(kind, true); t.after[key] = String(BigInt(t.after[key]) + 1n);
    assert.throws(() => inspectBackedVaultTransition(t));
  }
});

test('supplied traces reject alternate endpoints, authority flags, proxies and getters', () => {
  const t = trace();
  for (const extra of [{ rpc: 'http://localhost:1' }, { authorized: true }, { finality: true }])
    assert.throws(() => inspectBackedVaultTransition({ ...t, ...extra }));
  assert.throws(() => inspectBackedVaultTransition(new Proxy(t, {})), /COMMITMENT_PLAIN_RECORD/);
  const withGetter = { ...t };
  Object.defineProperty(withGetter, 'before', { enumerable: true, get() { throw Error('GETTER_EXECUTED'); } });
  assert.throws(() => inspectBackedVaultTransition(withGetter), /COMMITMENT_DATA_FIELDS/);
});

test('approval uses exact bounded amount and leaves all holdings, supply and nonce untouched', () => {
  const t = approvalTrace(), result = inspectBackedVaultApproval(t);
  assert.equal(result.amount, '100'); assert.equal(result.privateSpendable, false);
  assert.equal(t.receipt.input.slice(0, 8), '095ea7b3');
  for (const change of [
    t => { t.receipt.to = identity.vault; }, t => { t.receipt.from = address('other'); },
    t => { t.receipt.input = t.receipt.input.slice(0, -64) + w((1n << 256n) - 1n); },
    t => { t.after.allowance = '101'; }, t => { t.after.senderAssets = '2999'; },
    t => { t.after.senderShares = '301'; }, t => { t.after.usedNonce = '1'; },
    t => { t.after.snapshot.totalAssets = '1001'; }, t => { t.after.snapshot.totalShares = '1001'; },
    t => { t.receipt.logs.push(clone(t.receipt.logs[0])); }, t => { t.receipt.logs[0].removed = true; },
    t => { t.receipt.logs[0].topics[2] = aw(address('other spender')); },
    t => { t.receipt.logs[0].data = w(101); }, t => { t.receipt.status = '0'; },
  ]) { const t = approvalTrace(); change(t); assert.throws(() => inspectBackedVaultApproval(t)); }
  const r = approvalTrace(); r.action = trace('redeem').action;
  assert.throws(() => inspectBackedVaultApproval(r), /OWNED_VAULT_APPROVAL_DEPOSIT_ONLY/);
});

test('constructor never adopts runtime lookalikes, overridden transports or fabricated ownership', async () => {
  let touched = false;
  const runtime = { health() { touched = true; throw Error('UNTRUSTED_HEALTH'); }, send() { touched = true; } };
  const input = { runtime, deployment, sender: owner, receiver: address('receiver') };
  await assert.rejects(createOwnedBackedVault(input), /LOCAL_EVM_OWNED_CAPABILITY_REQUIRED/);
  assert.equal(touched, false);
  await assert.rejects(createOwnedBackedVault({ ...input, endpoint: 'http://localhost:1' }), /COMMITMENT_EXACT_FIELDS/);
  await assert.rejects(createOwnedBackedVault(input, {}), /OWNED_VAULT_BOOTSTRAP_ARGUMENTS/);
  const wrongPins = clone(deployment); wrongPins.asset.runtimeCode = '0x6001';
  await assert.rejects(createOwnedBackedVault({ ...input, deployment: wrongPins }), /OWNED_VAULT_CODE_PIN/);
  assert.throws(() => assertOwnedBackedVault(runtime, {}), /OWNED_VAULT_CAPABILITY_REQUIRED/);
  assert.throws(() => assertOwnedBackedVault(undefined, {}), /OWNED_VAULT_CAPABILITY_REQUIRED/);
  assert.throws(() => ownedBackedVaultBinding(runtime, {}), /OWNED_VAULT_CAPABILITY_REQUIRED/);
  assert.throws(() => assertOwnedBackedVaultReceipt({}, inspectBackedVaultTransition(trace())), /OWNED_VAULT_RECEIPT_CAPABILITY_REQUIRED/);
});
