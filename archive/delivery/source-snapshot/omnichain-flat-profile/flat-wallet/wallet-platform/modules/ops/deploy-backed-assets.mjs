/** Fixed local fake-asset bootstrap. Importing loads no files and starts no
 * compiler, process, transport or EVM. There is no caller code/path override. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { LOCAL_EVM_PROFILE } from '../../../../../omnichain-product/src/paeg/local-evm.mjs';
import { assertLocalEvm } from '../chain-adapters/local-evm-ownership.mjs';
import { GENERIC_COMPILER_PIN } from '../../../../../omnichain-product/src/paeg/local-deployment.mjs';
import { deriveNativeRuntimeCode, predictNativeCreateAddress, nativeStaticArguments,
  nativeStaticCalldata } from '../../../../../omnichain-product/src/paeg/native-deployment.mjs';
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
import { exactRecord } from '../paeg/commitments.mjs';
import { validateVaultIdentity, VAULT_ACTION_TAG } from '../defi-adapters/backed-vault.mjs';

const root = new URL('../../../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const codeSHA = code => sha(Buffer.from(code.slice(2), 'hex'));
const keccak = code => '0x' + publicKeccak256(Buffer.from(code.slice(2), 'hex')).toString('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const digestJSON = value => sha(canonical(value));
const ZERO_ADDRESS = '0x' + '00'.repeat(20), ZERO32 = '0x' + '00'.repeat(32);
const MAX_SUPPLY = (1n << 128n) - 1n;
const claimedRuntimes = new WeakSet(), ownedDeployments = new WeakMap();
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

export const BACKED_ASSET_BUILD_PIN = freeze({
  format: 'FIXED_BACKED_ASSETS_BUILD_V1',
  manifestSHA256: '07a57ecc412428647b442efcfc1256281bca746f545fdeeb9851bbf2587e93f5',
  compiledSHA256: '145ebb8d15d614124abda24f5cf229f85d2f59e93918c1d55d302e062a3d5f1b',
  settingsSHA256: '96d0fa28f9e3e67bb711ed7dc213ae1cc9c0e4646c243806b3c3167cb5698cff',
  token: {
    source: 'PrivateAssetTestToken.sol', contract: 'PrivateAssetTestToken',
    sourceSHA256: '397538dba08caa692165e93036804c2045fb646e7edbd719899036912853461e',
    sourceASTSHA256: '8ed6e22bc9c0bd4555eb06877aa967d3c7d382cbcfb8af7ddf2bcf8464d027dd',
    artifactSHA256: '48a9bea85d8bb89ae453521dc8d405c0e5f29ecd1d118eb67877a91c169b5fcc',
    abiSHA256: '91baa845ed621c665a7047526c495a57a9037e4108db9e807d92abc12e18014e',
    creationSHA256: '0657736a830b5ee604c985078768b7e1dca2d1eac8057cebb1adaf8dd74ea00b',
    runtimeTemplateSHA256: 'b9ff4a695027d1707074173be39b5d83d0b0b4e19943e865da480b265a284445',
    creationBytes: 1504, runtimeBytes: 1245, immutableNames: {},
  },
  vault: {
    source: 'BackedTestVault.sol', contract: 'BackedTestVault',
    sourceSHA256: '2627227a5fc58103eb90a2e2a92bbfe4505feb7feb2d6fef83ee09cb566cad5e',
    sourceASTSHA256: '920eea137f77f7e446bcc32d7e84bdb2c28106042738c6e92d62dc57e5214b1c',
    artifactSHA256: 'fe4dd1780391681a7a78e4c839f68dff489aa680dba620093192640f4ffa59a2',
    abiSHA256: '2e8df644b3bf193f41a90662d9abe34f3f38b3ae5a032759da70dde3f1a3741c',
    creationSHA256: '50833689d09524dd5d8b6b96dd44bdd712dc73502df15da2e46b4df5837d48c7',
    runtimeTemplateSHA256: '0252e1866e07cea64fae25d1dedc6b8d79dc8d460d477ac2c281f0ea9a5f52e5',
    creationBytes: 10087, runtimeBytes: 8970,
    immutableNames: { 64: 'asset', 66: 'assetCodeSHA256', 68: 'genesisHash', 70: 'domain', 72: 'runtimeId' },
  },
});
const SOURCE_PATHS = {
  token: new URL('../../omnichain-product/contracts/PrivateAssetTestToken.sol', root),
  vault: new URL('contracts/fixtures/BackedTestVault.sol', root),
};
const constructorTypes = { token: ['uint256'], vault: ['address', 'bytes32', 'bytes32', 'bytes32', 'bytes32'] };
function bytes32(value) {
  assert.ok(typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value) && value !== ZERO32, 'BACKED_DEPLOY_BYTES32'); return value;
}
function address(value) {
  assert.ok(typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value) && value !== ZERO_ADDRESS, 'BACKED_DEPLOY_ADDRESS'); return value;
}
function uint(value, bits, positive = false) {
  assert.ok(typeof value === 'string' && value.length <= 39 && /^(0|[1-9][0-9]*)$/.test(value), 'BACKED_DEPLOY_CANONICAL_UINT');
  const n = BigInt(value); assert.ok(n < (1n << BigInt(bits)) && (!positive || n > 0n), 'BACKED_DEPLOY_UINT_RANGE'); return n;
}
function options(value) {
  exactRecord(value, ['domain', 'runtimeId', 'supply']);
  return { domain: bytes32(value.domain), runtimeId: bytes32(value.runtimeId), supply: (uint(value.supply, 128, true)).toString() };
}
function pinnedJSON(path, expected) {
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4_000_000, 'BACKED_ARTIFACT_REGULAR_FILE');
  const bytes = readFileSync(path); assert.equal(sha(bytes), expected, 'BACKED_ARTIFACT_FILE_PIN');
  return JSON.parse(bytes);
}

/** No options, fallback build or compiler. Missing/stale files fail closed. */
export function loadBackedAssetDeploymentArtifacts() {
  assert.equal(arguments.length, 0, 'BACKED_ARTIFACT_NO_OPTIONS');
  const manifest = pinnedJSON(new URL('.local/backed-assets/v1/manifest.json', root), BACKED_ASSET_BUILD_PIN.manifestSHA256);
  const compilation = pinnedJSON(new URL('.local/backed-assets/v1/compiled.json', root), BACKED_ASSET_BUILD_PIN.compiledSHA256);
  assert.equal(manifest.format, BACKED_ASSET_BUILD_PIN.format);
  assert.equal(manifest.compiledSHA256, BACKED_ASSET_BUILD_PIN.compiledSHA256);
  assert.equal(compilation.classification, 'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');
  assert.equal(compilation.profile, 'standard');
  assert.deepEqual(compilation.compiler, GENERIC_COMPILER_PIN); assert.deepEqual(manifest.compiler, GENERIC_COMPILER_PIN);
  assert.equal(digestJSON(compilation.settings), BACKED_ASSET_BUILD_PIN.settingsSHA256);
  assert.deepEqual(manifest.settings, compilation.settings);
  assert.deepEqual(Object.keys(compilation.contracts).sort(), ['BackedTestVault.sol', 'PrivateAssetTestToken.sol']);
  assert.deepEqual(Object.keys(compilation.sourceASTs).sort(), ['BackedTestVault.sol', 'PrivateAssetTestToken.sol']);
  const artifacts = {}, immutableNames = {}, sourceRecords = [];
  for (const role of ['token', 'vault']) {
    const pin = BACKED_ASSET_BUILD_PIN[role], source = readFileSync(SOURCE_PATHS[role]);
    assert.equal(sha(source), pin.sourceSHA256, 'BACKED_ARTIFACT_SOURCE_PIN');
    sourceRecords.push({ name: pin.source, sha256: pin.sourceSHA256, bytes: source.length });
    const artifact = compilation.contracts[pin.source][pin.contract], ast = compilation.sourceASTs[pin.source];
    assert.equal(digestJSON(artifact), pin.artifactSHA256, 'BACKED_ARTIFACT_CONTRACT_PIN');
    assert.equal(digestJSON(artifact.abi), pin.abiSHA256, 'BACKED_ARTIFACT_ABI_PIN');
    assert.equal(digestJSON(ast), pin.sourceASTSHA256, 'BACKED_ARTIFACT_AST_PIN');
    const matches = ast.nodes.filter(node => node.nodeType === 'ContractDefinition' && node.name === pin.contract);
    assert.equal(matches.length, 1); assert.equal(matches[0].contractKind, 'contract');
    const names = Object.fromEntries(matches[0].nodes.filter(node => node.nodeType === 'VariableDeclaration'
      && node.mutability === 'immutable').map(node => [node.id, node.name]));
    assert.deepEqual(names, pin.immutableNames, 'BACKED_ARTIFACT_IMMUTABLE_AST_PIN');
    const constructors = artifact.abi.filter(item => item.type === 'constructor');
    assert.equal(constructors.length, 1); assert.equal(constructors[0].stateMutability, 'nonpayable');
    assert.deepEqual(constructors[0].inputs.map(item => item.type), constructorTypes[role]);
    for (const [kind, expected, length] of [['bytecode', pin.creationSHA256, pin.creationBytes],
      ['deployedBytecode', pin.runtimeTemplateSHA256, pin.runtimeBytes]]) {
      const bytecode = artifact.evm[kind]; assert.deepEqual(bytecode.linkReferences, {});
      assert.match(bytecode.object, /^(?:[0-9a-f]{2})+$/);
      assert.equal(bytecode.object.length / 2, length); assert.equal(sha(Buffer.from(bytecode.object, 'hex')), expected);
    }
    const references = artifact.evm.deployedBytecode.immutableReferences;
    assert.deepEqual(Object.keys(references).sort(), Object.keys(names).sort(), 'BACKED_ARTIFACT_IMMUTABLE_REFERENCES');
    assert.deepEqual(manifest.artifacts[role], { ...pin, immutableReferences: references });
    artifacts[role] = artifact; immutableNames[role] = names;
  }
  assert.deepEqual(compilation.sources, sourceRecords.sort((a, b) => a.name.localeCompare(b.name)));
  return freeze({ classification: 'PINNED_BACKED_ASSET_ARTIFACTS_NOT_DEPLOYMENT_EVIDENCE', manifest, artifacts, immutableNames });
}

