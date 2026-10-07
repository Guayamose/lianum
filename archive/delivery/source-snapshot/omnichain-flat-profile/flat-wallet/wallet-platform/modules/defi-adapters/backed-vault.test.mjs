/** Synthetic host-codec tests only. No deployment, EVM execution, transaction
 * signature, consensus, receipt inclusion or private proof is established. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateVaultIdentity, previewVaultDeposit, previewVaultRedeem, prepareVaultAction,
  encodeVaultAction, encodeVaultCall, vaultActionCommitment, observeVaultPosition,
  validateVaultReceipt, VAULT_ACTION_TAG, VAULT_TOPICS, VAULT_EXECUTE_SELECTOR, VAULT_LIMITS } from './backed-vault.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const h = label => sha('SYNTHETIC VAULT TEST ' + label);
const address = label => h(label).slice(0, 40);
const clone = value => structuredClone(value);
const w = value => BigInt(value).toString(16).padStart(64, '0');
const aw = value => value.padStart(64, '0');
const zero = '0'.repeat(40);
const owner = address('owner'), receiver = address('receiver');
const identity = { chainId: '31337', genesisHash: h('genesis'), domain: h('domain'), runtimeId: h('runtime'),
  asset: address('asset'), assetCodeSHA256: h('asset code'), vault: address('vault'), vaultCodeSHA256: h('vault code') };
const state = (totalAssets = '1000', totalShares = '1000') => ({ totalAssets, totalShares });
function action(kind = 'deposit', overrides = {}) {
  return prepareVaultAction({ identity: clone(identity), kind, sender: owner, owner, receiver,
    amount: '100', minimumOutput: '99', deadline: '1200', nonce: h('nonce ' + kind),
    quote: { blockNumber: '90', blockHash: h('quote block'), blockTimestamp: '1000', ...state() }, ...overrides });
}
function receipt(action, before = state()) {
  const deposit = action.kind === 'deposit';
  const assets = deposit ? action.amount : previewVaultRedeem(action.amount, before);
  const shares = deposit ? previewVaultDeposit(action.amount, before) : action.amount;
  const a = BigInt(before.totalAssets), s = BigInt(before.totalShares);
  const after = { totalAssets: String(deposit ? a + BigInt(assets) : a - BigInt(assets)),
    totalShares: String(deposit ? s + BigInt(shares) : s - BigInt(shares)) };
  const log = (contract, topics, words, index) => ({ address: contract, topics, data: words.join(''), logIndex: String(index), removed: false });
  const transfer = VAULT_TOPICS.transfer;
  const logs = deposit ? [
    log(identity.asset, [transfer, aw(owner), aw(identity.vault)], [w(assets)], 4),
    log(identity.vault, [transfer, aw(zero), aw(receiver)], [w(shares)], 5),
    log(identity.vault, [VAULT_TOPICS.deposit, aw(owner), aw(receiver)], [w(assets), w(shares)], 6),
  ] : [
    log(identity.vault, [transfer, aw(owner), aw(zero)], [w(shares)], 4),
    log(identity.asset, [transfer, aw(identity.vault), aw(receiver)], [w(assets)], 5),
    log(identity.vault, [VAULT_TOPICS.withdraw, aw(owner), aw(receiver), aw(owner)], [w(assets), w(shares)], 6),
  ];
  logs.push(log(identity.vault, [VAULT_TOPICS.action, vaultActionCommitment(action), action.nonce],
    [deposit ? 1 : 2, assets, shares, before.totalAssets, before.totalShares, after.totalAssets, after.totalShares].map(w), 7));
  return { identity: clone(identity), transactionHash: h('transaction'), blockNumber: '92', blockHash: h('included block'),
    blockTimestamp: '1050', status: '1', from: owner, to: identity.vault, input: encodeVaultCall(action), logs };
}

test('identity records exclude untrusted endpoint selectors and ambiguous address/code forms', () => {
  assert.deepEqual(validateVaultIdentity(identity), identity);
  for (const patch of [{ rpcUrl: 'http://localhost:1' }, { chainId: '1' }, { vault: identity.asset },
    { asset: '0x' + identity.asset }, { vaultCodeSHA256: '0'.repeat(64) }, { runtimeId: identity.runtimeId.toUpperCase() }])
    assert.throws(() => validateVaultIdentity({ ...identity, ...patch }));
});

test('ERC4626 output arithmetic rounds down and reflects only actual assets', () => {
  assert.equal(previewVaultDeposit('100', state('0', '0')), '100');
  assert.equal(previewVaultRedeem('100', state()), '100');
  assert.equal(previewVaultDeposit('100', state('1500', '1000')), '66');
  assert.equal(previewVaultRedeem('100', state('1500', '1000')), '149');
  assert.equal(previewVaultDeposit('1', state('1000000', '1')), '0');
  assert.equal(previewVaultRedeem('0', state('1234', '0')), '0');
});

test('exact backing and rounding conservation over many deposit/redemption quantities', () => {
  for (let backing = 0n; backing < 100n; backing += 7n) for (let supply = 0n; supply <= backing; supply += 3n) {
    for (let amount = 1n; amount <= 40n; amount += 9n) {
      const current = state(String(backing), String(supply));
      const minted = BigInt(previewVaultDeposit(String(amount), current));
      const afterDeposit = state(String(backing + amount), String(supply + minted));
      const redemption = BigInt(previewVaultRedeem(String(minted), afterDeposit));
      assert.ok(redemption <= amount, 'round-trip cannot create underlying');
      assert.ok(BigInt(previewVaultRedeem(String(supply + minted), afterDeposit)) <= backing + amount,
        'all real shares cannot redeem more than actual backing');
    }
  }
});

test('amounts are canonical bounded decimal integers, including newline rejection', () => {
  for (const value of [1, 1n, -1, '-1', '01', '+1', '1.0', '1e3', ' 1', '1\n', String(1n << 128n)])
    assert.throws(() => previewVaultDeposit(value, state()));
  assert.equal(previewVaultDeposit(VAULT_LIMITS.amount, state(VAULT_LIMITS.amount, VAULT_LIMITS.amount)), VAULT_LIMITS.amount);
});

test('zero outputs, foreign ownership, invalid slippage and stale windows cannot form actions', () => {
  const malformed = [ { owner: receiver }, { receiver: identity.vault }, { sender: identity.asset, owner: identity.asset },
    { amount: '0' }, { minimumOutput: '0' }, { minimumOutput: '101' }, { deadline: '1000' },
    { deadline: '1301' }, { nonce: '0'.repeat(64) }, { kind: 'borrow' }, { rpcUrl: 'http://localhost:1' },
    { quote: { blockNumber: '90', blockHash: h('quote'), blockTimestamp: '1000', ...state('1000000', '1') }, amount: '1' } ];
  for (const patch of malformed) assert.throws(() => action('deposit', patch));
  assert.throws(() => action('redeem', { amount: '1001' }));
  assert.throws(() => action('deposit', { quote: { blockNumber: '90', blockHash: h('quote'), blockTimestamp: '1000',
    ...state(VAULT_LIMITS.amount, VAULT_LIMITS.amount) } }));
});

test('action preimage is fixed static ABI and commits every identity, quote and spend field', () => {
  const a = action();
  const words = [VAULT_ACTION_TAG, w(31337), identity.genesisHash, identity.domain, identity.runtimeId,
    aw(identity.asset), identity.assetCodeSHA256, aw(identity.vault), identity.vaultCodeSHA256,
    w(1), aw(owner), aw(owner), aw(receiver), w(100), w(100), w(99), w(1200), a.nonce,
    w(90), a.quote.blockHash, w(1000), w(1000), w(1000)];
  assert.equal(encodeVaultAction(a), words.join(''));
  assert.equal(vaultActionCommitment(a), sha(Buffer.from(words.join(''), 'hex')));
  assert.equal(encodeVaultCall(a), VAULT_EXECUTE_SELECTOR + words.slice(9).join('') + vaultActionCommitment(a));
  for (const key of ['genesisHash', 'domain', 'runtimeId', 'assetCodeSHA256', 'vaultCodeSHA256']) {
    const changed = clone(a); changed.identity[key] = h('other ' + key);
    assert.notEqual(vaultActionCommitment(changed), vaultActionCommitment(a));
  }
  for (const key of ['asset', 'vault']) {
    const changed = clone(a); changed.identity[key] = address('other ' + key);
    assert.notEqual(vaultActionCommitment(changed), vaultActionCommitment(a));
  }
  for (const patch of [{ nonce: h('another nonce') }, { receiver: address('another recipient') },
    { deadline: '1199' }, { minimumOutput: '98' }, { amount: '101', previewOutput: '101' }])
    assert.notEqual(vaultActionCommitment({ ...a, ...patch }), vaultActionCommitment(a));
  for (const patch of [{ blockNumber: '89' }, { blockHash: h('other block') }, { blockTimestamp: '999' },
    { totalAssets: '999', totalShares: '999' }])
    assert.notEqual(vaultActionCommitment({ ...a, quote: { ...a.quote, ...patch } }), vaultActionCommitment(a));
  assert.throws(() => vaultActionCommitment({ ...a, previewOutput: '99' }));
});

test('record accessors, prototypes, proxies and surplus fields never execute as data', () => {
  const a = clone(action());
  const getter = { ...a }; Object.defineProperty(getter, 'amount', { enumerable: true, get() { throw Error('GETTER_EXECUTED'); } });
  assert.throws(() => encodeVaultAction(getter), /COMMITMENT_DATA_FIELDS/);
  assert.throws(() => encodeVaultAction(new Proxy(a, {})), /COMMITMENT_PLAIN_RECORD/);
  assert.throws(() => encodeVaultAction(Object.assign(Object.create({}), a)), /COMMITMENT_PLAIN_RECORD/);
  assert.throws(() => encodeVaultAction({ ...a, privateSpendable: true }));
  assert.ok(Object.isFrozen(action().quote));
});

test('position observations cannot claim private spendability or exceed real supply', () => {
  const input = { identity, owner, shares: '100', snapshot: { ...action().quote, ...state('1500', '1000') } };
  const result = observeVaultPosition(input);
  assert.equal(result.redeemableAssets, '149');
  assert.equal(result.privateSpendable, false);
  assert.equal(result.assurance, 'supplied-state-consistency-only');
  assert.ok(Object.isFrozen(result.identity));
  assert.throws(() => observeVaultPosition({ ...input, shares: '1001' }));
  assert.throws(() => observeVaultPosition({ ...input, privateSpendable: true }));
});

for (const kind of ['deposit', 'redeem']) {
  test(`${kind} receipt requires exact asset/share movements, standard event and action commitment`, () => {
    const a = action(kind), r = receipt(a), result = validateVaultReceipt(r, a);
    assert.equal(result.assets, '100'); assert.equal(result.shares, '100');
    assert.equal(result.privateSpendable, false);
    const mutations = [
      r => { r.status = '0'; }, r => { r.identity.assetCodeSHA256 = h('different code'); },
      r => { r.from = receiver; }, r => { r.to = identity.asset; }, r => { r.input += '00'; },
      r => { r.blockTimestamp = '1201'; }, r => { r.blockTimestamp = '999'; },
      r => { r.blockNumber = '90'; }, r => { r.blockNumber = '347'; },
      r => { r.logs[0].address = address('wrong token'); }, r => { r.logs[1].topics[2] = aw(address('wrong shares recipient')); },
      r => { r.logs[0].data = w(99); }, r => { r.logs[2].data = w(100) + w(99); },
      r => { r.logs[3].topics[1] = h('other action'); }, r => { r.logs[3].topics[2] = h('other nonce'); },
      r => { r.logs[3].data = r.logs[3].data.slice(0, -64) + w(123); },
      r => { r.logs[0].removed = true; }, r => { r.logs[1].logIndex = r.logs[0].logIndex; },
      r => { r.logs.push(clone(r.logs[0])); }, r => { r.logs[0].rpcUrl = 'http://localhost:1'; },
      r => { r.logs[0].topics = new Proxy(r.logs[0].topics, { get() { throw Error('PROXY_EXECUTED'); } }); },
    ];
    for (const change of mutations) {
      const changed = clone(r); change(changed);
      assert.throws(() => validateVaultReceipt(changed, a), error => error.code === 'ERR_ASSERTION');
    }
  });
}

test('execution-price drift is allowed only within the committed minimum output', () => {
  const a = action();
  assert.equal(validateVaultReceipt(receipt(a, state('1001', '1000')), a).shares, '99');
  assert.throws(() => validateVaultReceipt(receipt(a, state('1200', '1000')), a), /VAULT_EVENT_SLIPPAGE/);
  const r = action('redeem');
  assert.equal(validateVaultReceipt(receipt(r, state('1500', '1000')), r).assets, '149');
});
