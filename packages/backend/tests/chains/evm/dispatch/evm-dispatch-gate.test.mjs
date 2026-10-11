/** Synthetic private-capability routing tests only. No Anvil/compiler/prover.
 * The actual shared gate's P/R/state/journal tests are in native-dispatch-gate.
 * Here only its adapter invocation is mocked so the private request scope can
 * be inspected without launching any runtime or granting production brands. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { freshKey } from '@lianum/engine/notes/private-note-encoding';
import { nativeAdmissionRulesTree, nativeAdmissionChainDomain, nativeProviderIdentity, nativeDeliveryRiskCommitment,
  NATIVE_ADMISSION_LOSS_CLAUSE } from '@lianum/engine/execution/native/dispatch/native-admission';
import { nativeQuorumRegistryCommitment, NATIVE_QUORUM_PROFILE } from '@lianum/engine/evidence/native-quorum';
import { nativeCustodyCommitment } from '@lianum/engine/native/native-receipt-binding';
import { normalizeNativeDispatchBinding } from '../../../../src/chains/shared/dispatch/native-dispatch-gate.mjs';
import { evmVaultDeliveryDescriptorCommitment } from '@lianum/engine/encoding/evm-vault-delivery';
import { evmFundingEndpointCommitment } from '../../../../src/chains/evm/dispatch/evm-facts-binding.mjs';
import { decodeCanonicalEvmTransaction } from '../../../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import { LOCAL_EVM_PROFILE } from '../../../../src/chains/evm/runtime/local-evm-profiles.mjs';
import { assertOwnedLocalEvmV2 as actualRuntimeBrand } from '../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedEvmVaultDeliveryObserver as actualObserverBrand } from '../../../../src/chains/evm/vault/evm-vault-delivery-observer.mjs';
import { assertOwnedEvmVaultRouter as actualRouterBrand } from '../../../../src/operations/deployments/defi/deploy-evm-vault-router.mjs';
import { evmDeliveryFixture, signedDeliveryWire } from '../../../fixtures/chains/evm/transfers/test-fixtures/evm-delivery-wire.mjs';

const runtimes = new WeakSet(), systems = new WeakMap(), routers = new WeakMap(), observers = new WeakMap(), factsBrands = new WeakMap();
const fixtureModule = relative => new URL(relative, import.meta.url).href;
mock.module(fixtureModule('./owned-evm-v2-runtime.mjs'), { exports: { LOCAL_EVM_PROFILE,
  async assertOwnedLocalEvmV2(runtime) { assert.ok(runtimes.has(runtime), 'TEST_RUNTIME_BRAND'); } } });
mock.module(fixtureModule('../ops/deploy-system.mjs'), { exports: {
  assertOwnedFlatSystem(runtime, system) { assert.equal(systems.get(system), runtime, 'TEST_SYSTEM_BRAND'); } } });
mock.module(fixtureModule('../ops/deploy-evm-vault-router.mjs'), { exports: {
  assertOwnedEvmVaultRouter(runtime, system, router) { assert.deepEqual(routers.get(router), { runtime, system }, 'TEST_ROUTER_BRAND'); } } });
mock.module(fixtureModule('./evm-vault-delivery-observer.mjs'), { exports: {
  assertOwnedEvmVaultDeliveryObserver(observer, expected) { assert.deepEqual(observers.get(observer), expected, 'TEST_OBSERVER_BRAND'); },
  assertOwnedEvmVaultDeliveryFacts(facts, { observer }) { assert.equal(factsBrands.get(facts), observer, 'TEST_FACTS_BRAND'); },
} });
let control;
mock.module(fixtureModule('./native-dispatch-gate.mjs'), { exports: { normalizeNativeDispatchBinding,
  async createNativeDispatchGate(configuration) {
    const { nativeAdapter, binding } = configuration;
    control.events.push('original-gate-created'); control.adapter = nativeAdapter;
    return Object.freeze({
      async execute(request) {
        assert.deepEqual(request, { syntheticOriginalGateRequest: true }); control.events.push('original-gate-execute');
        return nativeAdapter.transfer({ amount: binding.quote.action.amount, wireKeyCommitment: binding.quote.action.receiptKeyCommitment }, {
          async beforeSign(prepared) {
            control.events.push('gate-before'); await nativeAdapter.assertPrepared(prepared);
            if (control.rejectBefore) throw control.rejection;
            control.events.push('source-final');
          },
          async onSigned(raw) { control.events.push('gate-signed'); assert.equal(raw.nativeWire, control.signed.nativeWire);
            if (control.rejectSigned) throw control.rejection; control.events.push('provider-durable'); },
        });
      },
      async reconcile() { return nativeAdapter.observe({ nativeId: control.signed.nativeId.slice(2) }); },
      report() { return { synthetic: true }; }, close() { control.events.push('closed'); },
    });
  },
} });
// A fresh URL also isolates this wrapper from any prior import through a legacy
// static runtime cycle. Production always imports the original fixed module.
const { createOwnedEvmVaultDispatchGate, assertOwnedEvmDispatchRequest } = await import('../../../../src/chains/evm/dispatch/evm-dispatch-gate.mjs?synthetic-scope-tests');
const sha = value => createHash('sha256').update(value).digest('hex'), p = value => '0x' + value;
const copy = value => structuredClone(value);
function point() { const key = freshKey(); return { x: key.x.toString('hex'), y: key.y.toString('hex') }; }
function fixture() {
  const f = evmDeliveryFixture('gate-wrapper'), id = f.intent.descriptor.identity, rules = nativeAdmissionRulesTree([f.rule]);
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: id.ledgerNamespace, registryEpoch: '1', rulesRoot: rules.root,
    keys: Array.from({ length: 4 }, point) };
  const domain = { scope: sha('source scope'), policy: sha('source policy'), asset: id.assetIdentity, hubDomain: id.ledgerNamespace,
    ledgerNamespace: id.ledgerNamespace, registryCommitment: nativeQuorumRegistryCommitment(registry), verifierSetCommitment: sha('verifiers') };
  const providerKey = point(), sourceCommitment = evmFundingEndpointCommitment({ genesis: f.rule.genesis, asset: f.rule.asset, address: id.solver }),
    destinationCommitment = evmVaultDeliveryDescriptorCommitment(f.intent.descriptor);
  const action = { chainDomain: nativeAdmissionChainDomain(f.rule), signerIdentity: nativeProviderIdentity(providerKey), sourceCommitment,
    destinationCommitment, amount: f.intent.descriptor.route.shareAmount, custodyKind: 1,
    custodyCommitment: nativeCustodyCommitment({ family: '3', genesis: f.rule.genesis, asset: f.rule.asset, sourceCommitment, destinationCommitment }),
    executionFrom: '900', executionUntil: '1100', settleBefore: '1300', receiptRho: sha('rho'), actionSalt: sha('salt'),
    receiptKeyCommitment: f.intent.receiptKeyCommitment };
  const payoutCommitment = sha('recipient PALT payout'), deliveryRiskSalt = sha('delivery risk');
  action.deliveryRiskCommitment = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE, hubDomain: domain.hubDomain,
    registryCommitment: domain.registryCommitment, chainDomain: action.chainDomain, sourceCommitment, destinationCommitment,
    amount: action.amount, scope: domain.scope, policy: domain.policy, asset: domain.asset, payoutCommitment,
    settleBefore: action.settleBefore, salt: deliveryRiskSalt });
  const binding = { domain, pool: sha('source pool').slice(0, 40), registry, rule: f.rule, rulePath: rules.paths[0], providerKey,
    native: { family: '3', genesis: f.rule.genesis, asset: f.rule.asset, sourceEndpoint: id.solver, destinationEndpoint: id.router,
      changeEndpoint: null, descriptor: f.intent.descriptor, depositProof: f.intent.proof },
    quote: { action, payoutCommitment, deliveryRiskSalt }, acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE };
  const signed = signedDeliveryWire(f.intent, { gas: String(LOCAL_EVM_PROFILE.maxGas) }), decoded = decodeCanonicalEvmTransaction(p(signed.nativeWire));
  const prepared = { genesis: p(f.rule.genesis), head: { number: '0x64', hash: p(sha('head')), timestamp: '0x3e8' },
    transaction: Object.fromEntries(['chainId', 'from', 'to', 'nonce', 'gasPrice', 'gas', 'value', 'data'].map(name => [name, decoded[name]])),
    unsignedWire: decoded.unsignedWire, funds: { balanceWei: '10000000000000000000', estimatedGas: '900000', targetCodeHash: p(sha('router')) } };
  control = { events: [], signs: 0, sends: 0, facts: 0, status: 'observed', rejection: new Error('TEST_EXACT_CALLBACK_REJECTION'),
    signed: { nativeWire: p(signed.nativeWire), nativeId: p(signed.nativeId), transactionSHA256: signed.transactionSHA256 } };
  const runtime = Object.freeze({ async dispatch(request) {
    control.request = request; const scope = assertOwnedEvmDispatchRequest(request, runtime);
    assert.throws(() => assertOwnedEvmDispatchRequest(request, runtime), /ALREADY_OPENED/);
    assert.equal(Object.keys(request).length, 0); assert.ok(Object.isFrozen(request));
    assert.deepEqual(scope.transaction, { from: p(id.solver), to: p(id.router), data: decoded.data, gas: '0x1c9c380', value: '0x0' });
    assert.ok(Object.isFrozen(scope.transaction)); await scope.beforeSign(prepared);
    control.events.push('native-key'); control.signs++; await scope.onSigned(control.signed);
    control.events.push('raw-broadcast'); control.sends++; return { nativeId: control.signed.nativeId, transactionSHA256: signed.transactionSHA256 };
  } }); runtimes.add(runtime);
  const system = { registry, pools: [{ address: p(binding.pool), domain }, { address: p(id.targetPool) }] }; systems.set(system, runtime);
  const router = Object.freeze({ identity: id, sourcePoolIndex: 0, destinationPoolIndex: 1 }); routers.set(router, { runtime, system });
  const observer = Object.freeze({ identity: id, binding: { genesis: f.rule.genesis, asset: f.rule.asset, sourceEndpoint: id.solver, destinationEndpoint: id.router },
    async assertPrepared(input) { assert.deepEqual(input, { prepared, intent: f.intent }); control.events.push('evm-fresh'); },
    async observeDispatch(query) { assert.deepEqual(query, { transactionHash: signed.nativeId, calldataSHA256: sha(Buffer.from(decoded.data.slice(2), 'hex')) });
      return { status: control.status, nativeId: signed.nativeId, nativeWire: control.status === 'observed' ? signed.nativeWire : null }; },
    async observeFacts() { control.facts++; const facts = { status: 'observed', genesis: f.rule.genesis, asset: f.rule.asset, nativeWire: signed.nativeWire, intent: f.intent };
      if (!control.unbrandedFacts) factsBrands.set(facts, observer); return facts; },
  }); observers.set(observer, { runtime, system, poolIndex: 1 });
  return { configuration: { runtime, system, router, observer, binding, hashFields() {}, verifier: {}, providerSigner: {},
    stateReader: {}, healthReader: {}, store: {} }, prepared, signed };
}

test('only original owned runtime/system/router/observer and exact closed bootstrap fields are accepted', async () => {
  await assert.rejects(actualRuntimeBrand({}), /OWNED_CAPABILITY/);
  assert.throws(() => actualRouterBrand({}, {}, {}), /OWNED_CAPABILITY/);
  assert.throws(() => actualObserverBrand({}, { runtime: {}, system: {}, poolIndex: 1 }), /OWNED_OBSERVER/);
  const f = fixture();
  for (const patch of [{ runtime: {} }, { system: {} }, { router: {} }, { observer: {} }, { nativeAdapter: {} }, { issueRequest() {} }])
    await assert.rejects(createOwnedEvmVaultDispatchGate({ ...f.configuration, ...patch }));
  assert.throws(() => assertOwnedEvmDispatchRequest({ transaction: {}, beforeSign() {}, onSigned() {} }, f.configuration.runtime), /ORIGINAL_SCOPED/);
});

test('private original-gate adapter opens one scoped request and preserves final-check/key/durability ordering', async () => {
  const f = fixture(), gate = await createOwnedEvmVaultDispatchGate(f.configuration);
  assert.deepEqual(Object.keys(gate), ['execute', 'reconcile', 'report', 'close']);
  const sent = await gate.execute({ syntheticOriginalGateRequest: true }); assert.equal(sent.nativeId, f.signed.nativeId);
  assert.deepEqual(control.events, ['original-gate-created', 'original-gate-execute', 'gate-before', 'evm-fresh', 'source-final',
    'native-key', 'gate-signed', 'provider-durable', 'raw-broadcast']);
  assert.throws(() => assertOwnedEvmDispatchRequest(control.request, f.configuration.runtime), /ORIGINAL_SCOPED/);
  assert.equal((await gate.reconcile()).status, 'observed'); assert.equal(control.facts, 1);
  assert.equal(control.signs, 1); assert.equal(control.sends, 1);
  gate.close(); assert.throws(() => gate.execute({ syntheticOriginalGateRequest: true }), /CLOSED/);
});

test('exact beforeSign rejection is preserved and onSigned rejection prevents raw broadcast', async () => {
  for (const field of ['rejectBefore', 'rejectSigned']) {
    const f = fixture(), gate = await createOwnedEvmVaultDispatchGate(f.configuration); control[field] = true;
    await assert.rejects(gate.execute({ syntheticOriginalGateRequest: true }), error => error === control.rejection);
    assert.equal(control.signs, field === 'rejectBefore' ? 0 : 1); assert.equal(control.sends, 0);
    assert.throws(() => assertOwnedEvmDispatchRequest(control.request, f.configuration.runtime), /ORIGINAL_SCOPED/);
  }
});

test('unknown or adverse reads never sign, and successful-looking unbranded facts fail closed', async () => {
  const f = fixture(), gate = await createOwnedEvmVaultDispatchGate(f.configuration);
  for (const status of ['unknown', 'pending', 'adverse', 'unavailable']) {
    control.status = status; assert.deepEqual(await gate.reconcile(), { status, nativeId: f.signed.nativeId, nativeWire: null });
  }
  assert.equal(control.facts, 0); assert.equal(control.signs, 0); assert.equal(control.sends, 0);
  control.status = 'observed'; control.unbrandedFacts = true; await assert.rejects(gate.reconcile(), /TEST_FACTS_BRAND/);
});
