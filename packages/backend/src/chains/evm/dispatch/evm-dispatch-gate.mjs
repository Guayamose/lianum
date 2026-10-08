/** Family-3 adapter for the original P/R/current-state/durable native gate.
 * Only this module issues EVM requests, in the adapter privately constructed by
 * the factory. There is no exported request issuer or callback registration.
 * State, health, journal and dedicated provider signer are trusted bootstrap
 * capabilities held by the private provider, never public execute options. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, bytes32 } from '../../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { assertOwnedLocalEvmV2, LOCAL_EVM_PROFILE } from '../runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedFlatSystem } from '../../../operations/deployments/system/deploy-system.mjs';
import { assertOwnedEvmGraphDeliveryRouterV1, assertOwnedEvmGraphDeliveryObserverV1,
  assertOwnedEvmGraphDeliveryFactsV1, assertOwnedEvmGraphDeliveryDescriptorV1 } from './owned-evm-graph-delivery-v1.mjs';
import { encodeEvmGraphDeliveryCallV1 } from './evm-graph-delivery-codec-v1.mjs';
import { validateEvmDeliveryWire } from './evm-facts-binding.mjs';
import { createNativeDispatchGate, normalizeNativeDispatchBinding } from '../../shared/dispatch/native-dispatch-gate.mjs';

const requests = new WeakMap();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (left, right) => assert.deepEqual(left, right, 'EVM_DISPATCH_BOUND_CAPABILITY');
function bareHash(value) {
  assert.ok(typeof value === 'string' && value.length === 66 && /^0x[0-9a-f]{64}$/.test(value), 'EVM_DISPATCH_RPC_HASH');
  return value.slice(2);
}

/** Runtime-only opener. An object or copied callback bundle cannot acquire the
 * original request brand; each request is opened once within one live transfer. */
export function assertOwnedEvmDispatchRequest(request, runtime) {
  const record = requests.get(request);
  assert.ok(record && record.runtime === runtime, 'EVM_DISPATCH_ORIGINAL_SCOPED_REQUEST_REQUIRED');
  record.assertLive(); assert.equal(record.opened, false, 'EVM_DISPATCH_REQUEST_ALREADY_OPENED'); record.opened = true;
  return Object.freeze({ transaction: record.transaction, beforeSign: record.beforeSign, onSigned: record.onSigned });
}

