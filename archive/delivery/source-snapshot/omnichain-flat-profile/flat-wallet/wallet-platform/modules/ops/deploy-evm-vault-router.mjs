/** Fixed, source-pinned router bootstrap for owned local fake-value systems.
 * Importing starts no compiler, prover or runtime. No caller code/RPC/pins. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { assertLocalEvm } from '../chain-adapters/local-evm-ownership.mjs';
import { LOCAL_EVM_PROFILE } from '../chain-adapters/owned-evm-v2-runtime.mjs';
import { GENERIC_COMPILER_PIN } from '../../../../../omnichain-product/src/paeg/local-deployment.mjs';
import { deriveNativeRuntimeCode, predictNativeCreateAddress, nativeStaticArguments, nativeStaticCalldata }
  from '../../../../../omnichain-product/src/paeg/native-deployment.mjs';
import { evmRuntimeCodeHash } from '../chain-adapters/evm-code-hash.mjs';
import { exactRecord } from '../paeg/commitments.mjs';
import { assertOwnedFlatSystem } from './deploy-system.mjs';
import { assertOwnedBackedAssets, loadBackedAssetDeploymentArtifacts } from './deploy-backed-assets.mjs';
import { assertOwnedPoolAsset } from '../chain-adapters/owned-pool-asset.mjs';
import { validateEvmVaultDeliveryIdentity, EVM_VAULT_DELIVERY_SELECTOR, EVM_VAULT_DEPOSIT_SELECTOR }
  from '../chain-adapters/evm-vault-delivery.mjs';

const root = new URL('../../../', import.meta.url), owned = new WeakMap(), attempts = new WeakSet();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const codeSHA = code => sha(Buffer.from(code.slice(2), 'hex'));
const codeHash = evmRuntimeCodeHash;
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const digestJSON = value => sha(canonical(value));
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const bare = value => value.slice(2);
const word = value => '0x' + BigInt(value).toString(16).padStart(64, '0');
const CONSTRUCTOR_FIELDS = ['solver', 'asset', 'vault', 'targetPool', 'assetCodeSHA256', 'vaultCodeSHA256',
  'targetPoolCodeSHA256', 'genesisHash', 'ledgerNamespace', 'vaultDomain', 'vaultRuntimeId', 'targetDomain', 'targetScope', 'targetPolicy'];
export const EVM_VAULT_ROUTER_BUILD_PIN = freeze({
  manifestSHA256: '94b18560d09e3cbeb5397a6e469b93e3526817521dc52e9b3ebf21905c23f7f6',
  format: 'FIXED_EVM_VAULT_ROUTER_BUILD_V1',
  compiledSHA256: '3e0fdd43584894e07719068de1248102e50e4757fe8491eaa033f750bc282e97',
  settingsSHA256: '96d0fa28f9e3e67bb711ed7dc213ae1cc9c0e4646c243806b3c3167cb5698cff',
  source: 'PrivateVaultDeliveryRouter.sol', contract: 'PrivateVaultDeliveryRouter',
  sourceSHA256: '2f8dfefec6f77637bbd90bee9e5d89a312ec356959944d87fa17da1cfe6ab2bc',
  sourceASTSHA256: 'eeb54f72bfde069374381e1949ffc0c29bdefcb4b448fdc3d2a48da75a37126a',
  artifactSHA256: '5daf5ea7af23ff73a97c978da9686d1a1a951d4c707f5467059e07b7bc715cf1',
  abiSHA256: 'a11413308a8570fee7cdb2dfd6dd3fe25031b71d1fd43405ea09f396b44ef2f7',
  creationSHA256: '28c192b97564adcbced8056fedba3017f2f7f8550c88f6b46e4135f3dad6f0e6',
  runtimeTemplateSHA256: '2a9e8d73c7f0ac0f1d4d529ddee73798d9604ef331aea232d8726e90fa83760a',
  creationBytes: 27712, runtimeBytes: 22929,
  immutableNames: { 348: 'solver', 351: 'asset', 354: 'vault', 357: 'targetPool', 359: 'assetCodeSHA256',
    361: 'vaultCodeSHA256', 363: 'targetPoolCodeSHA256', 365: 'genesisHash', 367: 'ledgerNamespace',
    369: 'vaultDomain', 371: 'vaultRuntimeId', 373: 'targetDomain', 375: 'targetScope', 377: 'targetPolicy',
    379: 'assetIdentity', 381: 'shareIdentity' },
});
function pinnedJSON(path, pin) {
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4_000_000, 'EVM_ROUTER_ARTIFACT_FILE');
  const bytes = readFileSync(path); assert.equal(sha(bytes), pin, 'EVM_ROUTER_ARTIFACT_FILE_PIN'); return JSON.parse(bytes);
}
/** Existing compiler output only. No path/configuration override or fallback. */
export function loadEvmVaultRouterDeploymentArtifacts() {
  assert.equal(arguments.length, 0, 'EVM_ROUTER_ARTIFACT_NO_OPTIONS');
  const pin = EVM_VAULT_ROUTER_BUILD_PIN;
  const manifest = pinnedJSON(new URL('.local/evm-vault-router/v1/manifest.json', root), pin.manifestSHA256);
  const compilation = pinnedJSON(new URL('.local/evm-vault-router/v1/compiled.json', root), pin.compiledSHA256);
  for (const [key, value] of Object.entries(pin).filter(([key]) => key !== 'manifestSHA256'))
    assert.deepEqual(manifest[key], value, 'EVM_ROUTER_MANIFEST_PIN');
  assert.equal(compilation.classification, 'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');
  assert.equal(compilation.profile, 'standard'); assert.deepEqual(compilation.warnings, []);
  assert.deepEqual(compilation.compiler, GENERIC_COMPILER_PIN); assert.deepEqual(manifest.compiler, GENERIC_COMPILER_PIN);
  assert.equal(digestJSON(compilation.settings), pin.settingsSHA256); assert.deepEqual(manifest.settings, compilation.settings);
  assert.deepEqual(Object.keys(compilation.contracts), [pin.source]); assert.deepEqual(Object.keys(compilation.sourceASTs), [pin.source]);
  assert.deepEqual(Object.keys(compilation.contracts[pin.source]).sort(),
    ['IPrivateDeliveryPool', 'IPrivateDeliveryToken', 'IPrivateDeliveryVault', pin.contract]);
  const source = readFileSync(new URL('contracts/fixtures/' + pin.source, root));
  assert.equal(sha(source), pin.sourceSHA256, 'EVM_ROUTER_SOURCE_PIN');
  assert.deepEqual(compilation.sources, [{ name: pin.source, sha256: pin.sourceSHA256, bytes: source.length }]);
  const artifact = compilation.contracts[pin.source][pin.contract], ast = compilation.sourceASTs[pin.source];
  assert.equal(digestJSON(artifact), pin.artifactSHA256); assert.equal(digestJSON(artifact.abi), pin.abiSHA256);
  assert.equal(digestJSON(ast), pin.sourceASTSHA256);
  const definitions = ast.nodes.filter(node => node.nodeType === 'ContractDefinition' && node.name === pin.contract);
  assert.equal(definitions.length, 1); assert.equal(definitions[0].contractKind, 'contract');
  const immutableNames = Object.fromEntries(definitions[0].nodes.filter(node => node.nodeType === 'VariableDeclaration'
    && node.mutability === 'immutable').map(node => [node.id, node.name]));
  assert.deepEqual(immutableNames, pin.immutableNames);
  const constructors = artifact.abi.filter(item => item.type === 'constructor');
  assert.equal(constructors.length, 1); assert.equal(constructors[0].stateMutability, 'nonpayable');
  assert.equal(constructors[0].inputs.length, 1); assert.equal(constructors[0].inputs[0].type, 'tuple');
  assert.deepEqual(constructors[0].inputs[0].components.map(({ name, type }) => [name, type]),
    CONSTRUCTOR_FIELDS.map((name, i) => [name, i < 4 ? 'address' : 'bytes32']));
  for (const [kind, expected, length] of [['bytecode', pin.creationSHA256, pin.creationBytes],
    ['deployedBytecode', pin.runtimeTemplateSHA256, pin.runtimeBytes]]) {
    const code = artifact.evm[kind]; assert.deepEqual(code.linkReferences, {});
    assert.match(code.object, /^(?:[0-9a-f]{2})+$/); assert.equal(code.object.length / 2, length);
    assert.equal(sha(Buffer.from(code.object, 'hex')), expected);
  }
  const references = artifact.evm.deployedBytecode.immutableReferences;
  assert.deepEqual(Object.keys(references).sort(), Object.keys(immutableNames).sort());
  assert.deepEqual(manifest.immutableReferences, references);
  const ranges = [];
  for (const locations of Object.values(references)) for (const { start, length } of locations) {
    assert.equal(length, 32); assert.ok(Number.isSafeInteger(start) && start >= 0 && start + length <= pin.runtimeBytes);
    assert.ok(ranges.every(([a, b]) => start + length <= a || start >= b), 'EVM_ROUTER_IMMUTABLE_OVERLAP');
    assert.equal(artifact.evm.deployedBytecode.object.slice(start * 2, (start + length) * 2), '0'.repeat(64));
    ranges.push([start, start + length]);
  }
  return freeze({ classification: 'PINNED_ROUTER_ARTIFACT_NOT_DEPLOYMENT_EVIDENCE', manifest, artifact, immutableNames });
}
function address(value) {
  assert.ok(typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value) && BigInt(value) > 0n, 'EVM_ROUTER_ADDRESS'); return value;
}
function tag(value) { assert.ok(value === 'latest' || typeof value === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value),
  'EVM_ROUTER_BLOCK_TAG'); return value; }
