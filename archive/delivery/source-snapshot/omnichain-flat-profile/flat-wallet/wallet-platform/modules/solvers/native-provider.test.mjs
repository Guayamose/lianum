/** HOST CUSTODY TESTS ONLY. Explicit synthetic capability/backend/gate mocks.
 * No node, native transfer, P/R proof or official WASM runs. The real Vault,
 * original quote/frame/hash helpers and real synthetic secp256k1 key do run.
 * node --experimental-test-module-mocks --test native-provider.test.mjs
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../../../../../omnichain-product/src/vault.mjs';
import { freshKey } from '../../../../../omnichain-product/src/private-note-encoding.mjs';
import { nativeAdmissionRulesTree, nativeDeliveryRiskCommitment, nativeDispatchStatementFrame,
  NATIVE_ADMISSION_LOSS_CLAUSE } from '../../../../../omnichain-product/src/paeg/native-admission.mjs';
import { nativeQuorumRegistryCommitment, NATIVE_QUORUM_PROFILE } from '../../../../../omnichain-product/src/evidence/native-quorum.mjs';
import { nativeTransferActionCommitment } from '../../../../../omnichain-product/src/paeg/native-capsules.mjs';
import { normalizeNativeDispatchBinding, createNativeDispatchJournal } from '../chain-adapters/native-dispatch-gate.mjs';
import { assertOwnedFlatSystem as actualSystemBrand } from '../ops/deploy-system.mjs';
import { assertOwnedFlatOperatorQuorum as actualQuorumBrand } from '../ops/native-operators.mjs';
import { assertOwnedBitcoinRuntime as actualBitcoinBrand } from '../chain-adapters/owned-bitcoin-runtime.mjs';
import { assertOwnedSolanaRuntime as actualSolanaBrand } from '../chain-adapters/owned-solana-runtime.mjs';
import { assertOwnedNativeRecipientProcess as actualRecipientBrand } from '../../../../../omnichain-product/src/paeg/native-recipient-process.mjs';

const systems = new WeakMap(), natives = new WeakSet(), quorums = new WeakMap(), recipients = new WeakSet();
const lifecycle = { verifierCreated: 0, verifierDisposed: 0, hashCreated: 0, hashDestroyed: 0, gateClosed: 0,
  execute: 0, reconcile: 0, health: 0, failGate: false, failExecute: false, badStatement: false };
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value), p = value => '0x' + value;
const fixtureModule = relative => new URL(relative, import.meta.url).href;
mock.module(fixtureModule('../ops/deploy-system.mjs'), { exports: {
  assertOwnedFlatSystem(runtime, system) { assert.equal(systems.get(system), runtime, 'TEST_OWNED_SYSTEM'); },
} });
mock.module(fixtureModule('../chain-adapters/local-evm-ownership.mjs'), { exports: {
  async assertLocalEvm(runtime) { assert.ok(runtime?.testOwnedRuntime, 'TEST_OWNED_EVM'); },
} });
for (const [file, symbol] of [['bitcoin', 'assertOwnedBitcoinRuntime'], ['solana', 'assertOwnedSolanaRuntime']])
  mock.module(fixtureModule('../chain-adapters/owned-' + file + '-runtime.mjs'), { exports: {
    [symbol](runtime) { assert.ok(natives.has(runtime), 'TEST_OWNED_NATIVE'); },
  } });
mock.module(fixtureModule('../ops/native-operators.mjs'), { exports: {
  assertOwnedFlatOperatorQuorum(quorum, binding) { assert.deepEqual(quorums.get(quorum), binding, 'TEST_OWNED_QUORUM'); },
} });
mock.module(fixtureModule('../../../../../omnichain-product/src/paeg/native-recipient-process.mjs'), { exports: {
  assertOwnedNativeRecipientProcess(recipient) { assert.ok(recipients.has(recipient), 'TEST_OWNED_RECIPIENT'); },
} });
mock.module(fixtureModule('../paeg/flat-system-state.mjs'), { exports: {
  async createFlatSystemStateReader({ system, poolIndex }) {
    const issued = new WeakSet(); return Object.freeze({
      async read() { const result = { domainCommitment: system.pools[poolIndex].domainCommitment.slice(2) };
        issued.add(result); return result; },
      async assertCurrent(view) { assert.ok(issued.has(view), 'TEST_MINTED_READ'); },
    });
  },
} });
mock.module(fixtureModule('../../../proof-workers/pinned-verifier.mjs'), { exports: {
  async createPinnedVerifier(role) { assert.equal(role, 'dispatch'); lifecycle.verifierCreated++;
    return Object.freeze({ async dispose() { lifecycle.verifierDisposed++; } }); },
} });
mock.module(fixtureModule('../../../proof-workers/tooling.mjs'), { exports: {
  resourceModuleURL: 'data:text/javascript,export function verifyToolchain(){return {barretenberg:"5.2.0"}}',
  async loadPinned(name) { assert.equal(name, '@aztec/bb.js'); return { BackendType: { Wasm: 'TEST_WASM_LABEL' },
    Barretenberg: { async new(options) {
      assert.deepEqual(options, { backend: 'TEST_WASM_LABEL', threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
      lifecycle.hashCreated++; return { async destroy() { lifecycle.hashDestroyed++; },
        async poseidon2Hash() { throw new Error('TEST_NEVER_HASH_OR_VERIFY'); } };
    } } }; },
} });
mock.module(fixtureModule('../chain-adapters/native-dispatch-gate.mjs'), { exports: {
  normalizeNativeDispatchBinding, createNativeDispatchJournal,
  async createNativeDispatchGate(config) {
    if (lifecycle.failGate) throw new Error('TEST_GATE_CREATE_FAILURE');
    const state = await config.store.load();
    return Object.freeze({ close() { lifecycle.gateClosed++; },
      async execute(request) {
        lifecycle.execute++;
        if (lifecycle.failExecute) throw new Error('TEST_GATE_EXECUTE_FAILURE');
        await config.healthReader.read({ pool: config.binding.pool, domainCommitment: sha('domain commitment') });
        const descriptor = { localCommitment: sha('local'), dispatchId: sha('dispatch'),
          actionCommitment: nativeTransferActionCommitment(request.action) };
        const signed = { nativeId: sha('native identity'), globalEffectId: sha('native gid') };
        const journal = { phase: 'NATIVE_SIGNED', signed, signedAt: '1200',
          intent: { readinessOpening: { descriptor }, readyStatement: sha('ready') } };
        await config.store.commit({ expectedRevision: state.revision, nextState: { ...state.state, journal } });
        const statement = { hubDomain: config.binding.domain.hubDomain, registryCommitment: config.binding.domain.registryCommitment,
          readyStatement: journal.intent.readyStatement, ...descriptor, globalEffectId: signed.globalEffectId,
          deliveryRiskCommitment: request.action.deliveryRiskCommitment, signedAt: lifecycle.badStatement ? '1201' : '1200' };
        const signature = await config.providerSigner.signDispatch(statement);
        // An exact internal repeat returns retained bytes, never new ECDSA.
        assert.equal(await config.providerSigner.signDispatch(statement), signature);
        return { ...signed, dispatchStatement: statement, dispatchSignature: signature, providerKey: config.providerSigner.publicKey };
      },
      async reconcile() { lifecycle.reconcile++; return { phase: 'OBSERVED', retainedOnly: true }; },
    });
  },
} });
const { createOwnedFlatNativeProvider } = await import('./native-provider.mjs');

async function fixture(family = '1') {
  const root = await mkdtemp(join(tmpdir(), 'flat-provider-host-test-')), directory = join(root, 'provider');
  await mkdir(directory, { mode: 0o700 });
  const runtime = Object.freeze({ testOwnedRuntime: true, metadata: Object.freeze({ scratchDirectory: root }) });
  const rule = { family, genesis: sha('test genesis'), asset: sha('native asset'), finalityKind: family,
    minimumConfirmations: family === '1' ? '6' : '0', maximumEvidenceLifetime: '300', maximumClockSkew: '30' };
  const ruleTree = nativeAdmissionRulesTree([rule]);
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: sha('hub'), registryEpoch: '1', rulesRoot: ruleTree.root,
    keys: Array.from({ length: 4 }, () => { const key = freshKey(); return { x: key.x.toString('hex'), y: key.y.toString('hex') }; }) };
  const domain = { scope: sha('scope'), policy: sha('policy'), asset: sha('pool asset'), hubDomain: registry.hubDomain,
    registryCommitment: nativeQuorumRegistryCommitment(registry), verifierSetCommitment: sha('verifier set'), ledgerNamespace: registry.hubDomain };
  const pool = { address: p(sha('pool').slice(0, 40)), domain, scope: p(domain.scope), policy: p(domain.policy),
    assetIdentity: p(domain.asset), domainCommitment: p(sha('domain commitment')) };
  const system = { pools: [pool, pool], registry, hubDomain: p(domain.hubDomain),
    registryCommitment: p(domain.registryCommitment), verifierSetCommitment: p(domain.verifierSetCommitment) };
  systems.set(system, runtime);
  const native = { family, genesis: rule.genesis, asset: rule.asset,
    sourceEndpoint: family === '1' ? '0014' + sha('source').slice(0, 40) : sha('source'),
    destinationEndpoint: family === '1' ? '0014' + sha('destination').slice(0, 40) : sha('destination'),
    changeEndpoint: family === '1' ? '0014' + sha('change').slice(0, 40) : null };
  const nativeRuntime = Object.freeze({ genesis: rule.genesis, genesisHex: p(rule.genesis),
    adapter({ asset, recipientIndex }) { assert.equal(asset, rule.asset); assert.equal(recipientIndex, 0);
      return Object.freeze({ binding: Object.freeze(native), transfer() { throw new Error('NO_NATIVE_EXECUTION'); },
        assertPrepared() { throw new Error('NO_NATIVE_EXECUTION'); }, observe() { throw new Error('NO_NATIVE_EXECUTION'); } }); },
  });
  natives.add(nativeRuntime);
  const operatorQuorum = Object.freeze({ async health({ poolIndex }) { assert.equal(poolIndex, 0); lifecycle.health++;
    return { message: { testOnly: true }, indexes: [0, 1, 2], signatures: ['test', 'test', 'test'], audits: [] }; } });
  quorums.set(operatorQuorum, { runtime, system, nativeRuntime, family });
  const config = { runtime, system, poolIndex: 0, nativeRuntime, operatorQuorum, rule, rulePath: ruleTree.paths[0],
    recipientIndex: 0, terms: { scope: domain.scope, policy: domain.policy, asset: domain.asset,
      amount: '50000', executionFrom: '1100', executionUntil: '1900', settleBefore: '2000' },
    acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE, directory, password: 'synthetic-host-test-password' };
  return { root, directory, config, domain, vault: new Vault(join(directory, 'native-provider.vault')),
    cleanup: () => rm(root, { recursive: true, force: true }) };
}
function acceptedQuote(f, provider) {
  const payoutCommitment = sha('payout'), deliveryRiskSalt = sha('risk salt');
  const action = { ...provider.offer().actionTemplate, receiptRho: sha('rho'), actionSalt: sha('action salt'), receiptKeyCommitment: sha('K') };
  action.deliveryRiskCommitment = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
    hubDomain: f.domain.hubDomain, registryCommitment: f.domain.registryCommitment, chainDomain: action.chainDomain,
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment, amount: action.amount,
    scope: f.domain.scope, policy: f.domain.policy, asset: f.domain.asset, payoutCommitment, settleBefore: action.settleBefore, salt: deliveryRiskSalt });
  const quote = { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(name => [name, f.domain[name]])),
    action, payoutCommitment, deliveryRiskSalt };
  const custody = Object.freeze({ async acceptedQuote() { return copy(quote); } }); recipients.add(custody);
  return { quote, custody };
}
function request(quote) { return { dependencyProof: {}, readyProof: {}, readinessOpening: {},
  action: quote.action, deliveryRiskSalt: quote.deliveryRiskSalt, receiptSpendSecret: sha('private spend secret') }; }
function counts() { return Object.fromEntries(['verifierCreated', 'verifierDisposed', 'hashCreated', 'hashDestroyed', 'gateClosed'].map(name => [name, lifecycle[name]])); }

test('actual production brand assertions reject copied capabilities', () => {
  assert.throws(() => actualSystemBrand({}, {}), /OWNED_SYSTEM/);
  assert.throws(() => actualBitcoinBrand({ adapter() {} }), /OWNED_RUNTIME/);
  assert.throws(() => actualSolanaBrand({ adapter() {} }), /OWNED_RUNTIME/);
  assert.throws(() => actualRecipientBrand({ acceptedQuote() {} }), /OWNED_PROCESS/);
  assert.throws(() => actualQuorumBrand({ health() {} }, { runtime: {}, system: {}, nativeRuntime: {}, family: '1' }), /OWNED_QUORUM/);
});

test('fresh custody is encrypted before an immutable offer; bound quote is exact and durable', async () => {
  const f = await fixture(); let provider;
  try {
    provider = await createOwnedFlatNativeProvider(f.config);
    const offer = provider.offer(), saved = await f.vault.read(f.config.password), raw = await readFile(f.vault.path, 'utf8');
    assert.deepEqual(saved.data.providerKey, offer.providerKey); assert.equal(saved.data.quote, null);
    assert.doesNotMatch(raw, /PRIVATE KEY|privateKeyPem|synthetic-host-test-password/);
    assert.ok(Object.isFrozen(offer.actionTemplate)); assert.throws(() => JSON.stringify(provider), /NOT_SERIALIZABLE/);
    for (const field of ['key', 'privateKey', 'password', 'sign', 'signDispatch', 'nativeAdapter', 'stateReader', 'healthReader']) assert.equal(provider[field], undefined);
    assert.throws(() => provider.bindQuote({ recipientCustody: { acceptedQuote() {} } }), /TEST_OWNED_RECIPIENT/);
    const { quote, custody } = acceptedQuote(f, provider);
    await provider.bindQuote({ recipientCustody: custody });
    const bound = await f.vault.read(f.config.password);
    assert.deepEqual(bound.data.quote, quote); assert.equal(bound.data.dispatch.revision, '0');
    assert.equal(bound.data.dispatch.state.journal, null);
    await provider.bindQuote({ recipientCustody: custody }); assert.deepEqual(await f.vault.read(f.config.password), bound);
    quote.action.amount = '50001'; await assert.rejects(provider.bindQuote({ recipientCustody: custody }), /CHANGED_BINDING/);
    assert.deepEqual(await f.vault.read(f.config.password), bound);
    await assert.rejects(createOwnedFlatNativeProvider(f.config), error => error.code === 'VAULT_EXISTS');
  } finally { provider?.close(); await f.cleanup(); }
});

test('SOL binding, pinned operation lifecycle and one exact low-S provider frame', async () => {
  const f = await fixture('2'); let provider;
  try {
    const before = counts(); provider = await createOwnedFlatNativeProvider(f.config);
    const { quote, custody } = acceptedQuote(f, provider); await provider.bindQuote({ recipientCustody: custody });
    assert.deepEqual(counts(), before, 'offering and quote binding must start no backend');
    const result = await provider.execute(request(quote)), saved = await f.vault.read(f.config.password);
    assert.equal(saved.data.providerSigning.signature, result.dispatchSignature);
    assert.deepEqual(saved.data.providerSigning.statement, result.dispatchStatement);
    assert.equal(saved.data.dispatch.revision, '1');
    const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
      x: Buffer.from(result.providerKey.x, 'hex').toString('base64url'), y: Buffer.from(result.providerKey.y, 'hex').toString('base64url') } });
    assert.ok(verify('sha256', nativeDispatchStatementFrame(result.dispatchStatement),
      { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(result.dispatchSignature, 'hex')));
    assert.ok(BigInt('0x' + result.dispatchSignature.slice(64)) <= 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n / 2n);
    const encryptedState = JSON.stringify(saved.data); assert.ok(!encryptedState.includes(sha('private spend secret')));
    assert.deepEqual(counts(), Object.fromEntries(Object.entries(before).map(([name, value]) => [name, value + 1])));
    const executed = lifecycle.execute; assert.deepEqual(await provider.reconcile(), { phase: 'OBSERVED', retainedOnly: true });
    assert.equal(lifecycle.execute, executed); assert.equal(lifecycle.verifierCreated, lifecycle.verifierDisposed);
    assert.equal(lifecycle.hashCreated, lifecycle.hashDestroyed);
    provider.close(); assert.throws(() => provider.offer(), /CLOSED_OR_POISONED/);
  } finally { provider?.close(); await f.cleanup(); }
});

test('gate construction and operation failures always dispose temporary backends', async () => {
  const f = await fixture(); let provider;
  try {
    provider = await createOwnedFlatNativeProvider(f.config);
    const { quote, custody } = acceptedQuote(f, provider); await provider.bindQuote({ recipientCustody: custody });
    lifecycle.failGate = true; await assert.rejects(provider.execute(request(quote)), /TEST_GATE_CREATE_FAILURE/);
    lifecycle.failGate = false; lifecycle.failExecute = true;
    await assert.rejects(provider.execute(request(quote)), /TEST_GATE_EXECUTE_FAILURE/); lifecycle.failExecute = false;
    assert.equal(lifecycle.verifierCreated, lifecycle.verifierDisposed); assert.equal(lifecycle.hashCreated, lifecycle.hashDestroyed);
    assert.equal((await f.vault.read(f.config.password)).data.providerSigning, null);
  } finally { lifecycle.failGate = lifecycle.failExecute = false; provider?.close(); await f.cleanup(); }
});

test('a changed provider frame cannot reach signing and altered durable custody poisons the capability', async () => {
  const f = await fixture(); let provider;
  try {
    provider = await createOwnedFlatNativeProvider(f.config);
    const { quote, custody } = acceptedQuote(f, provider); await provider.bindQuote({ recipientCustody: custody });
    lifecycle.badStatement = true;
    await assert.rejects(provider.execute(request(quote)), /CHANGED_BINDING/); lifecycle.badStatement = false;
    assert.equal((await f.vault.read(f.config.password)).data.providerSigning, null);
    await writeFile(f.vault.path, 'corrupted encrypted custody', { mode: 0o600 });
    await assert.rejects(provider.reconcile(), /CUSTODY_UNAVAILABLE_OR_CHANGED/);
    assert.equal(provider.report().persistenceUncertain, true);
    assert.throws(() => provider.offer(), /CLOSED_OR_POISONED/);
  } finally { lifecycle.badStatement = false; provider?.close(); await f.cleanup(); }
});

test('bootstrap rejects unowned capabilities, expanded options and unsafe directories before creating custody', async () => {
  const f = await fixture();
  try {
    for (const changes of [{ system: {} }, { nativeRuntime: {} }, { operatorQuorum: {} }, { providerKey: {} },
      { healthReader: {} }, { verifier: {} }, { terms: { ...f.config.terms, amount: '01' } },
      { terms: { ...f.config.terms, scope: sha('other scope') } }, { acceptedLossClause: 'insurance' }])
      await assert.rejects(createOwnedFlatNativeProvider({ ...f.config, ...changes }));
    const outside = await mkdtemp(join(tmpdir(), 'flat-provider-outside-'));
    try { await assert.rejects(createOwnedFlatNativeProvider({ ...f.config, directory: outside }), /OWNED_SCRATCH/); }
    finally { await rm(outside, { recursive: true, force: true }); }
    await chmod(f.directory, 0o755);
    await assert.rejects(createOwnedFlatNativeProvider(f.config), /PRIVATE_DIRECTORY/); await chmod(f.directory, 0o700);
    await symlink(f.directory, join(f.root, 'link'));
    await assert.rejects(createOwnedFlatNativeProvider({ ...f.config, directory: join(f.root, 'link') }), /SYMLINK/);
    await assert.rejects(readFile(f.vault.path), error => error.code === 'ENOENT');
  } finally { await f.cleanup(); }
});