export async function createOwnedEvmVaultDispatchGate(configuration) {
  exactRecord(configuration, ['runtime', 'system', 'router', 'observer', 'binding', 'hashFields', 'verifier',
    'providerSigner', 'stateReader', 'healthReader', 'store']);
  const { runtime, system, router, observer, hashFields, verifier, providerSigner, stateReader, healthReader, store } = configuration;
  const binding = normalizeNativeDispatchBinding(configuration.binding), native = binding.native;
  assert.equal(native.family, '3', 'EVM_DISPATCH_FAMILY');
  await assertOwnedLocalEvmV2(runtime); assertOwnedFlatSystem(runtime, system);
  assertOwnedEvmGraphDeliveryRouterV1(runtime, system, router, observer);
  const observerBinding = { runtime, system, poolIndex: router.destinationPoolIndex };
  assertOwnedEvmGraphDeliveryObserverV1(observer, observerBinding);
  assert.ok([runtime, router, observer].every(Object.isFrozen), 'EVM_DISPATCH_IMMUTABLE_CAPABILITIES');
  assertOwnedEvmGraphDeliveryDescriptorV1(runtime, system, router, observer, native.descriptor);
  assert.equal(binding.pool, system.pools[router.sourcePoolIndex].address.slice(2), 'EVM_DISPATCH_SOURCE_POOL');
  equal(binding.domain, system.pools[router.sourcePoolIndex].domain);
  equal(binding.registry, system.registry);
  assert.equal(observer.binding.genesis, native.genesis); assert.equal(observer.binding.asset, native.asset);
  assert.equal(observer.binding.sourceEndpoint, native.sourceEndpoint);
  assert.equal(observer.binding.destinationEndpoint, native.destinationEndpoint);
  const intent = frozenInput({ descriptor: native.descriptor,
    receiptKeyCommitment: binding.quote.action.receiptKeyCommitment, proof: native.depositProof });
  const calldata = encodeEvmGraphDeliveryCallV1(intent), calldataSHA256 = sha(Buffer.from(calldata.slice(2), 'hex'));
  const transaction = frozenInput({ from: '0x' + native.sourceEndpoint, to: '0x' + native.destinationEndpoint,
    data: calldata, gas: '0x' + BigInt(LOCAL_EVM_PROFILE.maxGas).toString(16), value: '0x0' });
  const dispatch = runtime.dispatch.bind(runtime), checkPrepared = observer.assertPrepared.bind(observer);
  const observeFacts = observer.observeFacts.bind(observer), observeDispatch = observer.observeDispatch.bind(observer);
  let active = false, closed = false;
  const assertOwned = () => {
    assert.equal(closed, false, 'EVM_DISPATCH_CLOSED'); assertOwnedFlatSystem(runtime, system);
    assertOwnedEvmGraphDeliveryRouterV1(runtime, system, router, observer); assertOwnedEvmGraphDeliveryObserverV1(observer, observerBinding);
  };
  const nativeAdapter = Object.freeze({ binding: native,
    async transfer(request, callbacks) {
      exactRecord(request, ['amount', 'wireKeyCommitment']); exactRecord(callbacks, ['beforeSign', 'onSigned']);
      assert.equal(request.amount, binding.quote.action.amount); assert.equal(request.wireKeyCommitment, intent.receiptKeyCommitment);
      assertOwned(); assert.equal(active, false, 'EVM_DISPATCH_BUSY'); active = true;
      const beforeSign = callbacks.beforeSign, onSigned = callbacks.onSigned;
      assert.equal(typeof beforeSign, 'function'); assert.equal(typeof onSigned, 'function');
      const scopedRequest = Object.freeze(Object.create(null));
      const assertLive = () => { assertOwned(); assert.equal(active, true, 'EVM_DISPATCH_REQUEST_INACTIVE'); };
      requests.set(scopedRequest, { runtime, transaction, opened: false, assertLive,
        async beforeSign(prepared) { assertLive(); return beforeSign(prepared); },
        async onSigned(signed) { assertLive(); return onSigned(signed); } });
      try {
        const sent = cloneInput(await dispatch(scopedRequest)); exactRecord(sent, ['nativeId', 'transactionSHA256']);
        bytes32(sent.transactionSHA256, true);
        return frozenInput({ nativeId: bareHash(sent.nativeId), transactionSHA256: sent.transactionSHA256 });
      } finally { requests.delete(scopedRequest); active = false; }
    },
    async assertPrepared(prepared) {
      assertOwned(); assert.equal(active, true, 'EVM_DISPATCH_PREPARED_OUTSIDE_TRANSFER');
      // Complete EVM freshness comes BEFORE the original gate's final source
      // current-head assertion. That assertion is followed directly by key use.
      assert.equal(await checkPrepared({ prepared, intent }), undefined, 'EVM_DISPATCH_PREFLIGHT_ASSERT_ONLY');
    },
    async observe(query) {
      assertOwned(); exactRecord(query, ['nativeId']); bytes32(query.nativeId, true);
      const original = { transactionHash: query.nativeId, calldataSHA256 };
      const status = cloneInput(await observeDispatch(original));
      exactRecord(status, ['status', 'nativeId', 'nativeWire']); assert.equal(status.nativeId, query.nativeId);
      assert.ok(['observed', 'pending', 'unknown', 'unavailable', 'adverse'].includes(status.status), 'EVM_DISPATCH_OBSERVATION_STATUS');
      if (status.status !== 'observed') { assert.equal(status.nativeWire, null); return frozenInput(status); }
      // Successful delivery is established only by the actual branded reader's
      // full canonical execution facts, never a receipt status or data flag.
      const facts = await observeFacts(original); assertOwnedEvmGraphDeliveryFactsV1(facts, { observer });
      assert.equal(facts.status, 'observed'); assert.equal(facts.genesis, native.genesis); assert.equal(facts.asset, native.asset);
      equal(facts.intent, intent);
      const decoded = validateEvmDeliveryWire(facts.nativeWire, intent);
      assert.equal(decoded.nativeId, query.nativeId); assert.equal(status.nativeWire, facts.nativeWire);
      return frozenInput({ status: 'observed', nativeId: query.nativeId, nativeWire: facts.nativeWire });
    },
  });
  const gate = await createNativeDispatchGate({ binding, hashFields, verifier, providerSigner,
    nativeAdapter, stateReader, healthReader, store });
  return Object.freeze({
    execute(request) { assertOwned(); return gate.execute(request); },
    reconcile() { assert.equal(arguments.length, 0, 'EVM_DISPATCH_RECONCILE_FIELDS'); assertOwned(); return gate.reconcile(); },
    report() { return gate.report(); },
    close() { assert.equal(active, false, 'EVM_DISPATCH_BUSY'); gate.close(); closed = true; },
  });
}

export const createOwnedEvmGraphDispatchGateV1 = createOwnedEvmVaultDispatchGate;
