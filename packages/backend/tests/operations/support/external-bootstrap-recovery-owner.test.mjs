import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildExternalDefiBootstrapRecoveryV1 } from '../../../src/claims/wrapped/recovery/external-bootstrap-recovery-backend-v1.mjs';
import { consumeExternalDefiBootstrapPartV1 as consumeCanonicalPart } from '../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { canonicalClaimRecordDataV1 } from '@lianum/engine/storage/records';

function fixture({ failUpdate = false } = {}) {
  const calls = [],
    tokens = [],
    original = new WeakSet(),
    handle = Object.freeze({}),
    attempt = Object.freeze({});
  const head = Object.freeze({ number: '4', hash: 'ab'.repeat(32) });
  const runtime = {
    metadata: { evmGenesis: 'aa'.repeat(32), chainId: '31337' },
    accounts: ['0x' + '11'.repeat(20)],
    block: async () => head,
    assertCanonical: async (value) => assert.deepEqual(value, head),
  };
  const system = {
    hub: { address: 'hub' },
    pools: [
      { address: 'pool0', domain: 'domain0' },
      { address: 'pool1', domain: 'domain1' },
    ],
    registry: { keys: ['key0', 'key1', 'key2', 'key3'] },
    verifiers: { transfer: { address: 'verifier' } },
  };
  const protocols = {
    deployments: [
      { name: 'protocol', address: 'protocol-address', creationSHA256: '12'.repeat(32) },
    ],
  };
  const routers = ['UNISWAP_V3_EXACT_OUTPUT_SINGLE', 'METAMORPHO_V1_EXACT_SHARE_MINT'].map(
    (protocolKind, index) => ({
      address: 'router' + index,
      identity: { solver: runtime.accounts[0].slice(2) },
      protocolKind,
      fee: 1,
      creationTransactionHash: '34'.repeat(32),
    }),
  );
  const operatorGroup = {
    operators: system.registry.keys.map((publicKey) => ({
      publicKey,
      close: async () => {
        calls.push('close:' + publicKey);
      },
    })),
  };
  for (const value of [runtime, system, protocols, ...routers, operatorGroup]) original.add(value);
  let saved, descriptor, backend, other;
  const auth = (value) => assert.ok(original.has(value), 'original fixture actor');
  const captured = (label) => {
    calls.push('capture:' + label);
    return { head, label };
  };
  const consume = (token, kind) => {
    tokens.push(token);
    assert.throws(() => consumeCanonicalPart(token, kind), /ORIGINAL_EXTERNAL_BOOTSTRAP_PART/);
    assert.throws(
      () => other.consumeExternalDefiBootstrapPartV1(token, kind),
      /ORIGINAL_EXTERNAL_BOOTSTRAP_PART/,
    );
    assert.throws(
      () => backend.consumeExternalDefiBootstrapPartV1({ ...token }, kind),
      /ORIGINAL_EXTERNAL_BOOTSTRAP_PART/,
    );
    assert.throws(
      () => backend.consumeExternalDefiBootstrapPartV1(token, 'wrong'),
      /ORIGINAL_EXTERNAL_BOOTSTRAP_PART/,
    );
    const value = backend.consumeExternalDefiBootstrapPartV1(token, kind);
    assert.throws(
      () => backend.consumeExternalDefiBootstrapPartV1(token, kind),
      /ORIGINAL_EXTERNAL_BOOTSTRAP_PART/,
    );
    assert.equal(value.runtime, runtime);
    return value;
  };
  const ports = {
    recordSHA256: (value) =>
      createHash('sha256').update(canonicalClaimRecordDataV1(value)).digest('hex'),
    runtime: { assertOwnedLocalEvmV2: async (value) => auth(value) },
    system: {
      assertOwnedFlatSystem: (r, s) => {
        auth(r);
        auth(s);
      },
      captureOwnedFlatSystemRecoveryV1: async () => captured('system'),
      reopenOwnedFlatSystemRecoveryV1: async (token) => {
        consume(token, 'system');
        calls.push('reopen:system');
        return system;
      },
    },
    protocols: {
      assertOfficialProtocolFixture: (r, p) => {
        auth(r);
        auth(p);
      },
      captureOfficialProtocolFixtureRecoveryV1: async () => captured('protocols'),
      reopenOfficialProtocolFixtureRecoveryV1: async (token) => {
        consume(token, 'protocols');
        calls.push('reopen:protocols');
        return protocols;
      },
    },
    routers: {
      assertOwnedPrivateExternalRouterV1: (router, expected) => {
        auth(router);
        assert.equal(expected.runtime, runtime);
        assert.equal(expected.system, system);
        assert.equal(router, routers[expected.poolIndex]);
      },
      captureOwnedPrivateExternalRouterRecoveryV1: async (router) => ({
        ...captured('router'),
        index: routers.indexOf(router),
      }),
      reopenOwnedPrivateExternalRouterRecoveryV1: async (token) => {
        const value = consume(token, 'router');
        assert.equal(value.system, system);
        assert.equal(value.protocols, protocols);
        calls.push('reopen:router');
        return routers[value.record.index];
      },
    },
    operators: {
      assertRetainedLocalFlatOperatorGroupV1: (group, expected) => {
        auth(group);
        assert.equal(expected.runtime, runtime);
      },
      captureRetainedLocalFlatOperatorGroupV1: async (group) => {
        auth(group);
        calls.push('stop:operators');
        return { keys: system.registry.keys };
      },
      reopenRetainedLocalFlatOperatorGroupV1: async (input) => {
        assert.equal(input.runtime, runtime);
        assert.deepEqual(input.bindings, [null, null, null, null]);
        assert.deepEqual(input.expected.keys, system.registry.keys);
        calls.push('reopen:operators');
        return operatorGroup;
      },
    },
    lifetime: {
      retainWrappedPrivateLifetimePartV1: async (r, name, identity, record) => {
        assert.equal(r, runtime);
        assert.equal(name, 'custody-bootstrap');
        saved = { privateState: structuredClone(record), version: 1, handle };
        calls.push('retain:lifetime');
        return handle;
      },
      readWrappedPrivateLifetimePartV1: async () => {
        calls.push('read:lifetime');
        return saved;
      },
      updateWrappedPrivateLifetimePartV1: async (h, record) => {
        assert.equal(h, handle);
        calls.push('update:lifetime');
        if (failUpdate) throw Error('CAS rejected');
        saved = { privateState: structuredClone(record), version: 2, handle };
      },
      assertWrappedPrivateLifetimePartSealedV1: (h) => assert.equal(h, handle),
      assertWrappedPrivateLifetimeAttemptV1: (r, identity) => {
        assert.equal(r, runtime);
        assert.equal(identity, attempt);
      },
      wrappedPrivateLifetimeRuntimeCheckpointV1: async () => ({
        revision: 2,
        commitment: '56'.repeat(32),
      }),
    },
    recovery: {
      retainOriginalWrappedRecoverySectionV1: async (token, name, record) => {
        assert.equal(token, attempt);
        assert.equal(name, 'system');
        calls.push('retain:section');
        descriptor = structuredClone(record);
      },
      consumeOriginalWrappedRecoverySectionV1: (token, name) => {
        assert.equal(token, attempt);
        assert.equal(name, 'system');
        calls.push('consume:section');
        return structuredClone(descriptor);
      },
      originalWrappedRecoverySectionIdentityV1: (token) => {
        assert.equal(token, attempt);
        return attempt;
      },
    },
    graph: {
      loadDeviceSystem: async () => {
        throw Error('unused device');
      },
      loadAave: async () => {
        throw Error('unused Aave');
      },
      loadObservers: async () => {
        throw Error('unused observers');
      },
      loadBluePosition: async () => {
        throw Error('unused Blue');
      },
      loadBlueRouter: async () => {
        throw Error('unused Blue router');
      },
    },
  };
  backend = buildExternalDefiBootstrapRecoveryV1(ports);
  other = buildExternalDefiBootstrapRecoveryV1(ports);
  return {
    backend,
    other,
    runtime,
    system,
    protocols,
    routers,
    operatorGroup,
    attempt,
    calls,
    tokens,
    ports,
    get saved() {
      return saved;
    },
    get descriptor() {
      return descriptor;
    },
  };
}

