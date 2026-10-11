/** Original system construction and one-use cold recovery, owned by the backend. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const fresh = () => randomBytes(32).toString('hex');
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';
/** @typedef {{close(): unknown}} OperatorBootstrap
 * @typedef {{runtime: object, nativeRuntimes: object[], graphNativeRuntimes: object[], journalRoot: string}} SystemCreateInput
 * @typedef {{runtime: object, system: object, bootstrap: OperatorBootstrap, custodyBootstrap: object, attemptAuthority: object}} SystemCaptureInput
 * @typedef {{runtime: object, nativeRuntimes: object[], graphNativeRuntimes: object[], attemptAuthority: object}} SystemReopenInput
 * @typedef {{createWrappedClaimCustodyBootstrapV1(input: {runtime: object, nativeRuntimes: object[], journalRoot: string}): Promise<object>,
 * revokeWrappedClaimCustodyBootstrapV1(runtime: object, bootstrap: object): unknown,
 * captureWrappedClaimCustodyBootstrapRecoveryV1(runtime: object, bootstrap: object): unknown,
 * reopenWrappedClaimCustodyBootstrapRecoveryV1(token: object): Promise<object>}} SystemCustody
 * @typedef {{createWrappedClaimOperatorBootstrapV1(input: {runtime: object, nativeRuntimes: object[], custodyBootstrap: object}): Promise<OperatorBootstrap>,
 * assertWrappedClaimOperatorBootstrapForSystemV1(bootstrap: OperatorBootstrap, expected: {runtime: object, system: object}): unknown,
 * assertWrappedClaimOperatorCustodyBootstrapV1(bootstrap: OperatorBootstrap, expected: {runtime: object, custodyBootstrap: object}): unknown,
 * fenceWrappedClaimOperatorBootstrapRecoveryV1(bootstrap: OperatorBootstrap): unknown,
 * captureWrappedClaimOperatorBootstrapRecoveryV1(bootstrap: OperatorBootstrap): Promise<unknown>,
 * reopenWrappedClaimOperatorBootstrapRecoveryV1(token: object): Promise<OperatorBootstrap>}} SystemOperators
 * @typedef {{deployWrappedClaimGraphSystemV1(input: {runtime: object, options: {deploymentDomain: string, registryEpoch: string, pools: {policy: string, deploymentDomain: string}[], bootstrap: OperatorBootstrap, custodyBootstrap: object}}): Promise<object>,
 * captureWrappedClaimGraphSystemRecoveryV1(runtime: object, system: object): Promise<unknown>,
 * assertCapturedWrappedClaimSystemUnchangedV1(runtime: object, system: object, record: unknown): Promise<unknown>,
 * reopenWrappedClaimGraphSystemRecoveryV1(token: object): Promise<object>}} SystemContracts
 * @typedef {{released(): unknown, custody(): Promise<SystemCustody>, operators(): Promise<SystemOperators>, contracts(): Promise<SystemContracts>,
 * recovery: {retainOriginalWrappedRecoverySectionV1(token: object, section: string, record: unknown): Promise<unknown>, consumeOriginalWrappedRecoverySectionV1(token: object, section: string): unknown}}} WrappedSystemPorts
 */

/** Fixed composition owns its one-use subsystem tokens. An independently built
 * backend can consume only the tokens it issued itself.
 * @param {WrappedSystemPorts} ports
 */
