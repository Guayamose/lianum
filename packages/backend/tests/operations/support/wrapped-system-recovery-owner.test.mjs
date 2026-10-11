import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWrappedSystemRecoveryV1 } from '../../../src/claims/wrapped/recovery/wrapped-system-recovery-backend-v1.mjs';
import { consumeWrappedSystemRecoveryPartV1 as canonicalConsume } from '../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';

function fixture({ failRetention = false, failReopen = false } = {}) {
  const events = [],
    tokens = [],
    runtime = {},
    system = {},
    custodyBootstrap = {};
  let fenced = false,
    backend,
    other;
  const bootstrap = {
    close() {
      events.push('close');
    },
  };
  const authority = Object.freeze({});
  const requireAuthority = (value) => assert.equal(value, authority);
  const consume = (token, name) => {
    tokens.push(token);
    assert.throws(
      () => backend.consumeWrappedSystemRecoveryPartV1({ ...token }, name),
      /PART_TOKEN/,
    );
    assert.throws(() => backend.consumeWrappedSystemRecoveryPartV1(token, 'wrong'), /PART_TOKEN/);
    assert.throws(() => other.consumeWrappedSystemRecoveryPartV1(token, name), /PART_TOKEN/);
    assert.throws(() => canonicalConsume(token, name), /PART_TOKEN/);
    const value = backend.consumeWrappedSystemRecoveryPartV1(token, name);
    assert.equal(value.runtime, runtime);
    assert.throws(() => backend.consumeWrappedSystemRecoveryPartV1(token, name), /PART_TOKEN/);
    return value;
  };
  const ports = {
    released() {
      events.push('release');
    },
    async custody() {
      return {
        async createWrappedClaimCustodyBootstrapV1() {
          return custodyBootstrap;
        },
        revokeWrappedClaimCustodyBootstrapV1(actual, value) {
          assert.equal(actual, runtime);
          assert.equal(value, custodyBootstrap);
          events.push('revoke');
        },
        captureWrappedClaimCustodyBootstrapRecoveryV1(actual, value) {
          assert.equal(actual, runtime);
          assert.equal(value, custodyBootstrap);
          assert.equal(fenced, true);
          events.push('custody');
          return { credential: 'synthetic-custody' };
        },
        async reopenWrappedClaimCustodyBootstrapRecoveryV1(token) {
          const value = consume(token, 'custody');
          assert.deepEqual(value.record, { credential: 'synthetic-custody' });
          return custodyBootstrap;
        },
      };
    },
    async operators() {
      return {
        async createWrappedClaimOperatorBootstrapV1() {
          return bootstrap;
        },
        assertWrappedClaimOperatorBootstrapForSystemV1(value, expected) {
          assert.equal(value, bootstrap);
          assert.equal(expected.runtime, runtime);
          assert.equal(expected.system, system);
        },
        assertWrappedClaimOperatorCustodyBootstrapV1(value, expected) {
          assert.equal(value, bootstrap);
          assert.equal(expected.custodyBootstrap, custodyBootstrap);
        },
        fenceWrappedClaimOperatorBootstrapRecoveryV1(value) {
          assert.equal(value, bootstrap);
          fenced = true;
          events.push('fence');
        },
        async captureWrappedClaimOperatorBootstrapRecoveryV1(value) {
          assert.equal(value, bootstrap);
          assert.equal(fenced, true);
          events.push('operators');
          return { operators: 'synthetic-original' };
        },
        async reopenWrappedClaimOperatorBootstrapRecoveryV1(token) {
          consume(token, 'operators');
          if (failReopen) throw Error('HOST_REOPEN_FAILED');
          return bootstrap;
        },
      };
    },
    async contracts() {
      return {
        async deployWrappedClaimGraphSystemV1() {
          return system;
        },
        async captureWrappedClaimGraphSystemRecoveryV1(actual, value) {
          assert.equal(actual, runtime);
          assert.equal(value, system);
          assert.equal(fenced, true);
          events.push('contracts');
          return { contracts: 'synthetic-original' };
        },
        async assertCapturedWrappedClaimSystemUnchangedV1(actual, value, record) {
          assert.equal(actual, runtime);
          assert.equal(value, system);
          assert.deepEqual(record, { contracts: 'synthetic-original' });
          events.push('state');
        },
        async reopenWrappedClaimGraphSystemRecoveryV1(token) {
          consume(token, 'contracts');
          return system;
        },
      };
    },
    recovery: {
      async retainOriginalWrappedRecoverySectionV1(token, section, record) {
        requireAuthority(token);
        assert.equal(section, 'system');
        assert.equal(record.schema, 'WRAPPED_WALLET_SYSTEM_RECOVERY_V1');
        assert.equal(fenced, true);
        events.push('retain');
        if (failRetention) throw Error('HOST_RETENTION_FAILED');
      },
      consumeOriginalWrappedRecoverySectionV1(token, section) {
        requireAuthority(token);
        assert.equal(section, 'system');
        return {
          schema: 'WRAPPED_WALLET_SYSTEM_RECOVERY_V1',
          custody: { credential: 'synthetic-custody' },
          contracts: { contracts: 'synthetic-original' },
          operators: { operators: 'synthetic-original' },
        };
      },
    },
  };
  backend = buildWrappedSystemRecoveryV1(ports);
  other = buildWrappedSystemRecoveryV1(ports);
  return {
    backend,
    other,
    events,
    tokens,
    runtime,
    system,
    bootstrap,
    custodyBootstrap,
    authority,
    capture: { runtime, system, bootstrap, custodyBootstrap, attemptAuthority: authority },
    reopen: {
      runtime,
      nativeRuntimes: [{}, {}],
      graphNativeRuntimes: [{}, {}],
      attemptAuthority: authority,
    },
    fenced: () => fenced,
  };
}

