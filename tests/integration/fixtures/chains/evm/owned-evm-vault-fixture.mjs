/** Integration-only bootstrap for one owned local PALT -> BLTV delivery.
 * Importing starts no runtime, compiler or prover. Invocation uses the fixed
 * deployment/proof capabilities; every value is local fake value. The caller
 * owns explicit source funding, solver funding and exact token approvals.
 */
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { derivePrivateAssetIdentity } from '@lianum/engine/notes/private-asset-runtime';
import { createNativeRecipientProcess } from '../../../../../packages/backend/src/execution/native/recipients/native-recipient-process.mjs';
import { nativeAdmissionRulesTree, NATIVE_ADMISSION_LOSS_CLAUSE }
  from '@lianum/engine/execution/native/dispatch/native-admission';
import { createOwnedLocalEvmV2, createOwnedExternalDefiReceiverV2 } from '../../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { createOwnedPoolAsset } from '../../../../../packages/backend/src/chains/shared/contracts/owned-pool-asset.mjs';
import { createEvmVaultDeliveryObserver }
  from '../../../../../packages/backend/src/chains/evm/vault/evm-vault-delivery-observer.mjs';
import { validateEvmVaultDeliveryDescriptor }
  from '@lianum/engine/encoding/evm-vault-delivery';
import { deployBackedAssets } from '../../../../../packages/backend/src/operations/deployments/defi/deploy-backed-assets.mjs';
import { deployFlatSystem } from '../../../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import { deployEvmVaultRouter } from '../../../../../packages/backend/src/operations/deployments/defi/deploy-evm-vault-router.mjs';
import { createLocalFlatOperator, createFlatOperatorQuorum } from '../../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { createFlatSystemStateReader } from '../../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { decodeDepositIntentInputs } from '@lianum/engine/execution/inputs/deposit-intent';
import { createOwnedFlatEvmVaultProvider, createOwnedFlatMetaMorphoProviderV1, createOwnedFlatUniswapProviderV1, createOwnedFlatAaveStaticProviderV1 } from '../../../../../packages/backend/src/providers/evm-vault-provider.mjs';
import { createFlatOwnerProcess, createRetainedFlatOwnerProcessV1 } from '../../../../../packages/backend/src/custody/processes/flat-owner-process.mjs';
import { createOfficialProtocolFixture } from '../../../../../packages/backend/tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import { createOfficialAaveFixtureV1 } from '../../../../../packages/backend/tests/fixtures/operations/deployments/system/official-aave-fixture-v1.mjs';
import { createOwnedPrivateExternalRouterV1 } from '../../../../../packages/backend/src/operations/deployments/defi/deploy-private-external-router-v1.mjs';
import { createOwnedMetaMorphoGraphDeliveryObserverV1, prepareOwnedMetaMorphoGraphDescriptorV1,
  createOwnedUniswapGraphDeliveryObserverV1, prepareOwnedUniswapGraphDescriptorV1,
  createOwnedAaveStaticGraphDeliveryObserverV1, prepareOwnedAaveStaticGraphDescriptorV1 }
  from '../../../../../packages/backend/src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';
import { evmRuntimeCodeHash } from '../../../../../packages/backend/src/chains/evm/contracts/evm-code-hash.mjs';
import { freshFixtureId, writeFixturePrivate } from '../../runners/owned-flat-fixture.mjs';

const bare = value => value.slice(2);
const errorCode = error => /^[A-Z0-9_]+$/.test(error?.message ?? '')
  ? error.message : 'EVM_VAULT_FIXTURE_CLEANUP_FAILED';
function privateDirectory(path) {
  const info = lstatSync(path);
  assert.ok(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0,
    'EVM_VAULT_FIXTURE_PRIVATE_DIRECTORY');
}
function positiveUint(value, bits) {
  assert.equal(typeof value, 'string', 'EVM_VAULT_FIXTURE_DECIMAL_STRING');
  assert.ok(/^[1-9][0-9]*$/.test(value) && value.length <= 39, 'EVM_VAULT_FIXTURE_CANONICAL_UINT');
  const parsed = BigInt(value);
  assert.equal(parsed.toString(), value, 'EVM_VAULT_FIXTURE_CANONICAL_UINT');
  assert.ok(parsed < 1n << BigInt(bits), 'EVM_VAULT_FIXTURE_UINT_RANGE');
  return value;
}

