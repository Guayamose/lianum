/** Genuine private bootstrap. No owned brand, runtime, endpoint, source loader,
 * proof factory, journal, keeper or account can be injected by an acceptance. */
import assert from 'node:assert/strict';
import { POOL_GENERATION_PHASE1_RELEASE, POOL_GENERATION_PHASE2_RELEASE } from '../../pools/pool-generation-acceptance-policy.mjs';
import { mkdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createOwnedLocalEvmV2PoolGenerationAcceptance, ownedPoolGenerationTransportControls }
  from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { loadAppendOnlyDeploymentArtifacts } from '../../../../packages/backend/src/operations/deployments/system/append-only-deployment-artifacts.mjs';
import { deployFlatAppendOnlySystem, assertOwnedFlatSystem } from '../../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import { deployBackedAssets, loadBackedAssetDeploymentArtifacts } from '../../../../packages/backend/src/operations/deployments/defi/deploy-backed-assets.mjs';
import { createOwnedPoolAsset } from '../../../../packages/backend/src/chains/shared/contracts/owned-pool-asset.mjs';
import { createLocalFlatOperator } from '../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { createFlatOwnerProcess } from '../../../../packages/backend/src/custody/processes/flat-owner-process.mjs';
import { createFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createFlatPortfolioAuthority } from '../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { createFlatPoolAdmissionPolicy } from '../../../../packages/backend/src/accounts/authority/flat-pool-admission-policy.mjs';
import { createFlatJournalGeneration } from '../../../../packages/backend/src/accounts/storage/flat-journal-catalogue.mjs';
import { createFlatSystemStateReader } from '../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { freshFixtureId, writeFixturePrivate } from '../runners/owned-flat-fixture.mjs';
import { nativeAdmissionRulesTree } from '@lianum/engine/execution/native/dispatch/native-admission';
import { derivePrivateAssetIdentity } from '@lianum/engine/notes/private-asset-runtime';

