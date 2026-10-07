/** Retained artifact and explicitly mocked bootstrap unit tests only.
 * No compiler, prover, EVM process, key generation or deployment is run.
 * Run with --experimental-test-module-mocks. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { deriveNativeRuntimeCode, predictNativeCreateAddress } from '../../../../../engine/src/execution/native/dispatch/native-deployment.mjs';
import { buildBackedAssetDeploymentPlan, loadBackedAssetDeploymentArtifacts } from '../../../../src/operations/deployments/defi/deploy-backed-assets.mjs';
import { LOCAL_EVM_PROFILE } from '../../../../../engine/src/execution/local/local-evm.mjs';
const brands = { runtimes: new WeakSet(), systems: new WeakMap(), assets: new WeakMap(), pools: new WeakSet() };
mock.module(new URL('../chain-adapters/owned-evm-v2-runtime.mjs', import.meta.url).href, { exports: { LOCAL_EVM_PROFILE } });
mock.module(new URL('../chain-adapters/local-evm-ownership.mjs', import.meta.url).href, { exports: {
  async assertLocalEvm(runtime) { assert.ok(brands.runtimes.has(runtime), 'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED'); },
} });
mock.module(new URL('./deploy-system.mjs', import.meta.url).href, { exports: {
  assertOwnedFlatSystem(runtime, system) { assert.equal(brands.systems.get(system), runtime, 'FLAT_OWNED_SYSTEM_CAPABILITY_REQUIRED'); },
} });
mock.module(new URL('./deploy-backed-assets.mjs', import.meta.url).href, { exports: {
  loadBackedAssetDeploymentArtifacts,
  assertOwnedBackedAssets(runtime, assets) { assert.equal(brands.assets.get(assets), runtime, 'BACKED_DEPLOY_OWNED_CAPABILITY_REQUIRED'); },
} });
mock.module(new URL('../chain-adapters/owned-pool-asset.mjs', import.meta.url).href, { exports: {
  assertOwnedPoolAsset(runtime, asset) { assert.ok(brands.runtimes.has(runtime) && brands.pools.has(asset), 'OWNED_POOL_ASSET_CAPABILITY_REQUIRED'); },
} });
const { EVM_VAULT_ROUTER_BUILD_PIN, loadEvmVaultRouterDeploymentArtifacts, deployEvmVaultRouter, assertOwnedEvmVaultRouter }
  = await import('../../../../src/operations/deployments/defi/deploy-evm-vault-router.mjs');
const sha = value => createHash('sha256').update(value).digest('hex'), word = value => BigInt(value).toString(16).padStart(64, '0');
const digest = value => '0x' + word(value), address = value => '0x' + word(value).slice(-40), hex = value => '0x' + BigInt(value).toString(16);
const hashCode = code => '0x' + publicKeccak256(Buffer.from(code.slice(2), 'hex')).toString('hex');
const sourceFields = ['solver', 'asset', 'vault', 'targetPool', 'assetCodeSHA256', 'vaultCodeSHA256', 'targetPoolCodeSHA256',
  'genesisHash', 'ledgerNamespace', 'vaultDomain', 'vaultRuntimeId', 'targetDomain', 'targetScope', 'targetPolicy'];
const assetIdentity = asset => '0x' + sha(Buffer.from('24' + word(31337) + asset.address.slice(2) + asset.codeHash.slice(2), 'hex'));
const bundle = loadEvmVaultRouterDeploymentArtifacts();
function fixture() {
  const sender = '0x' + '11'.repeat(20), solver = address(5), genesisHash = digest(2);
  const plan = buildBackedAssetDeploymentPlan({ sender, nextNonce: '0', genesisHash, domain: digest(3), runtimeId: digest(4), supply: '20000' });
  const c = { journal: [], transactions: new Map(), receipts: new Map(), codes: new Map(), headers: new Map(), calls: [], sends: 0, nonce: 5n };
  const header = (n, txs = []) => ({ number: hex(n), hash: digest(100 + n), parentHash: digest(99 + n), timestamp: hex(1000 + n), transactions: txs });
  c.headers.set('0x0', { ...header(0), hash: genesisHash });
  for (const n of [1, 2, 50]) c.headers.set(hex(n), header(n)); c.head = c.headers.get('0x32');
  function mined(record, n, hash = digest(200 + n), logs = []) {
    const h = c.headers.get(hex(n)), receipt = { transactionHash: hash, status: '0x1', contractAddress: record.address,
      from: sender, to: null, blockNumber: h.number, blockHash: h.hash, transactionIndex: '0x0', gasUsed: '0x10000', logs };
    h.transactions = [hash];
    const request = { from: sender, data: record.creationData, gas: hex(30000000), value: '0x0' };
    const transaction = { hash, from: sender, to: null, input: record.creationData, nonce: hex(record.nonce), gas: hex(30000000),
      value: '0x0', blockNumber: h.number, blockHash: h.hash, transactionIndex: '0x0' };
    c.journal.push({ label: 'synthetic backing asset', phase: 'mined', request, senderNonce: hex(record.nonce), transactionHash: hash, receipt });
    c.transactions.set(hash, transaction); c.receipts.set(hash, receipt); c.codes.set(record.address, record.expectedCode);
    return { ...record, receipt, transactionHash: hash };
  }
  const token = mined(plan.token, 1, undefined, [{ synthetic: 'original mint log' }]), vault = mined(plan.vault, 2);
  const backedAssets = { sender, token, vault, identity: plan.identity, supply: plan.supply };
  const makeCode = (n, code) => ({ address: address(n), expectedCode: code, codeHash: hashCode(code) });
  const hub = makeCode(40, '0x6000'), pools = [makeCode(41, '0x6001'), makeCode(42, '0x6002')];
  const libraries = { fixture: makeCode(43, '0x6003') }, verifiers = { deposit_intent: makeCode(44, '0x6004') };
  const system = { sender, hub, pools, libraries, verifiers, generatedLibraries: {}, ledgerNamespace: digest(70), hubDomain: digest(70) };
  for (const record of [hub, ...pools, ...Object.values(libraries), ...Object.values(verifiers)]) c.codes.set(record.address, record.expectedCode);
  for (const [index, pool] of pools.entries()) {
    const asset = index === 0 ? token : vault;
    const metadata = { kind: 'ERC20', symbol: index === 0 ? 'PALT' : 'BLTV', decimals: 6, address: asset.address,
      codeHash: asset.codeHash, chainId: '31337', genesisHash };
    const assetCapability = { metadata }; brands.pools.add(assetCapability);
    Object.assign(pool, { asset: asset.address, assetCodeHash: asset.codeHash, assetIdentity: assetIdentity(asset),
      assetCapability, assetMetadata: metadata, scope: digest(80 + index), policy: digest(90 + index), ledgerNamespace: system.ledgerNamespace,
      domainCommitment: digest(1000 + index), selectors: { 'depositBalanceIntent(bytes,bytes32[])': 'e4cb6f9a' } });
    pool.domain = { scope: pool.scope.slice(2), policy: pool.policy.slice(2), asset: pool.assetIdentity.slice(2),
      ledgerNamespace: system.ledgerNamespace.slice(2), hubDomain: system.hubDomain.slice(2) };
    pool.call = async (signature, args, at) => {
      const name = signature.slice(0, -2); c.calls.push([pool.address, signature, at]);
      const value = name === 'receiptHub' ? hub.address : name === 'receiptHubCodeHash' ? hub.codeHash
        : name === 'transitionInProgress' ? 0 : pool[name];
      assert.notEqual(value, undefined, 'SYNTHETIC_POOL_GETTER_' + signature); return digest(value);
    };
  }
  hub.call = async (signature, args, at) => {
    c.calls.push([hub.address, signature, at]);
    if (signature === 'isRegisteredPool(address)') return digest(1);
    if (signature === 'poolDomain(address)') return pools.find(p => p.address === args[0]).domainCommitment;
    assert.equal(signature, 'domainPool(bytes32)'); return digest(pools.find(p => p.domainCommitment === args[0]).address);
  };
  const runtime = {
    accounts: [sender, solver], metadata: { chainId: '31337', evmGenesis: genesisHash, profile: LOCAL_EVM_PROFILE },
    get transactions() { return structuredClone(c.journal); },
    async block(at = 'latest') { return structuredClone(at === 'latest' ? c.head : c.headers.get(at)); },
    async assertCanonical(value) { const h = c.headers.get(value.number ?? value.blockNumber);
      assert.equal(value.hash ?? value.blockHash, h.hash, 'SYNTHETIC_REORG'); return structuredClone(h); },
    async transaction(hash) { return structuredClone(c.transactions.get(hash) ?? null); },
    async receipt(hash) { return structuredClone(c.receipts.get(hash) ?? null); },
    async checkReceipt(receipt) { assert.deepEqual(receipt, c.receipts.get(receipt.transactionHash)); },
    async nonce() { return c.nonce; },
    async keccak(code) { return hashCode(code); },
    async code(target, at) { return c.changedCode === target ? '0x6009' : c.codes.get(target) ?? '0x'; },
    async call({ to, data }, at) {
      c.calls.push([to, data, at]); const sel = data.slice(2, 10), isRouter = to === c.routerAddress;
      const art = isRouter ? bundle.artifact : to === token.address ? loadBackedAssetDeploymentArtifacts().artifacts.token : loadBackedAssetDeploymentArtifacts().artifacts.vault;
      const name = Object.entries(art.evm.methodIdentifiers).find(([, x]) => x === sel)?.[0]; assert.ok(name, 'SYNTHETIC_GETTER');
      if (isRouter) {
        if (name === 'DELIVERY_SELECTOR()') return '0xc523b849' + '0'.repeat(56);
        if (name === 'DEPOSIT_SELECTOR()') return '0xe4cb6f9a' + '0'.repeat(56);
        if (name === 'deliveryCount()') return digest(0);
        if (['ROUTER_VERSION()', 'ADAPTER_VERSION()'].includes(name)) return digest(1);
        return digest(c.immutableValues[name.slice(0, -2)]);
      }
      if (name === 'totalSupply()') return digest(plan.supply);
      if (name === 'decimals()') return digest(6);
      return digest(vault.immutableValues[name.slice(0, -2)]);
    },
    async send(label, request) {
      c.sends++; if (c.failSend) throw new Error('SYNTHETIC_SEND_UNKNOWN');
      const target = predictNativeCreateAddress(sender, c.nonce), constructor = request.data.slice(-14 * 64).match(/.{64}/g);
      const configuration = Object.fromEntries(sourceFields.map((name, i) => [name, '0x' + constructor[i].slice(i < 4 ? 24 : 0)]));
      c.immutableValues = { ...configuration, assetIdentity: assetIdentity(token), shareIdentity: assetIdentity(vault) }; c.routerAddress = target;
      const expectedCode = deriveNativeRuntimeCode({ artifact: bundle.artifact, deployedAddress: target,
        immutableNames: bundle.immutableNames, immutableValues: c.immutableValues });
      c.headers.set('0x33', header(51)); c.head = c.headers.get('0x33');
      const result = mined({ address: target, nonce: c.nonce.toString(), creationData: request.data, expectedCode }, 51);
      c.journal.at(-1).label = label; c.nonce++;
      if (c.badActualNonce) c.transactions.get(result.transactionHash).nonce = '0x6';
      return structuredClone(result.receipt);
    },
  };
  brands.runtimes.add(runtime); brands.systems.set(system, runtime); brands.assets.set(backedAssets, runtime);
  return { c, runtime, system, options: { sourcePoolIndex: 0, destinationPoolIndex: 1, solver, backedAssets } };
}

test('fixed capture preserves original compiler, source, AST, ABI, all immutable offsets and contract sizes', () => {
  assert.equal(bundle.manifest.compiler.version, '0.8.37+commit.f401782d.Emscripten.clang');
  assert.equal(bundle.manifest.compilerRerun, false); assert.equal(bundle.manifest.nativeNodesStarted, false);
  assert.equal(bundle.manifest.proofGenerated, false); assert.equal(bundle.manifest.privateDeFiAcceptance, false);
  assert.equal(bundle.manifest.runtimeBytes, 22929); assert.equal(bundle.manifest.creationBytes, 27712);
  assert.equal(Object.keys(bundle.immutableNames).length, 16); assert.ok(Object.isFrozen(bundle.artifact.abi));
  assert.equal(sha(readFileSync(new URL('../../../.local/evm-vault-router/v1/compiled.json', import.meta.url))), EVM_VAULT_ROUTER_BUILD_PIN.compiledSHA256);
  assert.throws(() => loadEvmVaultRouterDeploymentArtifacts({ source: '/tmp/other' }), /NO_OPTIONS/);
});
test('mocked original CREATE derives all constructor/runtime identities independently and brands exact object only', async () => {
  const f = fixture(), router = await deployEvmVaultRouter(f.runtime, f.system, f.options);
  assert.equal(f.c.sends, 1); assert.equal(router.nonce, '5'); assert.equal(router.address, predictNativeCreateAddress(f.system.sender, 5n));
  const template = Buffer.from(bundle.artifact.evm.deployedBytecode.object, 'hex'), patched = Buffer.from(template);
  for (const [id, locations] of Object.entries(bundle.artifact.evm.deployedBytecode.immutableReferences))
    for (const { start, length } of locations) {
      assert.equal(length, 32); assert.ok(template.subarray(start, start + length).every(byte => byte === 0));
      Buffer.from(word(router.immutableValues[bundle.immutableNames[id]]), 'hex').copy(patched, start);
    }
  assert.equal(router.expectedCode, '0x' + patched.toString('hex')); assert.equal(router.codeSHA256, sha(patched));
  assert.equal(router.constructorData, '0x' + sourceFields.map(name => word(router.immutableValues[name])).join(''));
  assert.equal(router.creationData, '0x' + bundle.artifact.evm.bytecode.object + router.constructorData.slice(2));
  assert.equal(router.identity.assetIdentity, f.system.pools[0].domain.asset); assert.equal(router.identity.shareIdentity, f.system.pools[1].domain.asset);
  assert.equal(router.identity.targetDomain, f.system.pools[1].domainCommitment.slice(2));
  assertOwnedEvmVaultRouter(f.runtime, f.system, router);
  assert.throws(() => assertOwnedEvmVaultRouter(f.runtime, f.system, { ...router }), /OWNED_CAPABILITY/);
  assert.deepEqual((await router.read()).identity, router.identity);
  await assert.rejects(deployEvmVaultRouter(f.runtime, f.system, f.options), /ALREADY_ATTEMPTED/);
  assert.equal(router.privateDeFiAcceptance, false); assert.equal(router.privateSpendable, false);
});
test('source/destination asset identity, namespace, D27 role and solver substitutions stop before send', async () => {
  for (const mutate of [f => f.options.sourcePoolIndex = 1, f => f.options.solver = address(99),
    f => f.system.pools[0].asset = f.system.pools[1].asset,
    f => f.system.pools[1].domain.asset = word(99), f => f.system.pools[1].ledgerNamespace = digest(99),
    f => delete f.system.verifiers.deposit_intent, f => f.system.pools[1].selectors['depositBalanceIntent(bytes,bytes32[])'] = '00000000',
    f => f.c.changedCode = f.options.backedAssets.vault.address,
    f => f.c.receipts.delete(f.options.backedAssets.token.transactionHash)]) {
    const f = fixture(); mutate(f); await assert.rejects(deployEvmVaultRouter(f.runtime, f.system, f.options)); assert.equal(f.c.sends, 0);
  }
});
test('uncertain send is never repeated and actual creation nonce cannot be substituted', async () => {
  const f = fixture(); f.c.failSend = true;
  await assert.rejects(deployEvmVaultRouter(f.runtime, f.system, f.options), /SEND_UNKNOWN/);
  f.c.failSend = false; await assert.rejects(deployEvmVaultRouter(f.runtime, f.system, f.options), /ALREADY_ATTEMPTED/); assert.equal(f.c.sends, 1);
  const g = fixture(); g.c.badActualNonce = true;
  await assert.rejects(deployEvmVaultRouter(g.runtime, g.system, g.options)); assert.equal(g.c.sends, 1);
});
test('later code/receipt/history substitution fails the retained router read', async () => {
  for (const mutate of [(f, r) => f.c.changedCode = r.address, (f, r) => f.c.receipts.delete(r.transactionHash),
    f => f.c.changedCode = f.system.pools[0].address,
    f => f.c.receipts.delete(f.options.backedAssets.vault.transactionHash),
    (f, r) => f.c.headers.get(r.receipt.blockNumber).hash = digest(9999)]) {
    const f = fixture(), r = await deployEvmVaultRouter(f.runtime, f.system, f.options); mutate(f, r);
    await assert.rejects(r.read());
  }
});
test('caller overrides and lookalike brands fail without touching attacker state', async () => {
  let reads = 0; const runtime = { get metadata() { reads++; throw new Error('GETTER'); } };
  const options = { sourcePoolIndex: 0, destinationPoolIndex: 1, solver: address(5), backedAssets: {} };
  await assert.rejects(deployEvmVaultRouter(runtime, {}, options), /OWNED_CAPABILITY/); assert.equal(reads, 0);
  for (const key of ['rpc', 'compiler', 'bytecode', 'pins', 'factory', 'expectedCode', 'path'])
    await assert.rejects(deployEvmVaultRouter(runtime, {}, { ...options, [key]: 'substitution' }), /EXACT_FIELDS/);
  const f = fixture(); await assert.rejects(deployEvmVaultRouter(f.runtime, f.system, { ...f.options, backedAssets: { ...f.options.backedAssets } }), /BACKED_DEPLOY_OWNED/);
  assert.equal(f.c.sends, 0);
});
