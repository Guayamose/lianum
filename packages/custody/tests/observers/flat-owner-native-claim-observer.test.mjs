/** Isolated synthetic journal/RPC regression. No node, proof, owner signing or
 * genuine deployment is used; mocked brands exist only in this test process.
 * Run with --experimental-test-module-mocks. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ownerCopy, ownerDigest, flatOwnerIdentity, FLAT_OWNER_CLAIM_HANDOFF_PROFILE } from '../../src/signing/flat-owner-custody.mjs';
import { decodeCanonicalEvmTransaction, assertSignedEvmTransaction } from '../../../backend/src/chains/evm/contracts/transaction-wire-codec.mjs';
import { evmRuntimeCodeHash } from '../../../backend/src/chains/evm/contracts/evm-code-hash.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, encodeClaimIngressInputs } from '@lianum/engine/claims/framing';
import { CLAIM_BACKING_FIELDS } from '@lianum/engine/claims/permits';
import { encodeNativeClaimIssueCall } from '@lianum/engine/claims/issue-call';
import { encodeDepositIntentInputs } from '@lianum/engine/execution/inputs/deposit-intent';
import { derivePrivateAssetIdentity } from '@lianum/engine/notes/private-asset-runtime';

let runtime, system, claims, claimObserver, flat, claimView;
mock.module(new URL('../../../backend/src/operations/deployments/system/deploy-system.mjs', import.meta.url).href, { exports: {
  assertOwnedFlatSystem(r, s) { assert.equal(r, runtime); assert.equal(s, system); },
} });
mock.module(new URL('../../../backend/src/operations/deployments/claims/deploy-native-claims.mjs', import.meta.url).href, { exports: {
  assertOwnedNativeClaimSystem(r, c) { assert.equal(r, runtime); assert.equal(c, claims); },
} });
mock.module(new URL('../../../backend/src/chains/evm/runtime/local-evm-ownership.mjs', import.meta.url).href, { exports: {
  async assertLocalEvm(r) { assert.equal(r, runtime); },
} });
mock.module(new URL('../../../backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs', import.meta.url).href, { exports: {
  assertSignedEvmTransaction,
  async assertOwnedLocalEvmV2(r) { assert.equal(r, runtime); },
} });
mock.module(new URL('../../../backend/src/chains/shared/contracts/owned-pool-asset.mjs', import.meta.url).href, { exports: {
  assertOwnedPoolAsset(r, cap) { assert.equal(r, runtime); assert.equal(cap, system.pools[0].assetCapability); },
} });
mock.module(new URL('../../../backend/src/execution/account/reconciliation/flat-system-state.mjs', import.meta.url).href, { exports: {
  decodeFlatWords() { throw Error('NOT_USED_BY_JOURNAL_FIXTURE'); },
  async createFlatSystemStateReader() { return { async read() { return flat; }, async assertCurrent(value) { assert.equal(value, flat); } }; },
} });
mock.module(new URL('../../../backend/src/claims/operations/owned-state.mjs', import.meta.url).href, { exports: {
  assertOwnedClaimObserver(o) { assert.equal(o, claimObserver); },
  ownedClaimObserverBindings(o) { assert.equal(o, claimObserver); return { runtime, system: claims }; },
} });
mock.module(new URL('../../src/signing/flat-owner-custody.mjs', import.meta.url).href, { exports: {
  ownerCopy, ownerDigest, flatOwnerIdentity, FLAT_OWNER_CLAIM_HANDOFF_PROFILE,
  flatOwnerSnapshot() { return { commitments: [] }; },
} });
const { createFlatOwnerNativeClaimObserver } = await import('../../../backend/src/custody/observers/flat-owner-native-claim-observer.mjs');
const h = text => createHash('sha256').update('offline issue fixture/' + text).digest('hex'), p = value => '0x' + value;
const w = value => p(BigInt(value).toString(16).padStart(64, '0'));
const code = '0x6000', codeHash = evmRuntimeCodeHash(code);
const numberBytes = value => { let raw = BigInt(value).toString(16); if (raw === '0') return Buffer.alloc(0); if (raw.length % 2) raw = '0' + raw; return Buffer.from(raw, 'hex'); };
function rlp(values) {
  const prefix = (length, base) => length < 56 ? Buffer.from([base + length])
    : Buffer.concat([Buffer.from([base + 55 + numberBytes(length).length]), numberBytes(length)]);
  if (Array.isArray(values)) { const body = Buffer.concat(values.map(rlp)); return Buffer.concat([prefix(body.length, 192), body]); }
  return values.length === 1 && values[0] < 128 ? values : Buffer.concat([prefix(values.length, 128), values]);
}

async function fixture() {
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key,
    type === 'address' ? h(key).slice(0, 40) : type === 'u256' ? '31337' : type === 'u8' ? '2'
      : type === 'u64' ? '7' : type === 'field32' ? '01' + h(key).slice(2) : h(key)]));
  Object.assign(config, { ledgerNamespace: config.hubDomain, gatewayCodeHash: codeHash.slice(2), wrapperCodeHash: codeHash.slice(2) });
  config.wrapperAssetIdentity = derivePrivateAssetIdentity(31337, p(config.wrapper), p(config.wrapperCodeHash)).slice(2);
  const domain = { scope: config.scope, policy: config.policy, asset: config.wrapperAssetIdentity, hubDomain: config.hubDomain,
    ledgerNamespace: config.ledgerNamespace, registryCommitment: config.registryCommitment, verifierSetCommitment: h('flat verifiers') };
  const identity = flatOwnerIdentity({ pool: config.pool, domain, domainCommitment: config.poolDomain,
    assetBinding: { token: config.wrapper, codeHash: config.wrapperCodeHash } });
  const statement = { scope: config.scope, policy: config.policy, validFrom: '1', validUntil: '30', amount: '99', output: h('Q') };
  const claimDomain = claimDomainCommitment(config), publicInputs = encodeDepositIntentInputs(statement), proof = 'cafe';
  const ingress = { claimDomain, outputQ: statement.output, admissionN: h('N'), refundDestination: h('refund'),
    admissionRevocationState: '01' + h('revocation').slice(2), ingressReceiptLeaf: '01' + h('receipt').slice(2), amountQ: '99', evidenceFrom: '1', evidenceUntil: '30' };
  const signatures = [0, 1, 2].map(i => ({ signerIndex: String(i), v: '27', r: p(h('r' + i)), s: p(h('s' + i)) }));
  const data = encodeNativeClaimIssueCall({ ownerProof: { proof: p(proof), inputs: publicInputs.map(w) },
    ingressProof: { proof: '0x1234', inputs: encodeClaimIngressInputs(ingress).map(w) },
    authorization: { permit: Object.fromEntries(CLAIM_BACKING_FIELDS.map(([key, type]) => [key, type === 'b32' ? p(h(key)) : '1'])),
      signatures, healthFrom: '1', healthUntil: '30', healthSignatures: signatures } });
  // Public mathematical signature fixture r=Gx,s=1. This recovers a matching
  // synthetic sender; no private account signs and no chain accepts these bytes.
  const nativeWire = '0x' + rlp([numberBytes(0), numberBytes(1000000000), numberBytes(50000), Buffer.from(config.gateway, 'hex'),
    numberBytes(0), Buffer.from(data.slice(2), 'hex'), numberBytes(35 + 2 * 31337),
    Buffer.from('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex'), Buffer.from([1])]).toString('hex');
  const wire = decodeCanonicalEvmTransaction(nativeWire), signed = { nativeWire, nativeId: wire.nativeId, transactionSHA256: wire.transactionSHA256 };
  const before = { number: '0x1', hash: p(h('before')), timestamp: '0x13' };
  const after = { number: '0x2', hash: p(h('after')), timestamp: '0x14', parentHash: before.hash, transactions: [wire.nativeId] };
  const entry = { transactionHash: wire.nativeId, phase: 'uncertain-no-resend', uncertaintyCause: 'original-signed-broadcast',
    request: { from: wire.from, to: wire.to, data, value: '0x0', gas: '0xc350' }, senderNonce: '0x0', signed,
    prepared: { genesis: p(config.evmGenesis), head: before, unsignedWire: wire.unsignedWire, funds: { targetCodeHash: codeHash },
      transaction: Object.fromEntries(['chainId', 'from', 'to', 'nonce', 'gasPrice', 'gas', 'value', 'data'].map(key => [key, wire[key]])) } };
  const control = { receipt: null, entries: [entry], status: { busy: false, uncertain: true } };
  runtime = { accounts: [wire.from], metadata: { chainId: '31337', evmGenesis: p(config.evmGenesis) },
    get transactions() { return structuredClone(control.entries); }, get mutationStatus() { return { ...control.status }; },
    async signedTransaction(hash) { assert.equal(hash, wire.nativeId); return structuredClone(signed); },
    async transaction() { return control.receipt === null ? null : { hash: wire.nativeId, from: wire.from, to: wire.to, input: data,
      ...Object.fromEntries(['chainId', 'nonce', 'gasPrice', 'gas', 'value'].map(key => [key, '0x' + BigInt(wire[key]).toString(16)])),
      blockHash: after.hash, blockNumber: after.number }; },
    async receipt() { return control.receipt; }, async checkReceipt(receipt) { assert.equal(receipt, control.receipt); },
    async assertCanonical(value) { const header = (value.blockNumber ?? value.number) === '0x1' ? before : after;
      assert.equal(value.blockHash ?? value.hash, header.hash); return header; }, async code() { return code; } };
  system = { pools: [{ address: p(config.pool), domain, domainCommitment: p(config.poolDomain), asset: p(config.wrapper), assetCodeHash: codeHash,
    assetCapability: { metadata: { kind: 'ERC20' } } }] };
  claims = { flatSystem: system, configs: [config], gateways: [{ address: p(config.gateway) }], wrappers: [{}] };
  flat = { header: after, head: { number: '2', hash: after.hash.slice(2), timestamp: '20' },
    poolObservation: { rawState: '', rawHistory: '', rawBacking: '' } };
  claimView = { head: flat.head, gateways: [{ claimDomain, intents: [{ id: claimIntentId({ claimDomain, outputQ: statement.output, amount: statement.amount }),
    state: '1', ...statement, revision: '1', proofHash: createHash('sha256').update(Buffer.from(proof, 'hex')).digest('hex') }] }] };
  claimObserver = { async read() { return claimView; }, async assertCurrent(value) { assert.equal(value, claimView); } };
  const observer = await createFlatOwnerNativeClaimObserver({ runtime, system, poolIndex: 0, claims, claimObserver });
  const query = { identitySHA256: ownerDigest(identity), claimDomain, handoffIdentitySHA256: h('handoff'), statement,
    proofSHA256: claimView.gateways[0].intents[0].proofHash, submission: null };
  query.intentIdentitySHA256 = ownerDigest({ profile: FLAT_OWNER_CLAIM_HANDOFF_PROFILE, identitySHA256: query.identitySHA256,
    claimDomain, scope: statement.scope, policy: statement.policy, amount: statement.amount, output: statement.output });
  const receipt = status => ({ transactionHash: wire.nativeId, blockHash: after.hash, blockNumber: after.number, transactionIndex: '0x0', status });
  return { observer, query, control, receipt, entry };
}

test('an offline issuance without an owner latch blocks renewal until the original signed transaction canonically reverted', async () => {
  const f = await fixture(); assert.equal(f.query.submission, null);
  await assert.rejects(f.observer.readNativeClaimIntent(f.query), /UNKNOWN_OFFLINE_ISSUE/);
  f.control.receipt = f.receipt('0x1');
  await assert.rejects(f.observer.readNativeClaimIntent(f.query), /NOT_REVERTED/);
  f.control.receipt = f.receipt('0x0');
  const observed = await f.observer.readNativeClaimIntent(f.query);
  assert.equal(observed.intent.status, 'ACTIVE_UNISSUED'); assert.equal(observed.submissionResolution, null);
  f.control.status.busy = true;
  await assert.rejects(f.observer.readNativeClaimIntent(f.query), /RUNTIME_BUSY/);
  f.control.status.busy = false;
  const unsigned = { ...f.entry }; delete unsigned.signed; delete unsigned.transactionHash;
  f.control.entries = [unsigned];
  await assert.rejects(f.observer.readNativeClaimIntent(f.query), /UNKNOWN_ISSUE_WIRE/);
  f.control.entries = [f.entry, { phase: 'uncertain-no-resend', request: { to: '0x' + 'ab'.repeat(20) } }];
  await assert.rejects(f.observer.readNativeClaimIntent(f.query), /RUNTIME_UNKNOWN/);
  f.control.entries = [{ ...f.entry, phase: 'mined-reverted' }];
  await assert.rejects(f.observer.readNativeClaimIntent(f.query), /UNRELATED_RUNTIME_UNKNOWN/);
  f.control.status.uncertain = false;
  f.control.entries = [{ ...f.entry, phase: 'reconciled-reverted' }];
  assert.equal((await f.observer.readNativeClaimIntent(f.query)).intent.status, 'ACTIVE_UNISSUED');
  f.control.entries = [];
  assert.equal((await f.observer.readNativeClaimIntent(f.query)).intent.status, 'ACTIVE_UNISSUED');
  f.control.status.uncertain = true;
  await assert.rejects(f.observer.readNativeClaimIntent(f.query), /UNRELATED_RUNTIME_UNKNOWN/);
});
