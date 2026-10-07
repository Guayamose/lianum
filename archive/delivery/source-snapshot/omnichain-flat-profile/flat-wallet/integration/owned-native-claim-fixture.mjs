/** One explicitly synthetic local custody deployment. Native keys and nodes
 * belong to this keeper; owner-child/controller restart is not node restart. */
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createOwnedLocalEvmV2 } from '../wallet-platform/modules/chain-adapters/owned-evm-v2-runtime.mjs';
import { createOwnedBitcoinCustodyRuntime, createOwnedCombinedBitcoinRuntime }
  from '../wallet-platform/modules/chain-adapters/owned-bitcoin-runtime.mjs';
import { createOwnedSolanaCustodyRuntime, createOwnedCombinedSolanaRuntime }
  from '../wallet-platform/modules/chain-adapters/owned-solana-runtime.mjs';
import { createNativeClaimBootstrap, createNativeClaimIngressV3Bootstrap, deployNativeClaimSystem,
  preflightNativeClaimIngressV3Artifacts } from '../wallet-platform/modules/ops/deploy-native-claims.mjs';
import { createOwnedClaimObserver } from '../wallet-platform/modules/native-claims/owned-state.mjs';
import { createLocalClaimOperator, createClaimOperatorQuorum } from '../wallet-platform/modules/native-claims/operators.mjs';
import { createCombinedLocalNativeOperator } from '../wallet-platform/modules/ops/combined-native-operators.mjs';
import { createFlatOperatorQuorum } from '../wallet-platform/modules/ops/native-operators.mjs';
import { createFlatOwnerNativeClaimObserver } from '../mobile-core/flat-owner-native-claim-observer.mjs';
import { createFlatOwnerProcess } from '../mobile-core/flat-owner-process.mjs';
import { freshFixtureId, writeFixturePrivate } from './owned-flat-fixture.mjs';

function privateDirectory(path) {
  const stat = lstatSync(path);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0,
    'NATIVE_CLAIM_FIXTURE_PRIVATE_DIRECTORY');
}
const safeCode = error => /^[A-Z][A-Z0-9_]{2,120}$/.exec(error?.message ?? '')?.[0] === error?.message
  ? error.message : 'NATIVE_CLAIM_FIXTURE_UNRESOLVED';

export async function createOwnedNativeClaimFixture(directory, callbacks = {}) {
  return createFixture(directory, callbacks, false);
}

/** Fixed claim custody and ordinary graph delivery on the same owned nodes.
 * Graph solver keys remain separate from claim escrow. The two operator
 * branches share each original registry key, never imported replacement keys.
 */
export async function createOwnedNativeClaimGraphFixture(directory, callbacks = {}) {
  return createFixture(directory, callbacks, true);
}

/** Explicit fresh V3 deployment; no profile/artifact overrides or reuse. */
export async function createOwnedNativeClaimGraphV3Fixture(directory, callbacks = {}) {
  return createFixture(directory, callbacks, true, true);
}