test('external bootstrap preserves inventory, fences/captures before CAS, and consumes only instance-owned parts', async () => {
  const f = fixture();
  const bootstrap = await f.backend.createExternalDefiBootstrapRecoveryV1({
    runtime: f.runtime,
    system: f.system,
    protocols: f.protocols,
    routers: f.routers,
    operatorGroup: f.operatorGroup,
  });
  const inventory = bootstrap.inventory();
  await assert.rejects(
    f.other.retainExternalDefiBootstrapForReopenV1({
      runtime: f.runtime,
      bootstrap,
      attemptAuthority: f.attempt,
    }),
  );
  await assert.rejects(
    f.backend.retainExternalDefiBootstrapForReopenV1({
      runtime: f.runtime,
      bootstrap: { ...bootstrap },
      attemptAuthority: f.attempt,
    }),
  );
  assert.deepEqual(
    await f.backend.retainExternalDefiBootstrapForReopenV1({
      runtime: f.runtime,
      bootstrap,
      attemptAuthority: f.attempt,
    }),
    { retained: true, originalResourcesStopped: true },
  );
  assert.throws(() => bootstrap.inventory());
  assert.ok(f.calls.indexOf('stop:operators') < f.calls.indexOf('update:lifetime'));
  assert.ok(f.calls.indexOf('update:lifetime') < f.calls.indexOf('retain:section'));
  const reopened = await f.backend.reopenExternalDefiBootstrapFromAuthorityV1({
    runtime: f.runtime,
    attemptAuthority: f.attempt,
  });
  assert.equal(reopened.runtime, f.runtime);
  assert.equal(reopened.system, f.system);
  assert.deepEqual(reopened.inventory(), inventory);
  assert.equal(f.tokens.length, 4);
  assert.equal(new Set(f.tokens).size, 4);
  await reopened.close();
  await reopened.close();
  assert.equal(f.calls.filter((value) => value.startsWith('close:')).length, 4);
});