function planFromBundle(bundle, input) {
  exactRecord(input, ['sender', 'nextNonce', 'genesisHash', 'domain', 'runtimeId', 'supply']);
  const configuration = options({ domain: input.domain, runtimeId: input.runtimeId, supply: input.supply });
  const sender = address(input.sender), nonce = uint(input.nextNonce, 64), genesisHash = bytes32(input.genesisHash);
  assert.ok(nonce + 2n < 1n << 64n, 'BACKED_DEPLOY_NONCE_CAPACITY');
  const create = (role, offset, immutableValues, values) => {
    const pin = BACKED_ASSET_BUILD_PIN[role], artifact = bundle.artifacts[role], nextNonce = nonce + BigInt(offset);
    const target = predictNativeCreateAddress(sender, nextNonce);
    const expectedCode = deriveNativeRuntimeCode({ artifact, deployedAddress: target,
      immutableNames: bundle.immutableNames[role], immutableValues });
    const constructorData = nativeStaticArguments(artifact.abi.find(item => item.type === 'constructor').inputs, values);
    const creationData = '0x' + artifact.evm.bytecode.object + constructorData.slice(2);
    assert.ok((creationData.length - 2) / 2 <= 49_152 && (expectedCode.length - 2) / 2 <= 24_576, 'BACKED_DEPLOY_EVM_SIZE');
    return { role, source: pin.source, contractName: pin.contract, address: target, nonce: nextNonce.toString(),
      kind: 'ERC20', symbol: role === 'token' ? 'PALT' : 'BLTV', decimals: 6, expectedCode,
      codeHash: keccak(expectedCode), codeSHA256: codeSHA(expectedCode), immutableValues, constructorData, creationData,
      creationSHA256: codeSHA(creationData), runtimeBytes: (expectedCode.length - 2) / 2 };
  };
  const token = create('token', 0, {}, [configuration.supply]);
  const vaultValues = { asset: token.address, assetCodeSHA256: '0x' + token.codeSHA256, genesisHash,
    domain: configuration.domain, runtimeId: configuration.runtimeId };
  const vault = create('vault', 1, vaultValues, Object.values(vaultValues));
  const identity = validateVaultIdentity({ chainId: '31337', genesisHash: genesisHash.slice(2),
    domain: configuration.domain.slice(2), runtimeId: configuration.runtimeId.slice(2),
    asset: token.address.slice(2), assetCodeSHA256: token.codeSHA256,
    vault: vault.address.slice(2), vaultCodeSHA256: vault.codeSHA256 });
  return freeze({ classification: 'PREDICTED_FIXED_BACKED_ASSETS_NOT_CHAIN_OR_PROOF_EVIDENCE',
    chainId: '31337', sender, nextNonce: nonce.toString(), genesisHash, ...configuration, token, vault, identity,
    proofAcceptanceClaim: false, privateSpendable: false });
}