export function buildWrappedSystemRecoveryV1(ports) {
  exactRecord(ports, ['released', 'custody', 'operators', 'contracts', 'recovery']);
  exactRecord(ports.recovery, [
    'retainOriginalWrappedRecoverySectionV1',
    'consumeOriginalWrappedRecoverySectionV1',
  ]);
  /** @type {readonly ('released'|'custody'|'operators'|'contracts')[]} */
  const loaderNames = ['released', 'custody', 'operators', 'contracts'];
  for (const key of loaderNames) assert.equal(typeof ports[key], 'function');
  for (const method of Object.values(ports.recovery)) assert.equal(typeof method, 'function');
  const {
    released,
    custody: loadCustody,
    operators: loadOperators,
    contracts: loadContracts,
  } = ports;
  const { retainOriginalWrappedRecoverySectionV1, consumeOriginalWrappedRecoverySectionV1 } =
    ports.recovery;
  /** @param {SystemCreateInput} input */
  async function createWrappedWalletAcceptanceSystemV1(input) {
    assert.equal(arguments.length, 1);
    released();
    exactRecord(input, ['runtime', 'nativeRuntimes', 'graphNativeRuntimes', 'journalRoot']);
    fixedArray(input.nativeRuntimes, 2);
    const { createWrappedClaimCustodyBootstrapV1, revokeWrappedClaimCustodyBootstrapV1 } =
      await loadCustody();
    const { createWrappedClaimOperatorBootstrapV1 } = await loadOperators();
    const { deployWrappedClaimGraphSystemV1 } = await loadContracts();
    const custodyBootstrap = await createWrappedClaimCustodyBootstrapV1({
      runtime: input.runtime,
      nativeRuntimes: input.nativeRuntimes,
      journalRoot: input.journalRoot,
    });
    /** @type {OperatorBootstrap | undefined} */
    let bootstrap;
    try {
      bootstrap = await createWrappedClaimOperatorBootstrapV1({
        runtime: input.runtime,
        nativeRuntimes: input.graphNativeRuntimes,
        custodyBootstrap,
      });
      const system = await deployWrappedClaimGraphSystemV1({
        runtime: input.runtime,
        options: {
          deploymentDomain: '0x' + fresh(),
          registryEpoch: '1',
          pools: [0, 1].map(() => ({ policy: '0x' + fresh(), deploymentDomain: '0x' + fresh() })),
          bootstrap,
          custodyBootstrap,
        },
      });
      return Object.freeze({ system, bootstrap, custodyBootstrap });
    } catch (error) {
      // The deployer may refuse before entering its own cleanup try. Retain
      // ownership here until success, then close/revoke only original resources.
      // Failed native allocations remain reserved; there is no replacement/retry.
      const failures = [];
      try {
        bootstrap?.close();
      } catch (cause) {
        failures.push(cause);
      }
      try {
        revokeWrappedClaimCustodyBootstrapV1(input.runtime, custodyBootstrap);
      } catch (cause) {
        failures.push(cause);
      }
      if (failures.length)
        throw new AggregateError(
          [error, ...failures],
          'WRAPPED_ACCEPTANCE_BOOTSTRAP_CLEANUP_INCOMPLETE',
          { cause: error },
        );
      throw error;
    }
  }
  // Each subsystem token is private, one-use, and valid only during the original
  // authority's ordered system reopen. There is no public issue-token operation.
  /** @type {WeakMap<object, {part: string, value: unknown, used: boolean, active: boolean}>} */
  const systemRecoveryPartsV1 = new WeakMap();
  /** @param {object} token @param {string} part */
  function consumeWrappedSystemRecoveryPartV1(token, part) {
    assert.equal(arguments.length, 2);
    const entry = systemRecoveryPartsV1.get(token);
    assert.ok(
      entry && entry.part === part && !entry.used && entry.active,
      'WRAPPED_RECOVERY_SYSTEM_PART_TOKEN',
    );
    entry.used = true;
    return entry.value;
  }
  /** @template T @param {string} part @param {unknown} value @param {(token: object) => Promise<T>} work @returns {Promise<T>} */
  async function withSystemRecoveryPartV1(part, value, work) {
    const token = Object.freeze(Object.create(null)),
      entry = { part, value, used: false, active: true };
    systemRecoveryPartsV1.set(token, entry);
    try {
      const result = await work(token);
      assert.equal(entry.used, true, 'WRAPPED_RECOVERY_SYSTEM_PART_UNUSED');
      return result;
    } finally {
      entry.active = false;
      systemRecoveryPartsV1.delete(token);
    }
  }
  /** @param {SystemCaptureInput} input */
  async function retainWrappedWalletSystemForReopenV1(input) {
    assert.equal(arguments.length, 1);
    released();
    exactRecord(input, ['runtime', 'system', 'bootstrap', 'custodyBootstrap', 'attemptAuthority']);
    const { runtime, system, bootstrap, custodyBootstrap, attemptAuthority } = input;
    const op = await loadOperators();
    const custody = await loadCustody();
    const contracts = await loadContracts();
    op.assertWrappedClaimOperatorBootstrapForSystemV1(bootstrap, { runtime, system });
    op.assertWrappedClaimOperatorCustodyBootstrapV1(bootstrap, { runtime, custodyBootstrap });
    try {
      op.fenceWrappedClaimOperatorBootstrapRecoveryV1(bootstrap);
      const record = {
        schema: 'WRAPPED_WALLET_SYSTEM_RECOVERY_V1',
        custody: custody.captureWrappedClaimCustodyBootstrapRecoveryV1(runtime, custodyBootstrap),
        contracts: await contracts.captureWrappedClaimGraphSystemRecoveryV1(runtime, system),
        operators: await op.captureWrappedClaimOperatorBootstrapRecoveryV1(bootstrap),
      };
      await contracts.assertCapturedWrappedClaimSystemUnchangedV1(
        runtime,
        system,
        record.contracts,
      );
      await retainOriginalWrappedRecoverySectionV1(attemptAuthority, 'system', record);
      // Operator capture irreversibly fences original signing before its first
      // await. A failed durable write stays fenced. A failed close leaves this
      // section RETAINED, never falsely CAPTURED or reopenable.
      await bootstrap.close();
      custody.revokeWrappedClaimCustodyBootstrapV1(runtime, custodyBootstrap);
      return { retained: true, originalResourcesStopped: true };
    } catch (error) {
      const failures = [];
      try {
        await bootstrap.close();
      } catch (e) {
        failures.push(e);
      }
      try {
        custody.revokeWrappedClaimCustodyBootstrapV1(runtime, custodyBootstrap);
      } catch (e) {
        failures.push(e);
      }
      if (failures.length)
        throw new AggregateError(
          [error, ...failures],
          'WRAPPED_RECOVERY_SYSTEM_CAPTURE_CLEANUP_FAILED',
          { cause: error },
        );
      throw error;
    }
  }
  /** @param {SystemReopenInput} input */
  async function reopenWrappedWalletAcceptanceSystemV1(input) {
    assert.equal(arguments.length, 1);
    released();
    exactRecord(input, ['runtime', 'nativeRuntimes', 'graphNativeRuntimes', 'attemptAuthority']);
    fixedArray(input.nativeRuntimes, 2);
    const record = consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority, 'system');
    exactRecord(record, ['schema', 'custody', 'contracts', 'operators']);
    assert.equal(record.schema, 'WRAPPED_WALLET_SYSTEM_RECOVERY_V1');
    const custody = await loadCustody();
    const op = await loadOperators();
    const contracts = await loadContracts();
    const { runtime } = input;
    /** @type {object | undefined} */
    let custodyBootstrap;
    /** @type {OperatorBootstrap | undefined} */
    let bootstrap;
    try {
      custodyBootstrap = await withSystemRecoveryPartV1(
        'custody',
        { runtime, nativeRuntimes: input.nativeRuntimes, record: record.custody },
        (token) => custody.reopenWrappedClaimCustodyBootstrapRecoveryV1(token),
      );
      bootstrap = await withSystemRecoveryPartV1(
        'operators',
        {
          runtime,
          nativeRuntimes: input.graphNativeRuntimes,
          custodyBootstrap,
          record: record.operators,
        },
        (token) => op.reopenWrappedClaimOperatorBootstrapRecoveryV1(token),
      );
      const system = await withSystemRecoveryPartV1(
        'contracts',
        { runtime, bootstrap, custodyBootstrap, record: record.contracts },
        (token) => contracts.reopenWrappedClaimGraphSystemRecoveryV1(token),
      );
      return Object.freeze({ system, bootstrap, custodyBootstrap });
    } catch (error) {
      const failures = [];
      if (bootstrap)
        try {
          await bootstrap.close();
        } catch (e) {
          failures.push(e);
        }
      if (custodyBootstrap)
        try {
          custody.revokeWrappedClaimCustodyBootstrapV1(runtime, custodyBootstrap);
        } catch (e) {
          failures.push(e);
        }
      if (failures.length)
        throw new AggregateError(
          [error, ...failures],
          'WRAPPED_RECOVERY_SYSTEM_REOPEN_CLEANUP_FAILED',
          { cause: error },
        );
      throw error;
    }
  }

  return Object.freeze({
    createWrappedWalletAcceptanceSystemV1,
    consumeWrappedSystemRecoveryPartV1,
    retainWrappedWalletSystemForReopenV1,
    reopenWrappedWalletAcceptanceSystemV1,
  });
}