test('external bootstrap rejects tampered retained inventory before reopening any actor', async () => {
  const f = fixture();
  const bootstrap = await f.backend.createExternalDefiBootstrapRecoveryV1({
    runtime: f.runtime,
    system: f.system,
    protocols: f.protocols,
    routers: f.routers,
    operatorGroup: f.operatorGroup,
  });
  await f.backend.retainExternalDefiBootstrapForReopenV1({
    runtime: f.runtime,
    bootstrap,
    attemptAuthority: f.attempt,
  });
  f.saved.privateState.inventory.hub = 'substitute';
  await assert.rejects(
    f.backend.reopenExternalDefiBootstrapFromAuthorityV1({
      runtime: f.runtime,
      attemptAuthority: f.attempt,
    }),
  );
  assert.equal(
    f.calls.some((value) => value.startsWith('reopen:')),
    false,
  );
  assert.equal(f.tokens.length, 0);
});

test('EXIT-only recovery stays separate and failed durable capture never publishes a section', async () => {
  const f = fixture();
  await f.backend.retainExternalDefiVaultExitSystemForReopenV1({
    runtime: f.runtime,
    system: f.system,
    attemptAuthority: f.attempt,
  });
  const result = await f.backend.reopenExternalDefiVaultExitSystemFromAuthorityV1({
    runtime: f.runtime,
    attemptAuthority: f.attempt,
  });
  assert.equal(result.system, f.system);
  assert.equal(result.graphRecoveryEstablished, false);
  assert.equal(f.tokens.length, 1);
  const failure = fixture({ failUpdate: true });
  const bootstrap = await failure.backend.createExternalDefiBootstrapRecoveryV1({
    runtime: failure.runtime,
    system: failure.system,
    protocols: failure.protocols,
    routers: failure.routers,
    operatorGroup: failure.operatorGroup,
  });
  await assert.rejects(
    failure.backend.retainExternalDefiBootstrapForReopenV1({
      runtime: failure.runtime,
      bootstrap,
      attemptAuthority: failure.attempt,
    }),
    /CAS rejected/,
  );
  assert.equal(failure.calls.includes('retain:section'), false);
  assert.throws(() => bootstrap.inventory());
});