/** Deterministic source/encoding proposal only; does not confer ownership. */
export function buildBackedAssetDeploymentPlan(input) {
  assert.equal(arguments.length, 1, 'BACKED_PLAN_ARGUMENTS');
  return planFromBundle(loadBackedAssetDeploymentArtifacts(), input);
}
export function assertOwnedBackedAssets(runtime, deployment) {
  assert.ok(ownedDeployments.has(deployment) && ownedDeployments.get(deployment) === runtime,
    'BACKED_DEPLOY_OWNED_CAPABILITY_REQUIRED');
}
async function unchangedHead(runtime, header) {
  await runtime.assertCanonical(header);
  const current = await runtime.block();
  assert.equal(current.number, header.number, 'BACKED_DEPLOY_HEAD_CHANGED');
  assert.equal(current.hash, header.hash, 'BACKED_DEPLOY_HEAD_CHANGED');
}
async function checkCode(runtime, record, at) {
  assert.equal(await runtime.code(record.address, at), record.expectedCode, 'BACKED_DEPLOY_EXPECTED_RUNTIME');
  assert.equal(await runtime.keccak(record.expectedCode), record.codeHash, 'BACKED_DEPLOY_INDEPENDENT_CODEHASH');
}
const words = values => nativeStaticArguments(values.map(() => ({ type: 'uint256' })), values);
function stringResult(value) {
  const bytes = Buffer.from(value, 'utf8');
  return words([32, bytes.length]) + bytes.toString('hex').padEnd(Math.ceil(bytes.length / 32) * 64, '0');
}