const assetIdentity = record => '0x' + sha(Buffer.from('24' + word(31337).slice(2) + record.address.slice(2) + record.codeHash.slice(2), 'hex'));
async function sameHead(runtime, header) {
  await runtime.assertCanonical(header); const current = await runtime.block();
  for (const key of ['number', 'hash', 'timestamp']) assert.equal(current[key], header[key], 'EVM_ROUTER_HEAD_CHANGED');
}
async function exactCode(runtime, record, at) {
  const actual = await runtime.code(record.address, at);
  assert.equal(actual, record.expectedCode, 'EVM_ROUTER_COMPLETE_CODE'); assert.equal(codeHash(actual), record.codeHash, 'EVM_ROUTER_CODE_HASH');
}
async function originalCreation(runtime, record) {
  const hash = record.receipt.transactionHash, entries = runtime.transactions.filter(entry => entry.transactionHash === hash);
  assert.equal(entries.length, 1, 'EVM_ROUTER_ORIGINAL_CREATION'); const entry = entries[0];
  assert.equal(entry.phase, 'mined'); assert.equal(entry.request.to, undefined);
  assert.equal(entry.request.from, record.sender); assert.equal(entry.request.data, record.creationData);
  assert.equal(BigInt(entry.request.value ?? '0x0'), 0n); assert.equal(BigInt(entry.senderNonce).toString(), record.nonce);
  const [transaction, receipt] = await Promise.all([runtime.transaction(hash), runtime.receipt(hash)]);
  assert.ok(transaction && receipt, 'EVM_ROUTER_CREATION_HISTORY_MISSING');
  assert.deepEqual(receipt, record.receipt, 'EVM_ROUTER_CREATION_RECEIPT_CHANGED'); assert.deepEqual(entry.receipt, receipt);
  assert.equal(receipt.status, '0x1'); assert.equal(receipt.contractAddress, record.address);
  assert.equal(receipt.from, record.sender); assert.equal(receipt.to, null);
  assert.deepEqual(receipt.logs, record.expectedCreationLogs ?? []);
  assert.equal(transaction.hash, hash); assert.equal(transaction.to, null); assert.equal(transaction.from, record.sender);
  assert.equal(transaction.input, record.creationData); assert.equal(BigInt(transaction.nonce).toString(), record.nonce);
  assert.equal(BigInt(transaction.value), 0n); assert.equal(BigInt(transaction.gas), BigInt(LOCAL_EVM_PROFILE.maxGas));
  assert.equal(transaction.blockHash, receipt.blockHash); assert.equal(transaction.blockNumber, receipt.blockNumber);
  assert.equal(transaction.transactionIndex, receipt.transactionIndex); assert.equal(BigInt(receipt.transactionIndex), 0n);
  assert.equal(predictNativeCreateAddress(record.sender, BigInt(record.nonce)), record.address);
  await runtime.checkReceipt(receipt); const header = await runtime.assertCanonical(receipt);
  assert.deepEqual(header.transactions, [hash], 'EVM_ROUTER_CREATION_SINGLE_TRANSACTION');
  await exactCode(runtime, record, header.number); return header;
}
export function assertOwnedEvmVaultRouter(runtime, system, router) {
  const binding = owned.get(router);
  assert.ok(binding && binding.runtime === runtime && binding.system === system, 'EVM_ROUTER_OWNED_CAPABILITY_REQUIRED');
  assertOwnedFlatSystem(runtime, system); assertOwnedBackedAssets(runtime, binding.backedAssets);
}
/** One original CREATE attempt per owned system, permanently latched before send. */
export async function deployEvmVaultRouter(runtime, system, options) {
  assert.equal(arguments.length, 3, 'EVM_ROUTER_DEPLOY_ARGUMENTS');
  exactRecord(options, ['sourcePoolIndex', 'destinationPoolIndex', 'solver', 'backedAssets']);
  await assertLocalEvm(runtime); assertOwnedFlatSystem(runtime, system); assertOwnedBackedAssets(runtime, options.backedAssets);
  const { sourcePoolIndex, destinationPoolIndex, backedAssets } = options, solver = address(options.solver);
  assert.ok([0, 1].includes(sourcePoolIndex) && [0, 1].includes(destinationPoolIndex)
    && sourcePoolIndex !== destinationPoolIndex, 'EVM_ROUTER_POOL_INDICES');
  assert.ok(runtime.accounts.includes(solver), 'EVM_ROUTER_OWNED_SOLVER');
  assert.ok(!attempts.has(system), 'EVM_ROUTER_DEPLOY_ALREADY_ATTEMPTED');
  assert.equal(runtime.metadata.chainId, '31337'); assert.deepEqual(runtime.metadata.profile, LOCAL_EVM_PROFILE);
  const bundle = loadEvmVaultRouterDeploymentArtifacts(), assetsBundle = loadBackedAssetDeploymentArtifacts();
  const source = system.pools[sourcePoolIndex], destination = system.pools[destinationPoolIndex];
  const token = backedAssets.token, vault = backedAssets.vault, sender = address(system.sender);
  assert.equal(sender, runtime.accounts[0]); assert.ok(system.verifiers.deposit_intent, 'EVM_ROUTER_D27_VERIFIER_REQUIRED');
  assert.equal(destination.selectors['depositBalanceIntent(bytes,bytes32[])'], EVM_VAULT_DEPOSIT_SELECTOR, 'EVM_ROUTER_D27_POOL_REQUIRED');
  for (const [pool, asset, symbol] of [[source, token, 'PALT'], [destination, vault, 'BLTV']]) {
    assertOwnedPoolAsset(runtime, pool.assetCapability);
    assert.equal(pool.asset, asset.address); assert.equal(pool.assetCodeHash, asset.codeHash);
    assert.deepEqual(pool.assetMetadata, pool.assetCapability.metadata);
    assert.equal(pool.assetMetadata.kind, 'ERC20'); assert.equal(pool.assetMetadata.symbol, symbol); assert.equal(pool.assetMetadata.decimals, 6);
    assert.equal(pool.assetMetadata.address, asset.address); assert.equal(pool.assetMetadata.codeHash, asset.codeHash);
    assert.equal(pool.assetMetadata.chainId, '31337'); assert.equal(pool.assetMetadata.genesisHash, runtime.metadata.evmGenesis);
    assert.equal(pool.assetIdentity, assetIdentity(asset)); assert.equal(pool.domain.asset, bare(assetIdentity(asset)));
    for (const key of ['scope', 'policy', 'ledgerNamespace']) assert.equal(pool.domain[key], bare(pool[key]));
    assert.equal(pool.ledgerNamespace, system.ledgerNamespace); assert.equal(pool.domain.hubDomain, bare(system.hubDomain));
  }
  assert.equal(backedAssets.identity.genesisHash, bare(runtime.metadata.evmGenesis));
  assert.equal(backedAssets.identity.asset, bare(token.address)); assert.equal(backedAssets.identity.vault, bare(vault.address));
  const first = await runtime.block(), nonce = await runtime.nonce(sender, 'pending');
  assert.ok(nonce >= 0n && nonce < (1n << 64n) - 1n, 'EVM_ROUTER_NONCE_BOUND');
  const predicted = predictNativeCreateAddress(sender, nonce);
  const configuration = { solver, asset: token.address, vault: vault.address, targetPool: destination.address,
    assetCodeSHA256: '0x' + token.codeSHA256, vaultCodeSHA256: '0x' + vault.codeSHA256,
    targetPoolCodeSHA256: '0x' + codeSHA(destination.expectedCode), genesisHash: runtime.metadata.evmGenesis,
    ledgerNamespace: system.ledgerNamespace, vaultDomain: '0x' + backedAssets.identity.domain,
    vaultRuntimeId: '0x' + backedAssets.identity.runtimeId, targetDomain: destination.domainCommitment,
    targetScope: destination.scope, targetPolicy: destination.policy };
  const immutableValues = { ...configuration, assetIdentity: assetIdentity(token), shareIdentity: assetIdentity(vault) };
  const expectedCode = deriveNativeRuntimeCode({ artifact: bundle.artifact, deployedAddress: predicted,
    immutableNames: bundle.immutableNames, immutableValues });
  const constructorData = nativeStaticArguments(bundle.artifact.abi.find(item => item.type === 'constructor').inputs[0].components,
    CONSTRUCTOR_FIELDS.map(key => configuration[key]));
  const creationData = '0x' + bundle.artifact.evm.bytecode.object + constructorData.slice(2);
  assert.ok((creationData.length - 2) / 2 <= 49152 && (expectedCode.length - 2) / 2 <= 24576, 'EVM_ROUTER_CODE_SIZE');
  const identity = validateEvmVaultDeliveryIdentity({ chainId: '31337', genesisHash: bare(configuration.genesisHash),
    ledgerNamespace: bare(configuration.ledgerNamespace), adapterVersion: '1', router: bare(predicted),
    routerCodeSHA256: codeSHA(expectedCode), routerVersion: '1', solver: bare(solver), asset: bare(token.address),
    assetCodeSHA256: token.codeSHA256, assetIdentity: bare(immutableValues.assetIdentity), vault: bare(vault.address),
    vaultCodeSHA256: vault.codeSHA256, shareIdentity: bare(immutableValues.shareIdentity),
    vaultDomain: backedAssets.identity.domain, vaultRuntimeId: backedAssets.identity.runtimeId,
    targetPool: bare(destination.address), targetPoolCodeSHA256: bare(configuration.targetPoolCodeSHA256),
    targetDomain: bare(destination.domainCommitment), targetScope: bare(destination.scope), targetPolicy: bare(destination.policy) });
  const systemRecords = [system.hub, ...system.pools, ...Object.values(system.libraries),
    ...Object.values(system.verifiers), ...Object.values(system.generatedLibraries)];
  async function verifyDependencies(header) {
    const at = header.number;
    const genesis = await runtime.block('0x0'); assert.equal(genesis.hash, configuration.genesisHash); await runtime.assertCanonical(genesis);
    await Promise.all([...systemRecords, token, vault].map(record => exactCode(runtime, record, at)));
    // The backed-assets capability fixes these records. Re-read the original
    // creations as well, so missing or replaced historical receipts fail closed.
    await Promise.all([token, vault].map(record => originalCreation(runtime, { ...record,
      sender: backedAssets.sender, expectedCreationLogs: record.receipt.logs })));
    assert.equal(await runtime.code(solver, at), '0x', 'EVM_ROUTER_SOLVER_EOA');
    const expect = async (record, artifact, signature, args, result) =>
      assert.equal(await runtime.call({ to: record.address, data: nativeStaticCalldata(artifact, signature, args) }, at), result,
        'EVM_ROUTER_DEPENDENCY_' + signature);
    await Promise.all(Object.entries(vault.immutableValues).map(([name, value]) => expect(vault, assetsBundle.artifacts.vault, name + '()', [], word(value))));
    await expect(token, assetsBundle.artifacts.token, 'totalSupply()', [], word(backedAssets.supply));
    for (const [record, artifact] of [[token, assetsBundle.artifacts.token], [vault, assetsBundle.artifacts.vault]])
      await expect(record, artifact, 'decimals()', [], word(6));
    for (const pool of [source, destination]) {
      for (const [name, value] of Object.entries({ asset: pool.asset, assetCodeHash: pool.assetCodeHash, assetIdentity: pool.assetIdentity,
        domainCommitment: pool.domainCommitment, scope: pool.scope, policy: pool.policy, ledgerNamespace: system.ledgerNamespace,
        receiptHub: system.hub.address, receiptHubCodeHash: system.hub.codeHash, transitionInProgress: 0 }))
        assert.equal(await pool.call(name + '()', [], at), word(value), 'EVM_ROUTER_POOL_IDENTITY_' + name);
      assert.equal(await system.hub.call('isRegisteredPool(address)', [pool.address], at), word(1));
      assert.equal(await system.hub.call('poolDomain(address)', [pool.address], at), pool.domainCommitment);
      assert.equal(await system.hub.call('domainPool(bytes32)', [pool.domainCommitment], at), word(pool.address));
    }
    await runtime.assertCanonical(header);
  }
  await verifyDependencies(first); assert.equal(await runtime.code(predicted, first.number), '0x', 'EVM_ROUTER_CREATE_OCCUPIED');
  await sameHead(runtime, first); assert.equal(await runtime.nonce(sender, 'pending'), nonce, 'EVM_ROUTER_NONCE_CHANGED');
  assert.ok(!attempts.has(system), 'EVM_ROUTER_DEPLOY_ALREADY_ATTEMPTED'); attempts.add(system);
  const request = { from: sender, data: creationData, gas: '0x' + LOCAL_EVM_PROFILE.maxGas.toString(16), value: '0x0' };
  const start = runtime.transactions.length, label = 'deploy fixed PrivateVaultDeliveryRouter';
  const receipt = await runtime.send(label, request);
  const journal = runtime.transactions; assert.equal(journal.length, start + 1, 'EVM_ROUTER_EXACT_JOURNAL_APPEND');
  assert.equal(journal[start].label, label); assert.deepEqual(journal[start].request, request);
  assert.equal(receipt.contractAddress, predicted); assert.equal(BigInt(receipt.blockNumber), BigInt(first.number) + 1n);
  assert.ok(BigInt(receipt.gasUsed) > 0n && BigInt(receipt.gasUsed) <= BigInt(LOCAL_EVM_PROFILE.maxGas));
  const record = { sender, address: predicted, nonce: nonce.toString(), receipt: structuredClone(receipt), creationData,
    expectedCode, codeHash: codeHash(expectedCode), codeSHA256: codeSHA(expectedCode) };
  const creation = await originalCreation(runtime, record);
  assert.equal(creation.parentHash, first.hash); assert.equal(BigInt(creation.timestamp), BigInt(first.timestamp) + 1n);
  assert.equal(await runtime.nonce(sender, 'pending'), nonce + 1n); assert.equal(await runtime.keccak(expectedCode), record.codeHash);
  const read = async (blockNumber = 'latest') => {
    tag(blockNumber); await assertLocalEvm(runtime); assertOwnedFlatSystem(runtime, system); assertOwnedBackedAssets(runtime, backedAssets);
    const header = await runtime.block(blockNumber);
    assert.ok(BigInt(header.number) >= BigInt(creation.number), 'EVM_ROUTER_BEFORE_CREATION');
    await originalCreation(runtime, record); await verifyDependencies(header); await exactCode(runtime, record, header.number);
    await Promise.all(Object.entries(immutableValues).map(async ([name, value]) => {
      assert.equal(await runtime.call({ to: predicted, data: nativeStaticCalldata(bundle.artifact, name + '()', []) }, header.number),
        word(value), 'EVM_ROUTER_IMMUTABLE_GETTER_' + name);
    }));
    for (const [name, value] of [['ROUTER_VERSION()', word(1)], ['ADAPTER_VERSION()', word(1)],
      ['DELIVERY_SELECTOR()', '0x' + EVM_VAULT_DELIVERY_SELECTOR.padEnd(64, '0')],
      ['DEPOSIT_SELECTOR()', '0x' + EVM_VAULT_DEPOSIT_SELECTOR.padEnd(64, '0')]])
      assert.equal(await runtime.call({ to: predicted, data: nativeStaticCalldata(bundle.artifact, name, []) }, header.number), value);
    await runtime.assertCanonical(header); if (blockNumber === 'latest') await sameHead(runtime, header);
    return freeze({ identity, blockNumber: header.number, blockHash: header.hash, blockTimestamp: header.timestamp });
  };
  await read(creation.number);
  assert.equal(await runtime.call({ to: predicted, data: nativeStaticCalldata(bundle.artifact, 'deliveryCount()', []) }, creation.number), word(0));
  await sameHead(runtime, creation);
  const result = freeze({ ...record, classification: 'OWNED_LOCAL_EVM_VAULT_ROUTER_NOT_PRIVATE_DEFI_ACCEPTANCE',
    identity, sourcePoolIndex, destinationPoolIndex, solver, artifact: bundle.artifact, immutableValues, constructorData,
    creationSHA256: codeSHA(creationData), transactionHash: receipt.transactionHash, read,
    proofAcceptanceClaim: false, privateSpendable: false, privateDeFiAcceptance: false });
  owned.set(result, { runtime, system, backedAssets }); return result;
}
