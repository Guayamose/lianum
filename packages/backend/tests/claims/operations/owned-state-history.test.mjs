/** Isolated mocked host regression, not an owned deployment. Module mocks exist
 * only in this test process and establish no onchain/proof/runtime authority.
 * Run with --experimental-test-module-mocks. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimVerifierSetCommitment } from '@lianum/engine/claims/framing';
import { evmRuntimeCodeHash } from '../../../src/chains/evm/contracts/evm-code-hash.mjs';
import { decodeFlatWords } from '../../../src/execution/account/reconciliation/flat-system-state.mjs';

const h = text => createHash('sha256').update('mocked claim history/' + text).digest('hex'), p = value => '0x' + value;
const w = value => p(BigInt(value).toString(16).padStart(64, '0'));
const abi = values => '0x' + values.map(value => w(value).slice(2)).join('');
const code = '0x6000', codeHash = evmRuntimeCodeHash(code), ZERO = '0'.repeat(64);
let runtime, claims, current, controls, historicalAssertions = 0;
mock.module(new URL('../ops/deploy-native-claims.mjs', import.meta.url).href, { exports: {
  assertOwnedNativeClaimSystem(r, c) { assert.equal(r, runtime); assert.equal(c, claims); },
} });
mock.module(new URL('../ops/deploy-system.mjs', import.meta.url).href, { exports: {
  assertOwnedFlatSystem(r, s) { assert.equal(r, runtime); assert.equal(s, claims.flatSystem); },
} });
mock.module(new URL('../chain-adapters/local-evm-ownership.mjs', import.meta.url).href, { exports: {
  async assertLocalEvm(r) { assert.equal(r, runtime); },
} });
mock.module(new URL('../paeg/flat-system-state.mjs', import.meta.url).href, { exports: {
  decodeFlatWords,
  async createFlatSystemStateReader() {
    const originals = new WeakMap();
    const read = historical => {
      const flat = { header: { ...current }, head: { number: BigInt(current.number).toString(), hash: current.hash.slice(2), timestamp: BigInt(current.timestamp).toString() },
        state: { stateSequence: '2', receiptCount: '0' }, admissionRevocationState: '01' + h('revocation').slice(2), healthState: {},
        ledger: { tree: { leaves: [], count: 0 }, publicState: { leaves: 0, spent: 0, liveReservations: 0, outputCapacity: 0 } } };
      originals.set(flat, historical); return flat;
    };
    return { read: async () => read(false), readHistorical: async () => read(true),
      async assertCurrent(flat) { controls.flatCurrentChecks++; assert.equal(originals.get(flat), false); assert.equal(flat.header.hash, current.hash); },
      async assertCanonical(flat) { assert.ok(originals.has(flat)); historicalAssertions++; } };
  },
} });
const { createOwnedClaimObserver } = await import('../../../src/claims/operations/owned-state.mjs');

function fixture() {
  controls = { codeReads: 0, codeHook: null, flatCurrentChecks: 0, changedCode: false };
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key,
    type === 'address' ? h(key).slice(0, 40) : type === 'u256' ? '31337' : type === 'u8' ? '2'
      : type === 'u64' ? '7' : type === 'field32' ? '01' + h(key).slice(2) : h(key)]));
  const facade = (name, address, getters) => ({ address: p(address), codeHash, expectedCode: code,
    async call(signature, args) {
      assert.ok(Object.hasOwn(getters, signature), 'UNEXPECTED_MOCK_READ_' + name + '/' + signature);
      return typeof getters[signature] === 'function' ? getters[signature](args) : getters[signature];
    } });
  const authorityAddress = h('authority').slice(0, 40), codecAddress = h('codec').slice(0, 40), validationAddress = h('validation').slice(0, 40);
  const pins = ['CI51', 'CO42'].map((role, i) => ({ role: String(i), address: h(role).slice(0, 40), codeHash: codeHash.slice(2),
    width: i ? '42' : '51', sourceCommitment: h(role + '/source'), keyCommitment: h(role + '/key') }));
  Object.assign(config, { gatewayCodeHash: codeHash.slice(2), wrapperCodeHash: codeHash.slice(2), poolCodeHash: codeHash.slice(2), hubCodeHash: codeHash.slice(2),
    ledgerNamespace: config.hubDomain, claimVerifierSetCommitment: claimVerifierSetCommitment(pins) });
  const configurationCommitment = p(h('configuration')), payouts = [p(h('payout0')), p(h('payout1'))];
  current = { number: '0x1', hash: p(h('head1')), timestamp: '0x64' };
  runtime = { metadata: { chainId: '31337' },
    async block(tag) { return tag === '0x0' ? { number: '0x0', hash: p(config.evmGenesis), timestamp: '0x0' } : { ...current }; },
    async assertCanonical(header) { return header; }, async code() {
      controls.codeReads++; await controls.codeHook?.(); return controls.changedCode ? '0x6001' : code;
    } };
  const gateway = facade('gateway', config.gateway, {
    'claimConfiguration()': abi(CLAIM_CONFIG_SCHEMA.map(([key, type]) => type.startsWith('u') ? config[key] : p(config[key]))),
    'verifierConfiguration()': abi(pins.flatMap(pin => [p(pin.address), p(pin.codeHash), p(pin.sourceCommitment), p(pin.keyCommitment)])),
    ...Object.fromEntries(Object.entries({ claimDomain: p(claimDomainCommitment(config)), hub: w(p(config.hub)), pool: w(p(config.pool)),
      authority: w(p(authorityAddress)), authorityCodeHash: codeHash, codecCodeHash: codeHash, validationCodeHash: codeHash,
      configurationCommitment, custodyInventoryDomain: p(config.custodyInventoryDomain),
      nativeAssetKey: p(createHash('sha256').update(Buffer.from(w(config.nativeFamily).slice(2) + config.nativeGenesis, 'hex')).digest('hex')),
      isSealed: w(1), MAX_INTENTS: w(16), MAX_TICKETS: w(32) }).map(([key, value]) => [key + '()', value])),
    ...Object.fromEntries(['claimSequence', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees', 'activePayout',
      'intentCount', 'ticketCount', 'reservedRefundTickets', 'nextTicketNonce', 'liabilities'].map(key => [key + '()', w(0)])),
    'payoutEndpointCommitments(uint256)': ([index]) => payouts[index], 'intentHistory(uint256)': w(0), 'ticketHistory(uint256)': w(0),
  });
  Object.assign(gateway, { configurationCommitment, payoutEndpointCommitments: payouts });
  const wrapper = facade('wrapper', config.wrapper, { 'gateway()': w(p(config.gateway)), 'decimals()': w(9), 'totalSupply()': w(0) });
  const authority = facade('authority', authorityAddress, { 'hub()': w(p(config.hub)), 'isSealed()': w(1),
    'gateways(uint256)': ([index]) => w(index === 0 ? p(config.gateway) : 0), 'gatewayPool(address)': w(p(config.pool)),
    'gatewayCodeHash(address)': codeHash, 'gatewayConfiguration(address)': configurationCommitment,
    'reservedReceiptCapacity(address)': w(0), 'reservations(bytes32)': abi(Array(6).fill(0)), 'reservationOwner(bytes32)': w(0) });
  const pool = { address: p(config.pool), codeHash, domainCommitment: p(config.poolDomain), scope: p(config.scope), policy: p(config.policy),
    assetIdentity: p(config.wrapperAssetIdentity), asset: p(config.wrapper), assetCodeHash: codeHash };
  const hub = facade('hub', config.hub, { 'claimAuthority()': w(p(authorityAddress)), 'admissionNullifiers(bytes32)': w(0) });
  claims = { flatSystem: { hub, pools: [pool], hubDomain: p(config.hubDomain), ledgerNamespace: p(config.ledgerNamespace), registryCommitment: p(config.registryCommitment), registry: {} },
    gateways: [gateway], wrappers: [wrapper], authority, configs: [config], policies: [{}], nativeRuntimes: [{}], verifierPins: pins,
    verifiers: Object.fromEntries(['CI51', 'CO42'].map((role, i) => [role, facade(role, pins[i].address, {})])),
    libraries: { nativeClaimCodec: facade('codec', codecAddress, {}), nativeClaimValidation: facade('validation', validationAddress, {}) } };
}

test('a same-height historical observation never grants current signing or reservation authority', async () => {
  fixture(); const observer = await createOwnedClaimObserver({ runtime, claims });
  const live = await observer.read(), historical = await observer.readHistorical('0x1');
  assert.deepEqual(live.head, historical.head);
  await observer.assertCurrent(live); await observer.assertCanonical(historical);
  await assert.rejects(observer.assertCurrent(historical), /HISTORICAL_NOT_CURRENT/);
  await assert.rejects(observer.assertCurrent(structuredClone(live)), /OWN_VIEW_REQUIRED/);
  const query = { claimDomain: live.gateways[0].claimDomain, admissionN: h('absent N') };
  await assert.rejects(observer.readReservation(query, historical), /VIEW_MODE/);
  assert.equal(await observer.readHistoricalReservation(query, historical), null);
  current = { number: '0x2', hash: p(h('head2')), timestamp: '0x65' };
  await observer.assertCanonical(historical);
  await assert.rejects(observer.assertCurrent(live), /HEAD_CHANGED/);
  assert.ok(historicalAssertions > 0);
});

function barrier() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
function pinCodeCount() {
  return new Set([claims.authority, ...claims.gateways, ...claims.wrappers,
    ...Object.values(claims.verifiers), ...Object.values(claims.libraries)].map(record => record.address)).size;
}

test('overlapping original current views share only pending public pins and keep each pool/head check', async () => {
  fixture(); const observer = await createOwnedClaimObserver({ runtime, claims });
  const views = await Promise.all([observer.read(), observer.read(), observer.read()]);
  const entered = barrier(), release = barrier(), count = pinCodeCount();
  const before = { code: controls.codeReads, flat: controls.flatCurrentChecks };
  controls.codeHook = async () => {
    if (controls.codeReads === before.code + count) entered.resolve();
    await release.promise;
  };
  const after = [], calls = views.map((view, index) => observer.assertCurrent(view).then(() => after.push(index)));
  await entered.promise;
  assert.equal(controls.codeReads - before.code, count);
  assert.equal(controls.flatCurrentChecks - before.flat, views.length);
  assert.deepEqual(after, []);
  await assert.rejects(observer.assertCurrent(structuredClone(views[0])), /OWN_VIEW_REQUIRED/);
  assert.equal(controls.codeReads - before.code, count);
  release.resolve(); await Promise.all(calls);
  assert.deepEqual(after.sort(), [0, 1, 2]);
  // A completed successful check cannot authorize a later phase after a pin changes.
  controls.codeHook = null; controls.changedCode = true;
  await assert.rejects(observer.assertCurrent(views[0]), /CLAIM_STATE_CODE_CHANGED/);
  assert.equal(controls.codeReads - before.code, 2 * count);
});

test('a same-height head change never joins the old pending pins or masks stale views', async () => {
  fixture(); const observer = await createOwnedClaimObserver({ runtime, claims });
  const oldView = await observer.read(), release = barrier(), oldEntered = barrier(), bothEntered = barrier();
  const before = controls.codeReads, count = pinCodeCount();
  controls.codeHook = async () => {
    if (controls.codeReads === before + count) oldEntered.resolve();
    if (controls.codeReads === before + 2 * count) bothEntered.resolve();
    await release.promise;
  };
  const oldChecks = Promise.allSettled([observer.assertCurrent(oldView), observer.assertCurrent(oldView)]);
  await oldEntered.promise;
  current = { number: current.number, hash: p(h('head-replaced')), timestamp: '0x65' };
  const freshReading = observer.read();
  await bothEntered.promise;
  assert.equal(controls.codeReads - before, 2 * count);
  release.resolve();
  const fresh = await freshReading, rejected = await oldChecks;
  assert.ok(rejected.every(row => row.status === 'rejected' && /HEAD_CHANGED/.test(row.reason.message)));
  controls.codeHook = null;
  const settledReads = controls.codeReads;
  await assert.rejects(observer.assertCurrent(oldView), /HEAD_CHANGED/);
  assert.equal(controls.codeReads, settledReads);
  await observer.assertCurrent(fresh);
  assert.equal(controls.codeReads - settledReads, count);
});