export async function createOwnedPoolGenerationFixture(directory, onProof) {
  assert.equal(arguments.length, 2); assert.equal(typeof onProof, 'function');
  assert.ok(POOL_GENERATION_PHASE1_RELEASE || POOL_GENERATION_PHASE2_RELEASE, 'POOL_GENERATION_FIXTURE_NOT_RELEASED');
  const info = lstatSync(directory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0);
  const owners = [], accounts = [], portfolios = [], operators = [], groups = [];
  let runtime, system, assets, capabilities, closing;
  const fixture = {
    get runtime() { return runtime; }, get system() { return system; }, get assets() { return assets; },
    get capabilities() { return capabilities; }, groups,
    get transport() { return ownedPoolGenerationTransportControls(runtime); },
    async openGeneration(original, label) {
      assertOwnedFlatSystem(runtime, original);
      assert.ok(label === 'original' && groups.length === 0 || label === 'successor' && groups.length === 1,
        'POOL_GENERATION_FIXED_OWNER_GROUPS');
      assert.equal(original.pools.length, label === 'original' ? 2 : 1);
      const group = { system: original, owners: [], accounts: [], readers: [], portfolio: null, generation: null };
      groups.push(group);
      for (let poolIndex = 0; poolIndex < original.pools.length; poolIndex++) {
        const ownerDirectory = join(directory, label + '-owner-' + poolIndex); mkdirSync(ownerDirectory, { mode: 0o700 });
        const owner = await createFlatOwnerProcess({ runtime, system: original, poolIndex,
          directory: ownerDirectory, password: freshFixtureId(), create: true, checkpoint: null,
          onCheckpoint: value => writeFixturePrivate(join(ownerDirectory, 'checkpoint.json'), value) });
        owners.push(owner); group.owners.push(owner);
        const account = await createFlatAccountAuthority({ runtime, system: original, poolIndex, owner,
          nativeExecution: null, accountId: 'pool_' + label + '_account_' + poolIndex,
          journalId: 'pool_' + label + '_journal_' + poolIndex }, { onProof });
        accounts.push(account); group.accounts.push(account);
        group.readers.push(await createFlatSystemStateReader({ runtime, system: original, poolIndex }));
      }
      const members = group.accounts.map((account, poolIndex) => ({ poolIndex, account }));
      const admissions = await createFlatPoolAdmissionPolicy({ runtime, system: original, accounts: members,
        routeOrder: group.accounts.map(account => account.assetId) });
      group.portfolio = createFlatPortfolioAuthority({ runtime, system: original, accounts: members,
        accountId: 'pool_' + label + '_portfolio', journalId: 'pool_' + label + '_portfolio_journal', poolAdmissions: admissions });
      portfolios.push(group.portfolio);
      group.generation = await createFlatJournalGeneration({ runtime, portfolio: group.portfolio, poolAdmissions: admissions,
        journal: { path: join(directory, label + '-mixed-portfolio.vault'), password: freshFixtureId() } });
      return group;
    },
    close() {
      closing ??= (async () => {
        // The caller must close its original catalogue/session before this.
        const cleanup = { owners: [], accounts: [], closedEvm: false };
        await Promise.allSettled(accounts.map(account => account.abort()));
        for (const portfolio of portfolios) { try { portfolio.close(); } catch {} }
        for (const account of accounts) {
          try { cleanup.accounts.push(await account.close()); } catch { cleanup.accounts.push({ closed: false }); }
        }
        for (const owner of owners) {
          try { cleanup.owners.push(await owner.close()); } catch { cleanup.owners.push({ closed: false }); }
        }
        for (const operator of operators) { try { operator.close(); } catch {} }
        if (runtime) { cleanup.closedEvmStatus = await runtime.close(); cleanup.closedEvm = true; }
        return cleanup;
      })();
      return closing;
    },
  };
  try {
    // Before ANY CREATE, load every retained source/key/ABI/toolchain lineage.
    // This is deliberately never reached in source-only host tests.
    const bundle = await loadAppendOnlyDeploymentArtifacts();
    assert.equal(Object.keys(bundle.verifiers).length, 12);
    loadBackedAssetDeploymentArtifacts();
    runtime = await createOwnedLocalEvmV2PoolGenerationAcceptance();
    assets = await deployBackedAssets(runtime, { domain: '0x' + freshFixtureId(), runtimeId: '0x' + freshFixtureId(), supply: '1000000' });
    capabilities = [];
    for (const asset of [assets.token, assets.vault]) capabilities.push(await createOwnedPoolAsset({
      runtime, deployment: asset.deployment, symbol: asset.symbol, decimals: asset.decimals, kind: 'ERC20' }));
    const rules = nativeAdmissionRulesTree([{ family: '3', genesis: runtime.metadata.evmGenesis.slice(2),
      asset: derivePrivateAssetIdentity('31337', assets.vault.address, assets.vault.codeHash).slice(2),
      finalityKind: '3', minimumConfirmations: '1', maximumEvidenceLifetime: '86400', maximumClockSkew: '30' }]);
    for (let signerIndex = 0; signerIndex < 4; signerIndex++) operators.push(createLocalFlatOperator({ signerIndex }));
    system = await deployFlatAppendOnlySystem(runtime, { deploymentDomain: '0x' + freshFixtureId(), registryEpoch: '1',
      rulesRoot: '0x' + rules.root, attesterKeys: operators.map(operator => operator.publicKey),
      pools: capabilities.map(assetCapability => ({ assetCapability, policy: '0x' + freshFixtureId(),
        deploymentDomain: '0x' + freshFixtureId() })),
      onDeployment: async () => writeFixturePrivate(join(directory, 'deployment-audit.json'), {
        transactions: runtime.transactions, receipts: runtime.receipts }) });
    assert.equal(system.deploymentProfile, 'LIANUM_FLAT_APPEND_ONLY_POOLS_V2');
    assert.deepEqual(system.provenance, bundle.provenance);
    return fixture;
  } catch (error) {
    if (runtime) writeFixturePrivate(join(directory, 'failed-bootstrap.json'), { transactions: runtime.transactions, receipts: runtime.receipts });
    error.fixtureCleanup = await fixture.close(); throw error;
  }
}