async function createFixture(directory, callbacks, withGraph, ingressV3 = false) {
  privateDirectory(directory);
  const onStage = callbacks.onStage ?? (async () => {});
  const onDeployment = callbacks.onDeployment ?? (async () => {});
  assert.equal(typeof onStage, 'function'); assert.equal(typeof onDeployment, 'function');
  let runtime, bitcoin, solana, graphBitcoin, graphSolana, claims, bootstrap, observer, quorum, graphQuorum;
  let cleanupPromise, failedSolanaCleanup;
  const operators = [], graphOperators = [], owners = [], resources = [];
  const fixture = {
    get runtime() { return runtime; }, get bitcoin() { return bitcoin; }, get solana() { return solana; },
    get graphBitcoin() { return graphBitcoin; }, get graphSolana() { return graphSolana; },
    get claims() { return claims; }, get system() { return claims?.flatSystem; },
    get observer() { return observer; }, get quorum() { return quorum; },
    get graphQuorum() { return graphQuorum; },
    get rules() { return bootstrap?.rules; }, get rulePaths() { return bootstrap?.rulePaths; },
    operators, graphOperators, owners, resources,
    async createOwner(poolIndex, label) {
      assert.ok(poolIndex === 0 || poolIndex === 1, 'NATIVE_CLAIM_OWNER_POOL');
      assert.ok(typeof label === 'string' && /^[a-z][a-z0-9-]{0,40}$/.exec(label)?.[0] === label,
        'NATIVE_CLAIM_OWNER_LABEL');
      const path = join(directory, 'owner-' + label); mkdirSync(path, { mode: 0o700 });
      const nativeClaimObserver = await createFlatOwnerNativeClaimObserver({ runtime,
        system: claims.flatSystem, poolIndex, claims, claimObserver: observer });
      const owner = await createFlatOwnerProcess({ runtime, system: claims.flatSystem, poolIndex,
        directory: path, password: freshFixtureId(), create: true, checkpoint: null,
        onCheckpoint: value => writeFixturePrivate(join(path, 'checkpoint.json'), value), nativeClaimObserver });
      owners.push({ owner, poolIndex, label }); return owner;
    },
    close() {
      cleanupPromise ??= (async () => {
        const result = { owners: [], resources: [], operators: [] };
        const closed = new Map();
        const close = async value => {
          if (!value) return { closed: null };
          if (!closed.has(value)) closed.set(value, (async () => {
            try { return { closed: true, result: await value.close() }; }
            catch (error) { return { closed: false, error: safeCode(error) }; }
          })());
          return closed.get(value);
        };
        for (const resource of [...resources].reverse()) result.resources.push(await close(resource));
        for (const entry of owners) result.owners.push(await close(entry.owner));
        // Combined claim.close() closes both branches through their shared
        // custody. Native custody.close() stops the node shared by both views.
        for (const operator of operators) result.operators.push(await close(operator));
        result.solana = failedSolanaCleanup ?? await close(solana);
        result.bitcoin = await close(bitcoin); result.evm = await close(runtime);
        result.closedSolana = result.solana.closed === true && result.solana.result?.ownedProcessStopped === true;
        result.closedBitcoin = result.bitcoin.closed === true && result.bitcoin.result?.ownedProcessStopped === true;
        result.closedEvm = result.evm.closed === true && result.evm.result?.stopped === true;
        return result;
      })();
      return cleanupPromise;
    },
  };
  try {
    if (ingressV3) {
      await onStage('preflight-genuine-claim-artifacts-before-nodes');
      await preflightNativeClaimIngressV3Artifacts();
    }
    await onStage('start-owned-evm'); runtime = await createOwnedLocalEvmV2();
    await onStage('start-owned-bitcoin-custody');
    if (withGraph) ({ custody: bitcoin, graph: graphBitcoin } = await createOwnedCombinedBitcoinRuntime());
    else bitcoin = await createOwnedBitcoinCustodyRuntime();
    await onStage('start-owned-solana-custody');
    try {
      if (withGraph) ({ custody: solana, graph: graphSolana } = await createOwnedCombinedSolanaRuntime());
      else solana = await createOwnedSolanaCustodyRuntime();
    }
    catch (error) {
      if (error.cleanup) failedSolanaCleanup = { closed: error.cleanup.ownedProcessStopped === true,
        result: error.cleanup, constructorFailed: true };
      writeFixturePrivate(join(directory, 'failed-solana-bootstrap.json'), {
        errorCode: safeCode(error), cleanup: error.cleanup ?? null,
        ...(ingressV3 ? { preparationByAuthority: error.nonceBootstrapPreparationByAuthority ?? null,
          bootstrapByAuthority: error.nonceBootstrapByAuthority ?? null }
          : { preparation: error.nonceBootstrapPreparation ?? null, bootstrap: error.nonceBootstrap ?? null }) });
      throw error;
    }
    const journalRoot = join(directory, 'claim-keepers'); mkdirSync(journalRoot, { mode: 0o700 });
    await onStage('preflight-owned-native-claim-custody');
    bootstrap = await (ingressV3 ? createNativeClaimIngressV3Bootstrap : createNativeClaimBootstrap)(
      { runtime, nativeRuntimes: [bitcoin, solana], journalRoot });
    for (let signerIndex = 0; signerIndex < 4; signerIndex++) {
      if (withGraph) {
        const operator = createCombinedLocalNativeOperator({ signerIndex });
        operators.push(operator.claim); graphOperators.push(operator.graph);
        assert.deepEqual(operator.claim.publicKey, operator.graph.publicKey, 'NATIVE_CLAIM_GRAPH_OPERATOR_KEY');
      } else operators.push(createLocalClaimOperator({ signerIndex }));
    }
    await onStage('deploy-genuine-claim-verifiers-and-pools');
    claims = await deployNativeClaimSystem(runtime, {
      deploymentDomain: '0x' + freshFixtureId(), registryEpoch: '1', rulesRoot: bootstrap.rulesRoot,
      attesterKeys: operators.map(operator => operator.publicKey),
      pools: [0, 1].map(() => ({ policy: '0x' + freshFixtureId(), deploymentDomain: '0x' + freshFixtureId() })),
      nativeClaimBootstrap: bootstrap, onDeployment,
    });
    observer = await createOwnedClaimObserver({ runtime, claims });
    for (const operator of operators) await operator.bind(observer);
    quorum = createClaimOperatorQuorum({ operators: operators.slice(0, 3) });
    if (withGraph) {
      for (const operator of graphOperators) await operator.bind({ runtime, system: claims.flatSystem,
        bitcoin: graphBitcoin, solana: graphSolana, rules: bootstrap.rules, rulePaths: bootstrap.rulePaths });
      graphQuorum = createFlatOperatorQuorum({ operators: graphOperators.slice(0, 3) });
    }
    await onStage('owned-claim-account-ready'); return fixture;
  } catch (error) {
    if (runtime) writeFixturePrivate(join(directory, 'failed-bootstrap.json'), {
      metadata: runtime.metadata, transactions: runtime.transactions, receipts: runtime.receipts });
    error.fixtureCleanup = await fixture.close(); throw error;
  }
}
