/** Real dispatch mechanism with explicit inert RPC/signing and original-scope
 * fixtures. The last case uses a real owned node without sending a transaction. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchOriginalEvmClaimV1 } from '../../../../src/chains/evm/runtime/original-claim-dispatch-v1.mjs';
import {
  observedNativeValueInclusionSecond,
  waitObservedNativeValueNextSecondV1,
} from '../../../../src/chains/shared/health/native-value-observed-clock-v1.mjs';
import {
  createOwnedLocalEvmObservedClockV1,
  nativeValueReceiverInclusionSecondV1,
} from '../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';

function fixture(
  observedClock,
  { wrongKey = false, expired = false, loseBroadcast = false, economic = false } = {},
) {
  const events = [],
    scopes = new WeakMap(),
    wrapped = new WeakMap(),
    generic = new WeakMap(),
    runtime = {};
  const nativeId = '0x' + 'a'.repeat(64),
    transactionSHA256 = 'b'.repeat(64),
    target = '0x' + 'c'.repeat(40),
    sender = '0x' + 'd'.repeat(40);
  const state = {
    signs: 0,
    broadcasts: 0,
    prepares: 0,
    mutations: 0,
    walltime: 100000,
    now: 0,
    nonce: '0x0',
    pending: false,
    lastTimestamp: 100n,
    uncertain: false,
    uncertainHash: null,
    revoked: 0,
    head: {
      number: '0x0',
      hash: '0x' + 'e'.repeat(64),
      timestamp: '0x64',
      baseFeePerGas: '0x1',
      transactions: [],
    },
  };
  let prepared, token;
  const lease = Object.freeze({});
  const assertAlive = () => events.push('assertAlive');
  const block = async () => structuredClone(state.head);
  async function rpc(method, params) {
    events.push(method);
    switch (method) {
      case 'eth_getTransactionCount':
        return state.nonce;
      case 'eth_getBalance':
        return '0xde0b6b3a7640000';
      case 'eth_getCode':
        return '0x6000';
      case 'eth_estimateGas':
        return '0x5208';
      case 'eth_signTransaction':
        state.signs++;
        return '0x01';
      case 'eth_sendRawTransaction':
        state.broadcasts++;
        state.pending = true;
        if (loseBroadcast) throw Error('HOST_LOST_REPLY');
        return nativeId;
      default:
        throw Error('HOST_UNEXPECTED_RPC_' + method);
    }
  }
  const used = new WeakSet(),
    transactions = [],
    receipts = [];
  function registryPort(registry) {
    return {
      isOwnedClaimEvmDispatchRequest(request) {
        assert.equal(arguments.length, 1, 'HOST_STRICT_UNARY_ISSUER');
        return registry.has(request);
      },
      assertOwnedClaimEvmDispatchRequest(request, boundRuntime) {
        const row = registry.get(request);
        assert.ok(row && row.runtime === boundRuntime, 'HOST_SCOPE_RUNTIME_REQUIRED');
        return row.callbacks;
      },
    };
  }
  const claim = registryPort(scopes),
    wrappedClaim = registryPort(wrapped);
  const contract = {
    profile: {
      observedClock,
      observedEconomicV2: false,
      economicV2: economic,
      runtime,
      genesisHash: '0x' + 'f'.repeat(64),
    },
    lifetime: {
      assertMutable() {},
      assertAlive,
      async mutate(work) {
        state.mutations++;
        return work();
      },
    },
    requests: {
      async loadGate() {
        return {
          ...claim,
          isWrapped: wrappedClaim.isOwnedClaimEvmDispatchRequest,
          openWrapped: wrappedClaim.assertOwnedClaimEvmDispatchRequest,
          assertOwnedEvmDispatchRequest(request, boundRuntime) {
            const row = generic.get(request);
            assert.ok(row && row.runtime === boundRuntime, 'HOST_GENERIC_SCOPE_REQUIRED');
            return row.callbacks;
          },
        };
      },
      prepare(value) {
        state.prepares++;
        return { ...value, gas: '0xc350', value: '0x0' };
      },
      used: (value) => used.has(value),
      consume: (value) => {
        used.add(value);
      },
    },
    chain: {
      block,
      rpc,
      async receipt() {
        return { status: '0x1', gasUsed: '0x5208' };
      },
      assertCanonical: block,
    },
    clock: {
      current: () => state.lastTimestamp,
      monotonic: () => state.now,
      nextObservedSecond: () =>
        waitObservedNativeValueNextSecondV1(false, {
          lastSecond: () => state.lastTimestamp,
          assertAlive,
          monotonicNow: () => state.now,
          wallMilliseconds: () => state.walltime,
          async delay(milliseconds) {
            assert.equal(milliseconds, 25);
            events.push('observed-wait');
            state.walltime = 105000;
          },
        }),
      async mineAt(timestamp) {
        assert.ok(timestamp > state.lastTimestamp);
        if (observedClock) assert.ok(timestamp <= BigInt(Math.floor(state.walltime / 1000)));
        state.nextTime = Number(timestamp);
        state.head = {
          ...state.head,
          number: '0x1',
          hash: '0x' + '1'.repeat(64),
          timestamp: '0x' + timestamp.toString(16),
          transactions: state.pending ? [nativeId] : [],
        };
        state.nonce = '0x1';
        state.lastTimestamp = timestamp;
      },
    },
    custody: {
      async prepare(value) {
        events.push('prepare-lease');
        prepared = value;
        return lease;
      },
      consume(value, expected) {
        assert.equal(value, lease);
        assert.equal(expected, prepared);
        events.push('consume-lease');
        state.signs++;
        return { nativeWire: '0x01' };
      },
      revoke(value) {
        assert.equal(value, lease);
        state.revoked++;
        events.push('revoke-lease');
      },
    },
    records: {
      append: (entry) => {
        transactions.push(entry);
      },
      receipt: (entry) => {
        receipts.push(entry);
      },
      async persistSigned() {
        events.push('persistSigned');
      },
      markUncertain(hash) {
        state.uncertain = true;
        state.uncertainHash = hash;
      },
    },
    wire: {
      encodeUnsigned: () => '0x01',
      keccak: () => Buffer.alloc(32, 1),
      verify(raw, transaction) {
        assert.equal(raw, '0x01');
        assert.equal(transaction.to, target);
        return { nativeWire: raw, nativeId, transactionSHA256, unsignedWire: '0x01' };
      },
    },
  };
  const callbacks = {
    transaction: { from: sender, to: target, data: '0x12345678', gas: '50000', value: '0' },
    async beforeSign(value) {
      events.push('beforeSign');
      prepared = value;
      token = {};
      return wrongKey ? {} : token;
    },
    consumeBeforeKey(value, expected) {
      events.push('consumeBeforeKey');
      assert.equal(value, token, 'HOST_ONE_USE_KEY_REQUIRED');
      assert.equal(expected, prepared);
      token = null;
      if (expired) state.now = 30000;
      return 0;
    },
    async onSigned() {
      events.push('onSigned');
    },
  };
  const original = {},
    wrappedRequest = {},
    genericRequest = {},
    foreignRuntime = {};
  scopes.set(original, { runtime, callbacks });
  scopes.set(foreignRuntime, { runtime: {}, callbacks });
  wrapped.set(wrappedRequest, { runtime, callbacks });
  generic.set(genericRequest, {
    runtime,
    callbacks: {
      transaction: callbacks.transaction,
      beforeSign: async () => {
        events.push('ordinaryBeforeSign');
      },
      onSigned: callbacks.onSigned,
    },
  });
  return {
    dispatch: (request, observedClaim = observedClock) =>
      dispatchOriginalEvmClaimV1(request, observedClaim, contract),
    state,
    events,
    original,
    wrappedRequest,
    genericRequest,
    foreignRuntime,
    transactions,
  };
}

test('original dispatch keeps one-use key consumption, durability and one-send guards through the real mechanism', async () => {
  const f = fixture(true);
  for (const request of [f.wrappedRequest, f.genericRequest, { ...f.original }, {}])
    await assert.rejects(f.dispatch(request), /LOCAL_OBSERVED_RECEIVER_ORIGINAL_CLAIM_REQUIRED/);
  await assert.rejects(f.dispatch(f.foreignRuntime), /HOST_SCOPE_RUNTIME_REQUIRED/);
  await assert.rejects(f.dispatch(f.original, false), /LOCAL_EVM_FIXED_DISPATCH_CLOCK/);
  assert.deepEqual(
    [f.state.prepares, f.state.mutations, f.state.signs, f.state.broadcasts],
    [0, 0, 0, 0],
  );
  const outcome = await f.dispatch(f.original);
  assert.equal(outcome.nativeId, '0x' + 'a'.repeat(64));
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.broadcasts, 1);
  assert.equal(f.events[f.events.indexOf('consumeBeforeKey') + 1], 'eth_signTransaction');
  assert.ok(f.events.indexOf('persistSigned') < f.events.indexOf('onSigned'));
  assert.ok(f.events.indexOf('onSigned') < f.events.indexOf('eth_sendRawTransaction'));
  assert.ok(f.events.includes('observed-wait'));
  assert.equal(f.state.nextTime, 105);
  assert.equal(f.state.head.timestamp, '0x69');
  await assert.rejects(f.dispatch(f.original), /ALREADY_USED_NO_RESEND/);
  assert.equal(f.state.broadcasts, 1);
  for (const options of [{ wrongKey: true }, { expired: true }]) {
    const denied = fixture(true, options);
    await assert.rejects(
      denied.dispatch(denied.original),
      /HOST_ONE_USE_KEY_REQUIRED|EVM_KEY_ORIGINAL_AUTHORITY_TOO_OLD/,
    );
    assert.equal(denied.state.signs, 0);
    assert.equal(denied.state.broadcasts, 0);
  }
  const legacy = fixture(false);
  await legacy.dispatch(legacy.genericRequest);
  assert.equal(legacy.state.nextTime, 101);
  assert.equal(legacy.state.broadcasts, 1);
  assert.equal(legacy.events.includes('observed-wait'), false);
  await assert.rejects(legacy.dispatch(legacy.original, true), /LOCAL_EVM_FIXED_DISPATCH_CLOCK/);
});

test('lost reply retains the original durable signed hash; local custody lease is revoked on success or rejection', async () => {
  const lost = fixture(true, { loseBroadcast: true });
  await assert.rejects(lost.dispatch(lost.original), /HOST_LOST_REPLY/);
  assert.equal(lost.state.signs, 1);
  assert.equal(lost.state.broadcasts, 1);
  assert.equal(lost.state.uncertain, true);
  assert.equal(lost.state.uncertainHash, '0x' + 'a'.repeat(64));
  assert.equal(lost.transactions[0].phase, 'uncertain-no-resend');
  assert.equal(lost.transactions[0].uncertaintyCause, 'original-signed-broadcast');
  await assert.rejects(lost.dispatch(lost.original), /ALREADY_USED_NO_RESEND/);
  assert.equal(lost.state.broadcasts, 1);
  const local = fixture(true, { economic: true });
  await local.dispatch(local.original);
  const consumed = local.events.indexOf('consumeBeforeKey');
  assert.deepEqual(local.events.slice(consumed, consumed + 3), [
    'consumeBeforeKey',
    'assertAlive',
    'consume-lease',
  ]);
  assert.equal(local.state.revoked, 1);
  const denied = fixture(true, { economic: true, wrongKey: true });
  await assert.rejects(denied.dispatch(denied.original), /HOST_ONE_USE_KEY_REQUIRED/);
  assert.equal(denied.state.signs, 0);
  assert.equal(denied.state.revoked, 1);
});

test('inclusion bound uses the real pure clock; public consumer rejects fabricated and closed runtimes', async () => {
  assert.equal(observedNativeValueInclusionSecond('100', '100000'), 101n);
  assert.equal(observedNativeValueInclusionSecond('100', '105999'), 105n);
  assert.throws(() => observedNativeValueInclusionSecond('100', '99999'), /CLOCK_ROLLBACK/);
  let traps = 0;
  const hostile = new Proxy(
    {},
    {
      get() {
        traps++;
        throw Error('PRIVATE_MESSAGE');
      },
      ownKeys() {
        traps++;
        return [];
      },
    },
  );
  for (const forged of [{}, hostile])
    assert.throws(() => nativeValueReceiverInclusionSecondV1(forged), /OWNED_CAPABILITY_REQUIRED/);
  assert.throws(() => nativeValueReceiverInclusionSecondV1({}, '106'), /CLOCK_ARITY/);
  assert.equal(traps, 0);
  const runtime = await createOwnedLocalEvmObservedClockV1();
  try {
    assert.equal(typeof runtime.dispatch, 'function');
    assert.equal(Object.hasOwn(runtime, 'advanceTo'), false);
    const head = await runtime.block();
    assert.ok(nativeValueReceiverInclusionSecondV1(runtime) > BigInt(head.timestamp));
    assert.throws(
      () => nativeValueReceiverInclusionSecondV1({ ...runtime }),
      /OWNED_CAPABILITY_REQUIRED/,
    );
    await assert.rejects(runtime.dispatch({}), /LOCAL_OBSERVED_RECEIVER_ORIGINAL_CLAIM_REQUIRED/);
  } finally {
    await runtime.close({ removeScratch: true });
  }
  assert.throws(() => nativeValueReceiverInclusionSecondV1(runtime), /PROCESS_NOT_RUNNING/);
});