async function verifyStorage(runtime, plan, bundle) {
  const header = await runtime.block(), at = header.number;
  const expect = async (record, signature, args, result) => {
    assert.equal(await runtime.call({ from: plan.sender, to: record.address,
      data: nativeStaticCalldata(bundle.artifacts[record.role], signature, args) }, at), result, 'BACKED_DEPLOY_STORAGE_' + signature);
  };
  for (const record of [plan.token, plan.vault]) {
    await checkCode(runtime, record, at);
    await expect(record, 'symbol()', [], stringResult(record.symbol));
    await expect(record, 'name()', [], stringResult(record.role === 'token' ? 'Private Asset Local Test Token' : 'Backed Local Test Vault'));
    await expect(record, 'decimals()', [], words([6]));
    await expect(record, 'totalSupply()', [], words([record.role === 'token' ? plan.supply : 0]));
    for (const account of runtime.accounts) {
      await expect(record, 'balanceOf(address)', [account], words([record.role === 'token' && account === plan.sender ? plan.supply : 0]));
      await expect(record, 'allowance(address,address)', [account, plan.vault.address], words([0]));
    }
    await expect(record, 'balanceOf(address)', [plan.vault.address], words([0]));
    assert.equal(await runtime.balance(record.address, at), 0n, 'BACKED_DEPLOY_NO_NATIVE_VALUE');
  }
  for (const [name, value] of Object.entries(plan.vault.immutableValues)) await expect(plan.vault, name + '()', [], words([value]));
  await expect(plan.vault, 'totalAssets()', [], words([0]));
  await expect(plan.vault, 'LIMIT()', [], words([MAX_SUPPLY]));
  await expect(plan.vault, 'ACTION_TAG()', [], '0x' + VAULT_ACTION_TAG);
  await unchangedHead(runtime, header);
  return { blockNumber: header.number, blockHash: header.hash, supplyAndBalancesMatched: true,
    completeRuntimesMatched: true, immutableGettersMatched: true, vaultInitiallyEmpty: true };
}

