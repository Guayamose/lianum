/** Explicit synthetic unit dependency seams only. No EVM, compiler, prover,
 * private custody keys or runtime signing. A fixed public ECDSA/RLP test
 * vector exercises the original wire codec. Runtime brands and the full
 * system reader have their separate tests; none of these fixtures are evidence.
 * Run with --experimental-test-module-mocks. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {join} from 'node:path';
import {signedDeliveryWire,TEST_EVM_SOLVER} from '../../../fixtures/chains/evm/transfers/test-fixtures/evm-delivery-wire.mjs';
import {decodeCanonicalEvmTransaction} from '../../../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import {resourceRoot} from '@lianum/environment';
import {DEVELOPMENT_EVM_BUILD_PIN} from '../../../../src/operations/deployments/system/development-evm-build.mjs';
import { PrivateNoteTree, privateSpentDigest } from '@lianum/engine/notes/private-note-tree';
import { derivePrivateAssetIdentity } from '@lianum/engine/notes/private-asset-runtime';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { flatOwnerIdentity, ownerDigest, validateFlatOwnerDepositIntentTransition } from '@lianum/custody/owner';
import { decodeDepositIntentInputs } from '@lianum/engine/execution/inputs/deposit-intent';
import { encodeEvmVaultDeliveryCall, evmVaultDeliveryDescriptorCommitment, EVM_VAULT_DELIVERY_TOPIC } from '@lianum/engine/encoding/evm-vault-delivery';

let current;
const sha = value => createHash('sha256').update(value).digest('hex');
const word = n => BigInt(n).toString(16).padStart(64, '0'), digest = n => word(n), address = n => word(n).slice(-40);
const prefix = value => '0x' + value, words = values => prefix(values.map(word).join('')), hex = n => '0x' + BigInt(n).toString(16);
const bare = value => value.slice(2), zero = word(0), selector = signature => publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
const brands = { runtimes: new WeakSet(), systems: new WeakMap(), routers: new WeakMap(), assets: new WeakSet() };
mock.module(new URL('../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs', import.meta.url).href, { exports: {
  LOCAL_EVM_PROFILE: { maxGas: 30000000 },
  async assertOwnedLocalEvmV2(runtime) { assert.ok(brands.runtimes.has(runtime), 'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED'); },
} });
mock.module(new URL('../../../../src/operations/deployments/system/deploy-system.mjs', import.meta.url).href, { exports: {
  assertOwnedFlatSystem(runtime, system) { assert.equal(brands.systems.get(system), runtime, 'FLAT_OWNED_SYSTEM_CAPABILITY_REQUIRED'); },
} });
mock.module(new URL('../../../../src/operations/deployments/defi/deploy-evm-vault-router.mjs', import.meta.url).href, { exports: {
  assertOwnedEvmVaultRouter(runtime, system, router) { assert.deepEqual(brands.routers.get(router), { runtime, system }, 'EVM_ROUTER_OWNED_CAPABILITY_REQUIRED'); },
} });
mock.module(new URL('../../../../src/chains/shared/contracts/owned-pool-asset.mjs', import.meta.url).href, { exports: {
  assertOwnedPoolAsset(runtime, capability) { assert.ok(brands.runtimes.has(runtime) && brands.assets.has(capability), 'OWNED_POOL_ASSET_CAPABILITY_REQUIRED'); },
} });
const decodeWords = (raw, count) => {
  assert.match(raw, /^0x[0-9a-f]*$/); assert.equal(raw.length, 2 + count * 64);
  return Array.from({ length: count }, (_, i) => prefix(raw.slice(2 + 64 * i, 66 + 64 * i)));
};
mock.module(new URL('../../../../src/execution/account/reconciliation/flat-system-state.mjs', import.meta.url).href, { exports: {
  decodeFlatWords: decodeWords,
  async createFlatSystemStateReader() { return {
    async read() { assert.ok(!current.badCurrentState, 'SYNTHETIC_CURRENT_SYSTEM_INVALID'); return { header: structuredClone(current.tip) }; },
    async assertCurrent(head) { assert.ok(!current.advanceHead, 'SYNTHETIC_HEAD_CHANGED'); assert.deepEqual(head.header, current.tip); },
  }; },
} });
const { createEvmVaultDeliveryObserver, assertOwnedEvmVaultDeliveryObserver, assertOwnedEvmVaultDeliveryObservation,
  assertOwnedEvmVaultDeliveryFacts } = await import('../../../../src/chains/evm/vault/evm-vault-delivery-observer.mjs');
// The current authenticated public rebuild is not the missing historical
// artifact and does not assert deployment, proof or financial acceptance.
const routerBytes=readFileSync(join(resourceRoot('wallet'),'.local/development-evm/v1/router/compiled.json'));
assert.equal(createHash('sha256').update(routerBytes).digest('hex'),DEVELOPMENT_EVM_BUILD_PIN.routerSHA256);
const artifact = JSON.parse(routerBytes)
  .contracts['PrivateVaultDeliveryRouter.sol'].PrivateVaultDeliveryRouter;

function snapshot(identity, after) {
  const commitments = after ? [prefix(digest(19))] : [], roots = [new PrivateNoteTree([]).root];
  const root = new PrivateNoteTree(commitments).root; if (after) roots.push(root);
  const padded = [...roots, ...Array(65 - roots.length).fill(prefix(zero))], count = Buffer.alloc(4); count.writeUInt32BE(roots.length);
  const spent = privateSpentDigest(prefix(identity.domain.scope), []);
  const history = prefix(sha(Buffer.concat([Buffer.from([0x18]), Buffer.from(identity.domain.scope, 'hex'), count,
    ...padded.map(value => Buffer.from(bare(value), 'hex'))])));
  return { root, spent, commitments, roots,
    rawState: words([root, spent, after ? 1 : 0, commitments.length, 0, 0, after ? 1 : 0,
      ...commitments, ...Array(64 - commitments.length).fill(0), ...Array(64).fill(0)]),
    rawHistory: words([after ? 1 : 0, history, roots.length, ...padded]),
    rawBacking: words([after ? 1 : 0, after ? 100 : 0, after ? 102 : 2, 2, 0, 6]) };
}
async function fixture() {
  const shareCodeHash = prefix(digest(55));
  const id = { chainId: '31337', genesisHash: digest(1), ledgerNamespace: digest(2), adapterVersion: '1',
    router: address(3), routerCodeSHA256: digest(4), routerVersion: '1', solver: TEST_EVM_SOLVER,
    asset: address(6), assetCodeSHA256: digest(7), assetIdentity: digest(8), vault: address(9),
    vaultCodeSHA256: digest(10), shareIdentity: bare(derivePrivateAssetIdentity(31337, prefix(address(9)), shareCodeHash)),
    vaultDomain: digest(12), vaultRuntimeId: digest(13), targetPool: address(14), targetPoolCodeSHA256: digest(15),
    targetDomain: digest(16), targetScope: digest(17), targetPolicy: digest(18) };
  const domain = { scope: id.targetScope, policy: id.targetPolicy, asset: id.shareIdentity, hubDomain: id.ledgerNamespace,
    registryCommitment: digest(60), verifierSetCommitment: digest(61), ledgerNamespace: id.ledgerNamespace };
  const identity = flatOwnerIdentity({ pool: id.targetPool, domain, domainCommitment: id.targetDomain,
    assetBinding: { token: id.vault, codeHash: bare(shareCodeHash) } });
  const limbs = x => x.match(/.{8}/g).map(x => x.padStart(64, '0'));
  const call = { descriptor: { identity: id, route: { assetAmount: '100', shareAmount: '100', executionFrom: '1000', executionUntil: '1100' },
    publicInputs: [...limbs(id.targetScope), ...limbs(id.targetPolicy), word(900), word(1200), word(100), ...limbs(digest(19))] },
    receiptKeyCommitment: digest(20), proof: 'deadbeef' };
  const vector=signedDeliveryWire(call,{nonce:'3',gas:'30000000'}), originalWire=decodeCanonicalEvmTransaction(prefix(vector.nativeWire));
  assert.equal(originalWire.from,prefix(TEST_EVM_SOLVER));
  const transactionHash = originalWire.nativeId, calldata = encodeEvmVaultDeliveryCall(call);
  const headers = { '0x0': { number: '0x0', hash: prefix(id.genesisHash), timestamp: hex(990), transactions: [] },
    '0xa': { number: '0xa', hash: prefix(digest(23)), parentHash: prefix(digest(24)), timestamp: hex(1000), transactions: [] },
    '0xb': { number: '0xb', hash: prefix(digest(22)), parentHash: prefix(digest(23)), timestamp: hex(1001), transactions: [transactionHash] } };
  const originalTransaction = { chainId: '31337', from: prefix(id.solver), to: prefix(id.router), nonce: '3',
    gasPrice: '1000000000', gas: '30000000', value: '0', data: calldata };
  const signed = { nativeId: transactionHash, nativeWire: originalWire.nativeWire, transactionSHA256: originalWire.transactionSHA256 };
  const before = snapshot(identity, false), after = snapshot(identity, true);
  const log = (target, topics, data, index) => ({ address: prefix(target), topics: topics.map(prefix), data: prefix(data), logIndex: hex(index),
    removed: false, transactionHash, blockHash: headers['0xb'].hash, blockNumber: '0xb', transactionIndex: '0x0' });
  const receipt = { transactionHash, from: originalTransaction.from, to: originalTransaction.to, status: '0x1', contractAddress: null,
    blockHash: headers['0xb'].hash, blockNumber: '0xb', transactionIndex: '0x0', gasUsed: '0x10000',
    logs: [log(id.router, [EVM_VAULT_DELIVERY_TOPIC, id.ledgerNamespace, call.receiptKeyCommitment,
      evmVaultDeliveryDescriptorCommitment(call.descriptor)], digest(19) + word(100), 0),
    log(id.targetPool, [publicKeccak256(Buffer.from('StateAdvanced(uint64,bytes32,bytes32,uint32,uint32)')).toString('hex'), word(1)],
      bare(after.root) + bare(after.spent) + word(1) + word(0), 1)] };
  const transaction = { hash: transactionHash, from: originalTransaction.from, to: originalTransaction.to, input: calldata,
    ...Object.fromEntries(['chainId', 'nonce', 'gasPrice', 'gas', 'value'].map(k => [k, hex(originalTransaction[k])])),
    blockHash: receipt.blockHash, blockNumber: receipt.blockNumber, transactionIndex: '0x0' };
  const entry = { label: 'gated EVM vault delivery', phase: 'mined', transactionHash, signed,
    request: { from: transaction.from, to: transaction.to, data: calldata, gas: hex(30000000), value: '0x0' }, senderNonce: '0x3', receipt,
    prepared: { genesis: prefix(id.genesisHash), transaction: structuredClone(originalTransaction), unsignedWire: originalWire.unsignedWire,
      head: { number: '0xa', hash: headers['0xa'].hash, timestamp: headers['0xa'].timestamp },
      funds: { targetCodeHash: prefix(digest(77)), balanceWei: '10000000000000000000', estimatedGas: '100000' } } };
  current = { originalTransaction, originalWire, transaction, receipt, entry, headers, tip: headers['0xb'], before, after,
    values: {}, reads: [], verified: [], nullTransaction: false, nullReceipt: false };
  const c = current;
  const pool = { address: prefix(id.targetPool), assetCodeHash: shareCodeHash, domain, asset: prefix(id.vault),
    async call(signature, args, at) {
      c.reads.push(['pool', signature, at]); const s = at === '0xa' ? before : after, a = at !== '0xa';
      const returns = { 'canonicalState()': s.rawState, 'canonicalRootHistory()': s.rawHistory, 'canonicalBacking()': s.rawBacking,
        'noteLeaves()': words([...s.commitments, ...Array(64 - s.commitments.length).fill(0)]),
        'authorizationRoot()': prefix(digest(25)), 'authorizationLeafCount()': words([0]), 'authorizationRootHistoryCount()': words([1]),
        'authorizationTreeNodes()': words(Array(128).fill(0)), 'authorizationRootHistory()': words([25, ...Array(64).fill(0)]),
        'insertedCommitments(bytes32)': words([a ? 1 : 0]) };
      assert.ok(Object.hasOwn(returns, signature), 'SYNTHETIC_UNEXPECTED_POOL_GETTER_' + signature);
      return c.values[at + signature] ?? returns[signature];
    } };
  const asset = { kind: 'ERC20', address: pool.asset, codeHash: shareCodeHash };
  const assetCapability = { metadata: asset, async read({ holder, blockNumber }) { return { metadata: asset, holder,
    blockNumber, blockHash: headers[blockNumber].hash, balance: blockNumber === '0xa' ? '2' : '102', totalSupply: blockNumber === '0xa' ? '1000' : '1100' }; } };
  Object.assign(pool, { assetMetadata: asset, assetCapability }); brands.assets.add(assetCapability);
  const runtime = {
    get transactions() { return structuredClone(c.entries ?? [entry]); },
    async signedTransaction(hash) { assert.equal(hash, transactionHash); return structuredClone(c.signed ?? signed); },
    async transaction() { return c.nullTransaction ? null : structuredClone(transaction); },
    async receipt() { return c.nullReceipt ? null : structuredClone(receipt); },
    async checkReceipt(value) { assert.deepEqual(value, receipt); assert.ok(!c.changedReceipt, 'SYNTHETIC_CHANGED_RECEIPT'); },
    async block(at = 'latest') { return structuredClone(at === 'latest' ? c.tip : headers[at]); },
    async assertCanonical(value) {
      assert.ok(!c.reorg || value.number === '0x0', 'LOCAL_EVM_CANONICAL_BLOCK_CHANGED'); const header = headers[value.number ?? value.blockNumber];
      assert.equal(value.hash ?? value.blockHash, header.hash); return structuredClone(header);
    },
    async nonce(holder, at) { assert.equal(holder, prefix(id.solver)); assert.ok(['latest', 'pending'].includes(at)); return c.nonce ?? 3n; },
    async balance(holder, at) { assert.ok([prefix(id.solver), prefix(id.router), pool.address].includes(holder));
      return holder === prefix(id.solver) ? 10000000000000000000n : holder === pool.address ? 6n : 4n; },
    async call({ to, data }, at) {
      c.reads.push(['rpc', to, data.slice(0, 10), at]); const a = at !== '0xa', args = decodeWords(prefix(data.slice(10)), (data.length - 10) / 64);
      const method = data.slice(2, 10);
      let value;
      if (to === prefix(id.router)) {
        if (method === selector('deliveryCount()')) value = a ? 1 : 0;
        else { assert.equal(method, selector('consumedReceiptKeys(bytes32)')); assert.deepEqual(args, [prefix(call.receiptKeyCommitment)]); value = a ? 1 : 0; }
      } else if (method === selector('totalSupply()')) value = to === prefix(id.asset) ? 20000 : a ? 1100 : 1000;
      else if (method === selector('totalAssets()')) value = a ? 1100 : 1000;
      else if (method === selector('balanceOf(address)')) {
        const holder = args[0].slice(-40);
        const balances = to === prefix(id.asset) ? { [id.solver]: a ? 9900 : 10000, [id.router]: 7, [id.vault]: a ? 1100 : 1000, [id.targetPool]: 5 }
          : { [id.solver]: 100, [id.router]: 3, [id.targetPool]: a ? 102 : 2 };
        assert.ok(Object.hasOwn(balances, holder)); value = balances[holder];
      } else { assert.equal(method, selector('allowance(address,address)')); value = to === prefix(id.asset) && args[0].slice(-40) === id.solver && !a ? 100 : 0; }
      return words([c.values[at + to + data] ?? value]);
    },
  };
  const system = { pools: [{}, pool], async verify(role, proof, inputs, at) {
    c.verified.push({ role, proof: proof.toString('hex'), inputs, at }); return !c.badProof;
  } };
  const router = { identity: id, address: prefix(id.router), artifact, destinationPoolIndex: 1, codeHash: prefix(digest(77)),
    async read(at = 'latest') { assert.ok(!c.badCode, 'EVM_ROUTER_COMPLETE_CODE'); assert.ok(!c.missingCreation, 'EVM_ROUTER_CREATION_HISTORY_MISSING');
      const header = at === 'latest' ? c.tip : headers[at]; return { identity: id, blockHash: header.hash }; } };
  brands.runtimes.add(runtime); brands.systems.set(system, runtime); brands.routers.set(router, { runtime, system });
  const observer = await createEvmVaultDeliveryObserver({ runtime, system, poolIndex: 1, router });
  return { c, runtime, system, router, observer, call, identity, query: { transactionHash: bare(transactionHash), calldataSHA256: sha(Buffer.from(calldata.slice(2), 'hex')) } };
}

test('exact owned dependency path returns compatible owner arrival and branded canonical facts', async () => {
  const f = await fixture(), o = await f.observer.observe(f.query), inputs = f.call.descriptor.publicInputs.map(x => BigInt(prefix(x)).toString());
  assert.equal(o.identitySHA256, ownerDigest(f.identity));
  assert.deepEqual(o.assetObservation.before, { blockHash: digest(23), poolBalance: '2', shareTotalSupply: '1000',
    vaultUnderlyingBalance: '1000', solverUnderlyingBalance: '10000', routerUnderlyingBalance: '7', routerShareBalance: '3' });
  assert.equal(o.assetObservation.after.routerShareBalance, '3'); assert.equal(o.assetObservation.after.poolBalance, '102');
  assert.equal(o.deliveryEvent.position, 0); assert.deepEqual(o.delivery.publicInputs, inputs);
  const operation = { kind: 'deposit_intent', proof: { proof: f.call.proof }, publicInputs: inputs,
    statement: decodeDepositIntentInputs(inputs), submission: f.query };
  const confirmation = validateFlatOwnerDepositIntentTransition(o, operation,
    { identity: f.identity, notes: { source: { commitment: digest(19), opening: { value: '100' } } } });
  assert.equal(confirmation.transactionHash, f.query.transactionHash);
  assertOwnedEvmVaultDeliveryObservation(o, { observer: f.observer });
  assertOwnedEvmVaultDeliveryObserver(f.observer, { runtime: f.runtime, system: f.system, poolIndex: 1 });
  assert.deepEqual(f.c.verified, [{ role: 'deposit_intent', proof: 'deadbeef', inputs, at: '0xa' }]);
  const facts = await f.observer.observeFacts(f.query);
  assertOwnedEvmVaultDeliveryFacts(facts, { observer: f.observer });
  assert.deepEqual(facts, { status: 'observed', genesis: digest(1), asset: f.call.descriptor.identity.shareIdentity, nativeWire: bare(f.c.originalWire.nativeWire),
    intent: f.call, blockId: digest(22), blockHeight: '11', finalityKind: '3', confirmations: '1',
    nativeContext: { observedTipId: digest(22), observedTipHeight: '11', transactionSlot: '0', parentSlot: '0', observedSlot: '0' } });
  assert.deepEqual(await f.observer.observe(f.query), o); assert.ok(Object.isFrozen(o.delivery.descriptor.identity));
  assert.throws(() => assertOwnedEvmVaultDeliveryObservation(structuredClone(o), { observer: f.observer }));
  assert.throws(() => assertOwnedEvmVaultDeliveryFacts(structuredClone(facts), { observer: f.observer }));
  assert.throws(() => assertOwnedEvmVaultDeliveryObserver({ ...f.observer }, { runtime: f.runtime, system: f.system, poolIndex: 1 }));
  assert.throws(() => assertOwnedEvmVaultDeliveryObserver(f.observer, { runtime: f.runtime, system: f.system, poolIndex: 0 }));
});
test('only original pending inclusion returns null; missing mined history and unowned hashes fail closed', async () => {
  const f = await fixture(); f.c.nullReceipt = true; f.c.nullTransaction = true;
  await assert.rejects(f.observer.observe(f.query), /MINED_HISTORY_MISSING/);
  f.c.entry.phase = 'uncertain-no-resend'; delete f.c.entry.receipt;
  assert.equal(await f.observer.observe(f.query), null);
  assert.deepEqual(await f.observer.observeFacts(f.query), { status: 'unknown', reason: 'EVM_DELIVERY_FACTS_UNOBSERVED' });
  f.c.entries = []; await assert.rejects(f.observer.observe(f.query), /ORIGINAL_SIGNED_JOURNAL/);
});
test('wire, sender, nonce, chain, prepared head, retained calldata and supplied callback substitutions fail', async () => {
  for (const mutate of [f => f.c.entry.signed.nativeWire = '0x00', f => f.c.entry.senderNonce = '0x4',
    f => f.c.entry.request.data += '00', f => f.c.transaction.from = prefix(address(66)),
    f => f.c.transaction.nonce = '0x4', f => f.c.transaction.chainId = '0x1',
    f => f.c.transaction.value = '0x1', f => f.c.transaction.input += '00',
    f => f.c.entry.prepared.head.hash = prefix(digest(66)), f => f.c.entry.prepared.funds.targetCodeHash = prefix(digest(66)),
    f => f.c.entry.prepared.transaction.to = prefix(address(66)), f => f.c.entry.label = 'legacy send',
    f => f.c.entries = [f.c.entry, f.c.entry]]) {
    const f = await fixture(); mutate(f); await assert.rejects(f.observer.observe(f.query));
  }
  const f = await fixture();
  for (const query of [{ ...f.query, calldataSHA256: digest(99) }, { ...f.query, verified: true },
    { ...f.query, callback: () => true }, { ...f.query, transactionHash: prefix(f.query.transactionHash) }])
    await assert.rejects(f.observer.observe(query));
});
test('receipt namespace/K/Q/event position, canonical history, proof, current code and latest-head races fail', async () => {
  for (const mutate of [f => f.c.receipt.status = '0x0', f => f.c.receipt.logs[0].topics[1] = prefix(digest(80)),
    f => f.c.receipt.logs[0].topics[2] = prefix(digest(80)), f => f.c.receipt.logs[0].topics[3] = prefix(digest(80)),
    f => f.c.receipt.logs[0].data = prefix(digest(80) + word(100)), f => f.c.receipt.logs.reverse(),
    f => f.c.receipt.logs[0].removed = true, f => f.c.receipt.logs[0].blockHash = prefix(digest(80)),
    f => f.c.headers['0xb'].transactions.push(prefix(digest(80))), f => f.c.headers['0xb'].parentHash = prefix(digest(80)),
    f => f.c.reorg = true, f => f.c.changedReceipt = true, f => f.c.badProof = true,
    f => f.c.badCode = true, f => f.c.missingCreation = true, f => f.c.badCurrentState = true, f => f.c.advanceHead = true]) {
    const f = await fixture(); mutate(f); await assert.rejects(f.observer.observe(f.query));
  }
});
test('block-end share debit, unresolved allowances, authorization mutation and fabricated pool balance fail', async () => {
  for (const mutate of [f => {
    const id = f.call.descriptor.identity;
    f.c.values['0xb' + prefix(id.vault) + prefix(selector('balanceOf(address)') + word(prefix(id.router)))] = 2;
  }, f => {
    const id = f.call.descriptor.identity;
    f.c.values['0xb' + prefix(id.asset) + prefix(selector('allowance(address,address)') + word(prefix(id.solver)) + word(prefix(id.router)))] = 1;
  }, f => f.c.values['0xbauthorizationTreeNodes()'] = words([1, ...Array(127).fill(0)]),
  f => f.c.after.rawBacking = words([1, 100, 103, 3, 0, 6])]) {
    const f = await fixture(); mutate(f); await assert.rejects(f.observer.observe(f.query));
  }
});
test('lookalike capability bootstrap refuses before reading attacker getters', async () => {
  let reads = 0; const fake = { get transactions() { reads++; throw new Error('GETTER'); } };
  await assert.rejects(createEvmVaultDeliveryObserver({ runtime: fake, system: {}, poolIndex: 1, router: {} }), /OWNED_CAPABILITY/);
  assert.equal(reads, 0);
  const f = await fixture();
  await assert.rejects(createEvmVaultDeliveryObserver({ runtime: f.runtime, system: f.system, poolIndex: 0, router: f.router }), /TARGET_POOL/);
  await assert.rejects(createEvmVaultDeliveryObserver({ runtime: f.runtime, system: f.system, poolIndex: 1, router: f.router, rpc: () => {} }), /EXACT_FIELDS/);
});
test('pre-sign check binds the same prepared head/call, exact resources and D27 before returning undefined', async () => {
  const f = await fixture(); f.c.tip = f.c.headers['0xa'];
  assert.equal(await f.observer.assertPrepared({ prepared: f.c.entry.prepared, intent: f.call }), undefined);
  assert.equal(f.c.verified.at(-1).at, '0xa'); assert.equal(f.c.verified.at(-1).proof, 'deadbeef');
  for (const mutate of [g => g.c.entry.prepared.transaction.to = prefix(address(99)),
    g => g.c.entry.prepared.transaction.data += '00', g => g.c.entry.prepared.transaction.value = '1',
    g => g.c.entry.prepared.head.hash = prefix(digest(99)), g => g.c.entry.prepared.funds.balanceWei = '1',
    g => g.c.entry.prepared.funds.estimatedGas = '30000001', g => g.c.nonce = 4n,
    g => g.c.badProof = true, g => g.c.badCode = true, g => g.c.advanceHead = true,
    g => { g.c.headers['0xa'].timestamp = hex(1099); g.c.entry.prepared.head.timestamp = hex(1099); },
    g => g.c.values['0xainsertedCommitments(bytes32)'] = words([1]),
    g => { const id = g.call.descriptor.identity;
      g.c.values['0xa' + prefix(id.asset) + prefix(selector('allowance(address,address)') + word(prefix(id.solver)) + word(prefix(id.router)))] = 99; },
    g => { const id = g.call.descriptor.identity;
      g.c.values['0xa' + prefix(id.asset) + prefix(selector('balanceOf(address)') + word(prefix(id.solver)))] = 99; }]) {
    const g = await fixture(); g.c.tip = g.c.headers['0xa']; mutate(g);
    await assert.rejects(g.observer.assertPrepared({ prepared: g.c.entry.prepared, intent: g.call }));
  }
});
test('facts adverse classification requires original signed identity and same-network observed contradiction', async () => {
  for (const [mutate, reason] of [[f => f.c.receipt.status = '0x0', 'EVM_DELIVERY_TRANSACTION_REVERTED'],
    [f => f.c.transaction.from = prefix(address(99)), 'EVM_DELIVERY_TRANSACTION_FROM'],
    [f => f.c.badCode = true, 'EVM_ROUTER_COMPLETE_CODE'],
    [f => f.c.badProof = true, 'EVM_DELIVERY_ORIGINAL_D27_PROOF'],
    [f => f.c.reorg = true, 'LOCAL_EVM_CANONICAL_BLOCK_CHANGED'],
    [f => f.c.receipt.logs[0].topics[1] = prefix(digest(99)), 'EVM_DELIVERY_EVENT_TOPICS']]) {
    const f = await fixture(); mutate(f);
    const facts = await f.observer.observeFacts(f.query);
    assert.deepEqual(facts, { status: 'adverse', reason }); assertOwnedEvmVaultDeliveryFacts(facts, { observer: f.observer });
    assert.deepEqual(await f.observer.observeDispatch(f.query), { status: 'adverse', nativeId: f.query.transactionHash, nativeWire: null });
  }
  for (const mutate of [f => f.c.entries = [], f => { f.c.nullReceipt = true; f.c.nullTransaction = true; },
    f => f.c.missingCreation = true, f => f.c.advanceHead = true, f => f.c.badCurrentState = true,
    f => f.c.headers['0x0'].hash = prefix(digest(99)),
    f => f.c.signed = { ...f.c.entry.signed, nativeWire: '0x00' }]) {
    const f = await fixture(); mutate(f);
    const facts = await f.observer.observeFacts(f.query);
    assert.equal(facts.status, 'unknown'); assert.match(facts.reason, /^[A-Z][A-Z0-9_]+$/);
    assert.deepEqual(await f.observer.observeDispatch(f.query), { status: 'unknown', nativeId: f.query.transactionHash, nativeWire: null });
  }
  const f = await fixture();
  assert.equal((await f.observer.observeFacts({ ...f.query, calldataSHA256: digest(99) })).status, 'unknown');
  assert.deepEqual(await f.observer.observeDispatch(f.query), { status: 'observed', nativeId: f.query.transactionHash, nativeWire: bare(f.c.originalWire.nativeWire) });
  f.c.entry.phase = 'uncertain-no-resend'; delete f.c.entry.receipt; f.c.nullReceipt = true; f.c.nullTransaction = true;
  assert.deepEqual(await f.observer.observeDispatch(f.query), { status: 'pending', nativeId: f.query.transactionHash, nativeWire: null });
});