test('fixed system capture fences signing before capture and retains before releasing originals', async () => {
  const value = fixture();
  assert.deepEqual(await value.backend.retainWrappedWalletSystemForReopenV1(value.capture), {
    retained: true,
    originalResourcesStopped: true,
  });
  assert.deepEqual(value.events, [
    'release',
    'fence',
    'custody',
    'contracts',
    'operators',
    'state',
    'retain',
    'close',
    'revoke',
  ]);
  const failed = fixture({ failRetention: true });
  await assert.rejects(
    failed.backend.retainWrappedWalletSystemForReopenV1(failed.capture),
    /HOST_RETENTION_FAILED/,
  );
  assert.equal(failed.fenced(), true);
  assert.deepEqual(failed.events.slice(-3), ['retain', 'close', 'revoke']);
});

test('system part tokens are single use, original-reference bound and isolated per owner', async () => {
  const value = fixture();
  const result = await value.backend.reopenWrappedWalletAcceptanceSystemV1(value.reopen);
  assert.equal(result.system, value.system);
  assert.equal(result.bootstrap, value.bootstrap);
  assert.equal(result.custodyBootstrap, value.custodyBootstrap);
  assert.equal(value.tokens.length, 3);
  assert.equal(new Set(value.tokens).size, 3);
  for (const token of value.tokens)
    assert.throws(
      () => value.backend.consumeWrappedSystemRecoveryPartV1(token, 'custody'),
      /PART_TOKEN/,
    );
  assert.throws(
    () => value.backend.consumeWrappedSystemRecoveryPartV1({}, 'custody'),
    /PART_TOKEN/,
  );
});

test('failed subsystem reopen revokes part tokens and closes only originals already reopened', async () => {
  const value = fixture({ failReopen: true });
  await assert.rejects(
    value.backend.reopenWrappedWalletAcceptanceSystemV1(value.reopen),
    /HOST_REOPEN_FAILED/,
  );
  assert.deepEqual(value.events, ['release', 'revoke']);
  assert.equal(value.tokens.length, 2);
  for (const token of value.tokens)
    assert.throws(
      () => value.backend.consumeWrappedSystemRecoveryPartV1(token, 'operators'),
      /PART_TOKEN/,
    );
});