/** Send each original CREATE exactly once on one actual golden runtime.
 * Once a send is attempted this runtime is permanently claimed by this seam,
 * including uncertainty/failure: no automatic or user-call resend exists. */
export async function deployBackedAssets(runtime, input) {
  assert.equal(arguments.length, 2, 'BACKED_DEPLOY_ARGUMENTS');
  const configuration = options(input);
  await assertLocalEvm(runtime);
  assert.ok(!claimedRuntimes.has(runtime), 'BACKED_DEPLOY_ALREADY_ATTEMPTED');
  assert.equal(runtime.metadata.chainId, '31337');
  assert.deepEqual(runtime.metadata.profile, LOCAL_EVM_PROFILE);
  const bundle = loadBackedAssetDeploymentArtifacts(), sender = address(runtime.accounts[0]);
  const first = await runtime.block(), nextNonce = await runtime.nonce(sender, 'pending');
  const plan = planFromBundle(bundle, { sender, nextNonce: nextNonce.toString(), genesisHash: runtime.metadata.evmGenesis, ...configuration });
  for (const record of [plan.token, plan.vault]) assert.equal(await runtime.code(record.address, first.number), '0x', 'BACKED_DEPLOY_CREATE_OCCUPIED');
  await unchangedHead(runtime, first);
  assert.ok(!claimedRuntimes.has(runtime), 'BACKED_DEPLOY_ALREADY_ATTEMPTED');
  claimedRuntimes.add(runtime);
  const deployments = [];
  for (const projected of [plan.token, plan.vault]) {
    await assertLocalEvm(runtime);
    const before = await runtime.block(), journalStart = runtime.transactions.length;
    assert.equal((await runtime.nonce(sender, 'pending')).toString(), projected.nonce, 'BACKED_DEPLOY_NONCE_CHANGED');
    assert.equal(await runtime.code(projected.address, before.number), '0x', 'BACKED_DEPLOY_CREATE_OCCUPIED');
    await unchangedHead(runtime, before);
    const request = { from: sender, data: projected.creationData, gas: '0x' + LOCAL_EVM_PROFILE.maxGas.toString(16), value: '0x0' };
    const label = 'deploy fixed backed asset ' + projected.contractName;
    // The owned runtime journals before broadcast and has its own permanent
    // ambiguity latch. There is deliberately no retry or fallback here.
    const receipt = await runtime.send(label, request);
    assert.equal(receipt.status, '0x1'); assert.equal(receipt.contractAddress, projected.address);
    assert.equal(receipt.from, sender); assert.equal(receipt.to, null);
    assert.equal(BigInt(receipt.blockNumber), BigInt(before.number) + 1n, 'BACKED_DEPLOY_ADJACENT_CREATION');
    assert.ok(BigInt(receipt.gasUsed) > 0n && BigInt(receipt.gasUsed) <= 30_000_000n, 'BACKED_DEPLOY_GAS_LIMIT');
    const journal = runtime.transactions;
    assert.equal(journal.length, journalStart + 1, 'BACKED_DEPLOY_EXACT_JOURNAL_APPEND');
    const entry = journal[journalStart];
    assert.equal(entry.transactionHash, receipt.transactionHash); assert.equal(entry.label, label); assert.equal(entry.phase, 'mined');
    assert.deepEqual(entry.request, request); assert.deepEqual(entry.receipt, receipt);
    assert.equal(BigInt(entry.senderNonce).toString(), projected.nonce);
    assert.equal(journal.filter(item => item.transactionHash === receipt.transactionHash).length, 1, 'BACKED_DEPLOY_ORIGINAL_TRANSACTION');
    const transaction = await runtime.transaction(receipt.transactionHash);
    assert.ok(transaction, 'BACKED_DEPLOY_TRANSACTION_MISSING');
    assert.equal(transaction.hash, receipt.transactionHash); assert.equal(transaction.from, sender); assert.equal(transaction.to, null);
    assert.equal(transaction.input, projected.creationData); assert.equal(BigInt(transaction.nonce).toString(), projected.nonce);
    assert.equal(transaction.value, '0x0'); assert.equal(BigInt(transaction.gas), 30_000_000n);
    assert.equal(transaction.blockHash, receipt.blockHash); assert.equal(transaction.blockNumber, receipt.blockNumber);
    assert.equal(transaction.transactionIndex, receipt.transactionIndex);
    await runtime.checkReceipt(receipt);
    const header = await runtime.assertCanonical(receipt);
    assert.equal(header.parentHash, before.hash); assert.equal(BigInt(header.timestamp), BigInt(before.timestamp) + 1n);
    assert.equal(await runtime.nonce(sender, 'pending'), BigInt(projected.nonce) + 1n, 'BACKED_DEPLOY_NEXT_NONCE');
    await checkCode(runtime, projected, receipt.blockNumber);
    if (projected.role === 'token') {
      assert.equal(receipt.logs.length, 1, 'BACKED_DEPLOY_INITIAL_TRANSFER');
      const log = receipt.logs[0]; assert.equal(log.address, projected.address);
      assert.deepEqual(log.topics, ['0x' + publicKeccak256(Buffer.from('Transfer(address,address,uint256)')).toString('hex'), ZERO32, words([sender])]);
      assert.equal(log.data, words([plan.supply])); assert.equal(log.transactionHash, receipt.transactionHash);
      assert.equal(log.blockHash, receipt.blockHash); assert.equal(log.blockNumber, receipt.blockNumber);
      assert.equal(log.removed, false);
    } else assert.deepEqual(receipt.logs, [], 'BACKED_DEPLOY_EMPTY_VAULT_CREATION');
    const deployment = { address: projected.address, transactionHash: receipt.transactionHash,
      expectedCode: projected.expectedCode, codeHash: projected.codeHash };
    deployments.push(freeze({ ...projected, deployment, transactionHash: receipt.transactionHash, receipt: structuredClone(receipt) }));
    await unchangedHead(runtime, header);
  }
  const storage = await verifyStorage(runtime, plan, bundle), [token, vault] = deployments;
  const backedVaultDeployment = { identity: plan.identity, asset: { transactionHash: token.transactionHash.slice(2), runtimeCode: token.expectedCode },
    vault: { transactionHash: vault.transactionHash.slice(2), runtimeCode: vault.expectedCode }, assetSupply: plan.supply };
  const result = freeze({ classification: 'OWNED_LOCAL_BACKED_ASSET_DEPLOYMENT_NOT_PRIVATE_DEFI_ACCEPTANCE',
    sender, token, vault, identity: plan.identity, backedVaultDeployment, deployments, storage,
    supply: plan.supply, proofAcceptanceClaim: false, privateSpendable: false });
  ownedDeployments.set(result, runtime); return result;
}