/** Two original owner processes share one original EVM/system. Checkpoints and
 * recipient bootstrap records are private keeper material, never public audit.
 * Suspend an owner for an offline interval and restart that same capability;
 * close() is terminal and is reserved for final cleanup.
 */
export async function createOwnedEvmVaultFixture(directory, callbacks = {}) { return vaultFixture(directory,callbacks,false); }
export function createOwnedRetainedMetaMorphoVaultFixtureV1(directory,callbacks={}){assert.ok(arguments.length===1||arguments.length===2);exactRecord(callbacks,Object.keys(callbacks));assert.ok(Object.keys(callbacks).every(key=>['onStage','onDeployment'].includes(key)));return vaultFixture(directory,{...callbacks,protocolProfile:'OFFICIAL_METAMORPHO_V1'},true);}
export function createOwnedRetainedAaveVaultFixtureV1(directory,callbacks={}){assert.ok(arguments.length===1||arguments.length===2);exactRecord(callbacks,Object.keys(callbacks));assert.ok(Object.keys(callbacks).every(key=>['onStage','onDeployment'].includes(key)));return vaultFixture(directory,{...callbacks,protocolProfile:'OFFICIAL_AAVE_STATIC_V1'},true);}
async function vaultFixture(directory,callbacks,retained) {
  privateDirectory(directory);
  const officialAave = callbacks.protocolProfile === 'OFFICIAL_AAVE_STATIC_V1';
  const officialMetaMorpho = callbacks.protocolProfile === 'OFFICIAL_METAMORPHO_V1';
  const officialUniswap = callbacks.protocolProfile === 'OFFICIAL_UNISWAP_V3_V1', official = officialMetaMorpho || officialUniswap || officialAave;
  assert.ok(callbacks.protocolProfile === undefined || official, 'EVM_VAULT_FIXED_PROTOCOL_PROFILE');
  const onStage = callbacks.onStage ?? (async () => {});
  const onDeployment = callbacks.onDeployment ?? (async () => {});
  assert.equal(typeof onStage, 'function'); assert.equal(typeof onDeployment, 'function');
  let recoveryLifetime, runtime, assets, officialProtocol, system, router, evmDelivery, quorum, sourceOwner, targetOwner, rulesTree, cleanupPromise;
  const capabilities = [], operators = [], readers = [], recipients = [], recipientBoots = [], providers = [], rules = [];
  const fixture = {
    get runtime() { return runtime; },
    get assets() { return assets; }, get system() { return system; },
    get officialProtocol() { return officialProtocol; },
    get protocolProfile() { return callbacks.protocolProfile ?? 'LEGACY_VAULT'; },
    get solver() { return official ? runtime.accounts[0] : runtime.accounts[1]; },
    get targetExitRecipient() { return officialMetaMorpho || officialAave ? runtime.accounts[0] : runtime.accounts[4]; },
    get router() { return router; }, get evmDelivery() { return evmDelivery; }, get quorum() { return quorum; },
    get sourceOwner() { return sourceOwner; }, get targetOwner() { return targetOwner; },
    get rulePaths() { return rulesTree?.paths; },
    capabilities, operators, readers, recipients, recipientBoots, providers, rules,
    close() {
      cleanupPromise ??= (async () => {
        const result = { recipients: [], providers: [], operators: [] };
        const close = async resource => {
          if (!resource) return { closed: null };
          try { return { closed: true, status: await resource.close() }; }
          catch (error) { return { closed: false, error: errorCode(error) }; }
        };
        for (const recipient of recipients) result.recipients.push(await close(recipient));
        for (const entry of providers) result.providers.push(await close(entry.provider));
        result.sourceOwner = await close(sourceOwner); result.targetOwner = await close(targetOwner);
        for (const operator of operators) result.operators.push(await close(operator));
        if(recoveryLifetime)result.privateLifetime=await close(recoveryLifetime);
        const evm = await close(runtime);
        result.closedEvm = evm.closed; result.closedEvmStatus = evm.status ?? null;
        if (evm.error) result.closedEvmError = evm.error;
        return result;
      })();
      return cleanupPromise;
    },
  };
  // Keep the original late-created capability by reference; object spread
  // would snapshot undefined before its before-CREATE producer completes.
  if(retained)Object.defineProperty(fixture,'recoveryLifetime',{enumerable:true,get(){return recoveryLifetime;}});
  try {
    await onStage('start-owned-local-evm-v2');
    runtime = await(retained?createOwnedExternalDefiReceiverV2:createOwnedLocalEvmV2)();
    if(retained){const m=await import('../../../chains/evm/external-defi-vault-exit-lifetime-v1.mjs');recoveryLifetime=await m.createExternalVaultExitLifetimeV1(runtime,directory);}
    if (official) {
      await onStage(officialUniswap ? 'deploy-original-official-uniswap-and-tokens' : officialAave ? 'deploy-new-official-aave-static-and-underlying' : 'deploy-original-official-metamorpho-and-underlying');
      officialProtocol = await (officialAave ? createOfficialAaveFixtureV1 : createOfficialProtocolFixture)(runtime);
      const records = [];
      for (const contract of [officialProtocol.first, officialUniswap ? officialProtocol.second : officialProtocol.vault]) records.push(Object.freeze({
        address: contract.address, codeHash: evmRuntimeCodeHash(contract.code),
        symbol: (await officialProtocol.read(contract, 'symbol'))[0], decimals: Number((await officialProtocol.read(contract, 'decimals'))[0]),
        deployment: Object.freeze({ address: contract.address, transactionHash: contract.receipt.transactionHash,
          expectedCode: contract.code, codeHash: evmRuntimeCodeHash(contract.code) }),
      }));
      assets = Object.freeze({ token: records[0], vault: records[1] });
    } else {
      await onStage('deploy-fixed-palt-and-bltv-assets');
      assets = await deployBackedAssets(runtime, {
        domain: '0x' + freshFixtureId(), runtimeId: '0x' + freshFixtureId(), supply: '1000000',
      });
    }
    for (const asset of [assets.token, assets.vault]) capabilities.push(await createOwnedPoolAsset({
      runtime, deployment: asset.deployment, symbol: asset.symbol, decimals: asset.decimals, kind: 'ERC20',
    }));
    // Registry construction precedes system deployment. Use the real BLTV
    // address and EXTCODEHASH, exactly as the destination pool will derive it.
    const shareIdentity = bare(derivePrivateAssetIdentity(runtime.metadata.chainId,
      assets.vault.address, assets.vault.codeHash));
    rules.push({ family: '3', genesis: bare(runtime.metadata.evmGenesis), asset: shareIdentity,
      finalityKind: '3', minimumConfirmations: '1', maximumEvidenceLifetime: '86400', maximumClockSkew: '30' });
    rulesTree = nativeAdmissionRulesTree(rules);
    for (let signerIndex = 0; signerIndex < 4; signerIndex++) operators.push(createLocalFlatOperator({ signerIndex }));
    await onStage('deploy-pinned-twelve-verifier-flat-system');
    system = await deployFlatSystem(runtime, { deploymentDomain: '0x' + freshFixtureId(), registryEpoch: '1',
      rulesRoot: '0x' + rulesTree.root, attesterKeys: operators.map(operator => operator.publicKey),
      pools: capabilities.map(assetCapability => ({ assetCapability,
        policy: '0x' + freshFixtureId(), deploymentDomain: '0x' + freshFixtureId() })), onDeployment });
    assert.equal(Object.keys(system.verifiers).length, 12, 'EVM_VAULT_FIXTURE_TWELVE_VERIFIERS');
    assert.ok(system.verifiers.deposit_intent, 'EVM_VAULT_FIXTURE_D27_VERIFIER');
    assert.equal(system.sender, runtime.accounts[0], 'EVM_VAULT_FIXTURE_SOURCE_SENDER');
    assert.equal(system.pools[1].domain.asset, shareIdentity, 'EVM_VAULT_FIXTURE_SHARE_IDENTITY');
    await onStage('deploy-fixed-evm-vault-router-and-observer');
    if (official) {
      router = await createOwnedPrivateExternalRouterV1({ runtime, system, poolIndex: 1,
        protocolFixture: officialProtocol, protocolKind: officialUniswap ? 'UNISWAP_V3_EXACT_OUTPUT_SINGLE' : officialAave ? 'AAVE_V3_STATIC_EXACT_SHARE_MINT' : 'METAMORPHO_V1_EXACT_SHARE_MINT' });
      const observerFactory = officialUniswap ? createOwnedUniswapGraphDeliveryObserverV1 : officialAave ? createOwnedAaveStaticGraphDeliveryObserverV1 : createOwnedMetaMorphoGraphDeliveryObserverV1;
      evmDelivery = await observerFactory({ runtime, system, poolIndex: 1, router,
        protocolFixture: officialProtocol });
    } else {
      router = await deployEvmVaultRouter(runtime, system, { sourcePoolIndex: 0, destinationPoolIndex: 1,
        solver: runtime.accounts[1], backedAssets: assets });
      evmDelivery = await createEvmVaultDeliveryObserver({ runtime, system, poolIndex: 1, router });
    }
    for (const operator of operators) await operator.bind({ runtime, system, bitcoin: null, solana: null,
      evmDelivery, rules, rulePaths: rulesTree.paths });
    quorum = createFlatOperatorQuorum({ operators: operators.slice(0, 3) });
    await onStage('start-source-and-destination-owner-processes');
    for (let poolIndex = 0; poolIndex < 2; poolIndex++) {
      readers.push(await createFlatSystemStateReader({ runtime, system, poolIndex }));
      const ownerDirectory = join(directory, poolIndex === 0 ? 'source-owner' : 'target-owner');
      mkdirSync(ownerDirectory, { mode: 0o700 });
      const owner = await(retained?createRetainedFlatOwnerProcessV1:createFlatOwnerProcess)({ runtime, system, poolIndex, directory: ownerDirectory,
        password: freshFixtureId(), create: true, checkpoint: null,
        onCheckpoint: value => writeFixturePrivate(join(ownerDirectory, 'checkpoint.json'), value),
        ...(poolIndex === 1 ? { deliveryObserver: evmDelivery } : {}) });
      if (poolIndex === 0) sourceOwner = owner; else targetOwner = owner;
    }
    return fixture;
  } catch (error) {
    // Preserve completed CREATEs even if a later bootstrap guard fails before
    // this fixture is returned to its owner. Never infer a funded graph here.
    if (runtime) writeFixturePrivate(join(directory, 'failed-bootstrap.json'), {
      metadata: runtime.metadata, transactions: runtime.transactions, receipts: runtime.receipts });
    error.fixtureCleanup = await fixture.close(); throw error;
  }
}

