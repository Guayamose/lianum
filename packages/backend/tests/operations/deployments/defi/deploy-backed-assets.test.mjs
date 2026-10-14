/** Focused fixed-source/encoding tests only. No compiler, EVM, native node,
 * prover, network or transaction is started by this test file. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BACKED_ASSET_BUILD_PIN, loadBackedAssetDeploymentArtifacts, buildBackedAssetDeploymentPlan,
  deployBackedAssets, assertOwnedBackedAssets } from '../../../../src/operations/deployments/defi/deploy-backed-assets.mjs';
import { prepareBackedAssetArtifacts } from '../../../../../../scripts/wallet/preparation/prepare-backed-assets.mjs';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { validateVaultIdentity } from '../../../../src/defi/vaults/backed-vault.mjs';

import {resourceRoot} from '@lianum/environment';
import {join} from 'node:path';
const root=resourceRoot('wallet');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = n => '0x' + BigInt(n).toString(16).padStart(64, '0');
const address = n => '0x' + BigInt(n).toString(16).padStart(40, '0');
const word = n => BigInt(n).toString(16).padStart(64, '0');
const fixture = () => ({ sender: '0x' + '11'.repeat(20), nextNonce: '0', genesisHash: digest(2),
  domain: digest(3), runtimeId: digest(4), supply: '1000000000000' });
const codeHash = code => '0x' + publicKeccak256(Buffer.from(code.slice(2), 'hex')).toString('hex');
const bundle = loadBackedAssetDeploymentArtifacts();

test('retained two-source build pins the official compiler, ABI, AST and normal code sizes', () => {
  assert.equal(bundle.manifest.compiler.version, '0.8.37+commit.f401782d.Emscripten.clang');
  assert.equal(bundle.manifest.compiler.soljsonSHA256, '221d7a667378b5068d913e75fe092507e061363cd1d23b64c49ae82febabad4c');
  assert.equal(bundle.manifest.nativeNodesStarted, false); assert.equal(bundle.manifest.proofGenerated, false);
  assert.deepEqual(Object.keys(bundle.artifacts), ['token', 'vault']);
  assert.deepEqual([bundle.manifest.artifacts.token.runtimeBytes, bundle.manifest.artifacts.vault.runtimeBytes], [1245, 8970]);
  assert.deepEqual(bundle.immutableNames.vault, { 64: 'asset', 66: 'assetCodeSHA256', 68: 'genesisHash', 70: 'domain', 72: 'runtimeId' });
  for (const role of ['token', 'vault']) {
    const pin = BACKED_ASSET_BUILD_PIN[role];
    assert.ok(pin.runtimeBytes <= 24576);
    assert.ok(pin.creationBytes + (role === 'token' ? 32 : 160) <= 49152);
    assert.equal(Object.isFrozen(bundle.artifacts[role].abi), true);
    assert.equal(Object.isFrozen(bundle.immutableNames[role]), true);
  }
  assert.equal(sha(readFileSync(join(root,'.local/backed-assets/v1/compiled.json'))), BACKED_ASSET_BUILD_PIN.compiledSHA256);
  assert.equal(sha(readFileSync(join(root,'.local/backed-assets/v1/manifest.json'))), BACKED_ASSET_BUILD_PIN.manifestSHA256);
  assert.throws(() => loadBackedAssetDeploymentArtifacts({ path: '/tmp/not-a-build' }), /BACKED_ARTIFACT_NO_OPTIONS/);
});

test('original CREATE proposal uses independent known nonce vectors and exact constructor words', () => {
  const input = fixture(), plan = buildBackedAssetDeploymentPlan(input);
  assert.equal(plan.token.address, '0x8f7a45ebde059392e46a46dcc14ab24681a961ea');
  assert.equal(plan.vault.address, '0x15452ec016c4dc8c549e7fe6ff4b26324ea8b7a4');
  assert.equal(plan.token.nonce, '0'); assert.equal(plan.vault.nonce, '1');
  assert.equal(plan.token.constructorData, '0x' + word(input.supply));
  assert.equal(plan.vault.constructorData, '0x' + [plan.token.address, '0x' + plan.token.codeSHA256,
    input.genesisHash, input.domain, input.runtimeId].map(word).join(''));
  for (const role of ['token', 'vault']) {
    const record = plan[role], artifact = bundle.artifacts[role];
    assert.equal(record.creationData, '0x' + artifact.evm.bytecode.object + record.constructorData.slice(2));
    assert.equal(record.codeHash, codeHash(record.expectedCode));
    assert.equal(record.codeSHA256, sha(Buffer.from(record.expectedCode.slice(2), 'hex')));
    assert.equal(record.creationSHA256, sha(Buffer.from(record.creationData.slice(2), 'hex')));
    assert.equal(record.kind, 'ERC20'); assert.equal(record.decimals, 6);
    assert.equal(record.symbol, role === 'token' ? 'PALT' : 'BLTV');
  }
  assert.equal(plan.token.expectedCode, '0x' + bundle.artifacts.token.evm.deployedBytecode.object);
  assert.deepEqual(validateVaultIdentity(plan.identity), plan.identity);
  assert.equal(plan.identity.assetCodeSHA256, plan.token.codeSHA256);
  assert.equal(plan.identity.vaultCodeSHA256, plan.vault.codeSHA256);
  assert.equal(plan.privateSpendable, false); assert.equal(plan.proofAcceptanceClaim, false);
  assert.equal(Object.isFrozen(plan.vault.immutableValues), true);
});

test('all 24 vault immutable occurrences are substituted from constructor identities before observation', () => {
  const plan = buildBackedAssetDeploymentPlan(fixture());
  const template = Buffer.from(bundle.artifacts.vault.evm.deployedBytecode.object, 'hex');
  const independentlyPatched = Buffer.from(template), touched = new Set();
  let count = 0;
  for (const [id, locations] of Object.entries(bundle.artifacts.vault.evm.deployedBytecode.immutableReferences)) {
    const immutableName = bundle.immutableNames.vault[id];
    for (const { start, length } of locations) {
      assert.equal(length, 32); assert.equal(template.subarray(start, start + length).every(n => n === 0), true);
      for (let i = start; i < start + length; i++) { assert.equal(touched.has(i), false); touched.add(i); }
      Buffer.from(word(plan.vault.immutableValues[immutableName]), 'hex').copy(independentlyPatched, start); count++;
    }
  }
  assert.equal(count, 24);
  assert.equal(plan.vault.expectedCode, '0x' + independentlyPatched.toString('hex'));
  assert.notEqual(plan.vault.codeSHA256, BACKED_ASSET_BUILD_PIN.vault.runtimeTemplateSHA256);
  const other = buildBackedAssetDeploymentPlan({ ...fixture(), genesisHash: digest(20), domain: digest(30), runtimeId: digest(40), nextNonce: '127' });
  assert.equal(other.token.expectedCode, plan.token.expectedCode);
  assert.notEqual(other.token.address, plan.token.address); assert.equal(other.vault.nonce, '128');
  assert.notEqual(other.vault.expectedCode, plan.vault.expectedCode); assert.notEqual(other.vault.codeHash, plan.vault.codeHash);
  const alternateSupply = buildBackedAssetDeploymentPlan({ ...fixture(), supply: '1' });
  assert.equal(alternateSupply.vault.expectedCode, plan.vault.expectedCode);
  assert.notEqual(alternateSupply.token.creationData, plan.token.creationData);
});

test('only bounded plain canonical public inputs are accepted; bytecode/source/factory/endpoint overrides fail', () => {
  for (const supply of ['0', '-1', '01', '+1', '1.0', '0x1', '', 1, 1n, new String('1'), (1n << 128n).toString()])
    assert.throws(() => buildBackedAssetDeploymentPlan({ ...fixture(), supply }));
  assert.equal(buildBackedAssetDeploymentPlan({ ...fixture(), supply: ((1n << 128n) - 1n).toString() }).supply, ((1n << 128n) - 1n).toString());
  for (const nextNonce of ['01', '0x0', '-1', 0, ((1n << 64n) - 2n).toString()])
    assert.throws(() => buildBackedAssetDeploymentPlan({ ...fixture(), nextNonce }));
  for (const field of ['domain', 'runtimeId', 'genesisHash']) for (const value of [digest(0), 'ab'.repeat(32), '0x' + 'AB'.repeat(32), {}, 1])
    assert.throws(() => buildBackedAssetDeploymentPlan({ ...fixture(), [field]: value }));
  assert.throws(() => buildBackedAssetDeploymentPlan({ ...fixture(), sender: address(0) }));
  for (const field of ['bytecode', 'expectedCode', 'source', 'factory', 'endpoint', 'gas', 'artifact', 'compiler', 'chainId'])
    assert.throws(() => buildBackedAssetDeploymentPlan({ ...fixture(), [field]: 'caller-selected' }), /COMMITMENT_EXACT_FIELDS/);
  let getterReads = 0;
  const accessor = fixture(); Object.defineProperty(accessor, 'supply', { enumerable: true, get() { getterReads++; return '1'; } });
  assert.throws(() => buildBackedAssetDeploymentPlan(accessor), /COMMITMENT_DATA_FIELDS/); assert.equal(getterReads, 0);
  assert.throws(() => buildBackedAssetDeploymentPlan(new Proxy(fixture(), {})), /COMMITMENT_PLAIN_RECORD/);
  assert.throws(() => buildBackedAssetDeploymentPlan(Object.assign(Object.create(null), fixture())), /COMMITMENT_PLAIN_RECORD/);
  assert.throws(() => buildBackedAssetDeploymentPlan(fixture(), { override: true }), /BACKED_PLAN_ARGUMENTS/);
});

test('lookalike runtimes, plans and copied records never acquire owned deployment authority', async () => {
  let reads = 0, sends = 0;
  const fake = { get metadata() { reads++; throw new Error('DO_NOT_READ'); }, async health() { reads++; }, async send() { sends++; } };
  const { domain, runtimeId, supply } = fixture(), options = { domain, runtimeId, supply };
  await assert.rejects(deployBackedAssets(fake, options), /LOCAL_EVM_OWNED_CAPABILITY_REQUIRED/);
  await assert.rejects(deployBackedAssets(fake, { ...options, endpoint: 'http://127.0.0.1' }), /COMMITMENT_EXACT_FIELDS/);
  await assert.rejects(deployBackedAssets(fake, options, 'extra'), /BACKED_DEPLOY_ARGUMENTS/);
  assert.equal(reads, 0); assert.equal(sends, 0);
  const plan = buildBackedAssetDeploymentPlan(fixture());
  for (const alleged of [plan, plan.token, {}, structuredClone(plan)])
    assert.throws(() => assertOwnedBackedAssets(fake, alleged), /BACKED_DEPLOY_OWNED_CAPABILITY_REQUIRED/);
});

test('importable prepare seam refuses options and existing output before any compiler invocation', () => {
  assert.throws(() => prepareBackedAssetArtifacts({ compile: true }), /BACKED_PREPARE_NO_OPTIONS/);
  assert.throws(() => prepareBackedAssetArtifacts(), /BACKED_PREPARE_OUTPUT_ALREADY_EXISTS/);
});