/** Prepare one real owner-authorized graph after the caller has reconciled its
 * source PALT deposit. a is solver PALT, q is delivered BLTV, B is private PALT
 * payout/reserved budget. The destination key/opening/D27 witness stay inside
 * targetOwner; only its completed proof and public statement leave that child.
 */
export async function prepareEvmVaultFixtureGraph(fixture, directory, options, onProof = async () => {}) {
  exactRecord(options, ['assetAmount', 'shareAmount', 'payoutAmount', 'cutoff']);
  const assetAmount = positiveUint(options.assetAmount, 128);
  const shareAmount = positiveUint(options.shareAmount, 64);
  const payoutAmount = positiveUint(options.payoutAmount, 64);
  const cutoff = positiveUint(String(options.cutoff), 64);
  assert.equal(typeof onProof, 'function'); privateDirectory(directory);
  assert.equal(fixture.providers.length, 0, 'EVM_VAULT_FIXTURE_ONE_GRAPH');
  assert.equal(fixture.recipients.length, 0, 'EVM_VAULT_FIXTURE_ONE_GRAPH');
  const { runtime, system, router, evmDelivery, sourceOwner, targetOwner, quorum } = fixture;
  const now = await runtime.time(), domain = system.pools[0].domain, operationId = freshFixtureId();
  assert.ok(BigInt(cutoff) > now + 1800n, 'EVM_VAULT_FIXTURE_GRAPH_WINDOW');
  const executionFrom = String(now), executionUntil = String(BigInt(cutoff) - 60n);
  await targetOwner.owner.prepareDepositIntent({ amount: shareAmount, validFrom: executionFrom,
    validUntil: executionUntil, exitRecipient: bare(fixture.targetExitRecipient) });
  const depositProof = await targetOwner.ownerProof.proveDepositIntent();
  const statement = decodeDepositIntentInputs(depositProof.publicInputs);
  assert.equal(statement.amount, shareAmount); assert.equal(statement.validFrom, executionFrom);
  assert.equal(statement.validUntil, executionUntil);
  await onProof({ label: 'target-deposit-intent', relation: 'deposit_intent', proof: depositProof });
  const descriptor = fixture.officialProtocol
    ? (fixture.protocolProfile === 'OFFICIAL_UNISWAP_V3_V1' ? prepareOwnedUniswapGraphDescriptorV1 : fixture.protocolProfile === 'OFFICIAL_AAVE_STATIC_V1' ? prepareOwnedAaveStaticGraphDescriptorV1 : prepareOwnedMetaMorphoGraphDescriptorV1)({ observer: evmDelivery, router,
      route: { maximumInput: assetAmount, outputAmount: shareAmount, validFrom: executionFrom, validUntil: executionUntil },
      ownerPublicInputs: [...depositProof.publicInputs] })
    : validateEvmVaultDeliveryDescriptor({ identity: router.identity,
      route: { assetAmount, shareAmount, executionFrom, executionUntil },
      publicInputs: depositProof.publicInputs.map(value => BigInt(value).toString(16).padStart(64, '0')) });
  const providerDirectory = join(runtime.metadata.scratchDirectory, 'flat-evm-vault-provider');
  mkdirSync(providerDirectory, { mode: 0o700 });
  const rule = fixture.rules[0], rulePath = fixture.rulePaths[0];
  const providerFactory = fixture.protocolProfile === 'OFFICIAL_AAVE_STATIC_V1' ? createOwnedFlatAaveStaticProviderV1 : fixture.protocolProfile === 'OFFICIAL_UNISWAP_V3_V1' ? createOwnedFlatUniswapProviderV1
    : fixture.officialProtocol ? createOwnedFlatMetaMorphoProviderV1 : createOwnedFlatEvmVaultProvider;
  const provider = await providerFactory({ runtime, system, poolIndex: 0, router,
    observer: evmDelivery, operatorQuorum: quorum, rule, rulePath, descriptor, depositProof: depositProof.proof,
    terms: { scope: domain.scope, policy: domain.policy, asset: domain.asset, amount: shareAmount,
      executionFrom, executionUntil, settleBefore: cutoff },
    acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE, directory: providerDirectory, password: freshFixtureId() });
  const selected = { slot: 0, family: '3', recipientIndex: 1, rule, rulePath, deliveryRiskSalt: null, provider };
  fixture.providers.push(selected);
  const offer = provider.offer();
  const boot = { mode: 'create', path: join(directory, 'evm-vault-recipient.vault'), password: freshFixtureId(),
    expectedTerms: { scope: domain.scope, policy: domain.policy, asset: domain.asset, hubDomain: domain.hubDomain,
      registryCommitment: domain.registryCommitment, operationId, slot: 0, evidencePolicy: offer.evidencePolicy,
      value: payoutAmount, settleBefore: cutoff, actionTemplate: offer.actionTemplate },
    withdrawalRecipient: bare(fixture.solver) };
  const recipient = await createNativeRecipientProcess(boot);
  fixture.recipients.push(recipient); fixture.recipientBoots.push(boot);
  const { settleBefore: _unused, ...actionTemplate } = offer.actionTemplate;
  await sourceOwner.owner.prepareAuthorization({ changeRecipient: bare(runtime.accounts[3]),
    recoveryRecipient: bare(runtime.accounts[3]), nativeConfig: {
      ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(key => [key, domain[key]])),
      operationId, fundingNotBefore: executionFrom, fundingValidUntil: String(now + 1800n), settleBefore: cutoff,
      nodes: [{ id: 'evm-vault-delivery', dependsOn: [], evidencePolicy: offer.evidencePolicy,
        actionTemplate, recipientOffer: await recipient.offer() }],
    } });
  const requests = await sourceOwner.owner.invoiceRequests();
  assert.equal(requests.length, 1, 'EVM_VAULT_FIXTURE_ONE_INVOICE');
  assert.equal(requests[0].slot, 0, 'EVM_VAULT_FIXTURE_INVOICE_SLOT');
  const accepted = await recipient.acceptInvoice(requests[0].invoice);
  await provider.bindQuote({ recipientCustody: recipient });
  selected.deliveryRiskSalt = (await recipient.acceptedQuote()).deliveryRiskSalt;
  await sourceOwner.owner.authorize({ invoiceSignatures: [accepted.invoiceSignature] });
  const proof = await sourceOwner.ownerProof.proveAuthorization();
  await onProof({ label: 'owner-envelope', relation: 'authorization', proof });
  const rolePackets = {};
  for (const name of ['reservation', 'recovery', 'assembler']) rolePackets[name] = (await sourceOwner.roles[name]()).select();
  for (const name of ['local', 'dependency']) {
    rolePackets[name] = [];
    for (let slot = 0; slot < 4; slot++) rolePackets[name].push((await sourceOwner.roles[name](slot)).select());
  }
  return { prepared: { authorization: { proof: proof.proof, publicInputs: [...proof.publicInputs] }, rolePackets },
    providers: fixture.providers,
    destinationDeposit: { descriptor, proof: depositProof.proof, publicInputs: [...depositProof.publicInputs], statement } };
}
