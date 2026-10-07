/** Lightweight capability/preflight fixtures only; no runtime, actual artifact
 * loader or deployment runs. node --experimental-test-module-mocks --test */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOwnedFlatSystem } from './deploy-system.mjs';

test('plain, copied and undefined system/runtime claims never create authority', () => {
  for (const [runtime, system] of [[{}, {}], [undefined, {}], [undefined, undefined],
    [null, null], [{}, { classification: 'OWNED_LOCAL_FLAT_SYSTEM_NOT_PROOF_ACCEPTANCE' }]])
    assert.throws(() => assertOwnedFlatSystem(runtime, system), /FLAT_OWNED_SYSTEM_CAPABILITY_REQUIRED/);
});

// Read-only host fixtures stop at the artifact-loader boundary. No artifact is
// loaded and no deployment is made. Module mocks are explicit test authority.
const { mock } = await import('node:test');
const { readFile } = await import('node:fs/promises');
const { createECDH } = await import('node:crypto');
const assetOwners = new WeakMap(), testRuntimes = new WeakSet();
let loadAttempts = 0, nativeFactories = 0;
mock.module(new URL('../chain-adapters/local-evm-ownership.mjs', import.meta.url).href, { exports: {
  async assertLocalEvm(runtime) { assert.ok(testRuntimes.has(runtime), 'TEST_OWNED_RUNTIME'); },
} });
function assetFor(runtime, native = false) {
  const asset = Object.freeze({ metadata: Object.freeze({ kind: native ? 'NATIVE' : 'ERC20', symbol: native ? 'ETH' : 'PALT',
    decimals: native ? 18 : 6, address: '0x' + (native ? '00' : '22').repeat(20), codeHash: '0x' + (native ? '00' : '33').repeat(32) }),
  async read(query) { runtime.reads.push(query); return { blockNumber: query.blockNumber, blockHash: runtime.header.hash, balance: '0' }; } });
  assetOwners.set(asset, runtime); return asset;
}
mock.module(new URL('../chain-adapters/owned-pool-asset.mjs', import.meta.url).href, { exports: {
  assertOwnedPoolAsset(runtime, asset) { assert.ok(assetOwners.has(asset) && assetOwners.get(asset) === runtime, 'TEST_ASSET_CAPABILITY'); },
  async createNativePoolAsset({ runtime }) { nativeFactories++; return assetFor(runtime, true); },
} });
mock.module(new URL('./deployment-artifacts.mjs', import.meta.url).href, { exports: {
  async loadFlatDeploymentArtifacts() { loadAttempts++; throw new Error('TEST_STOP_BEFORE_ARTIFACTS_OR_SEND'); },
} });
const { deployFlatSystem } = await import('./deploy-system.mjs?synthetic-asset-preflight');
const digest = value => '0x' + BigInt(value).toString(16).padStart(64, '0');
function fixture() {
  const runtime = { accounts: ['0x' + '11'.repeat(20)], metadata: { chainId: '31337' }, reads: [],
    header: { number: '0x2', hash: digest(2) }, receipts: [], transactions: [],
    async block() { return { ...this.header }; }, async assertCanonical(header) { assert.deepEqual(header, this.header); },
    async send() { throw new Error('TEST_MUST_NOT_SEND'); } };
  testRuntimes.add(runtime);
  const attesterKeys = [1, 2, 3, 4].map(value => {
    const key = createECDH('secp256k1'); key.setPrivateKey(Buffer.from(digest(value).slice(2), 'hex'));
    const publicKey = key.getPublicKey().toString('hex'); return { x: publicKey.slice(2, 66), y: publicKey.slice(66) };
  });
  return { runtime, options: { deploymentDomain: digest(10), registryEpoch: '1', rulesRoot: digest(11), attesterKeys,
    pools: [{ policy: digest(12), deploymentDomain: digest(13) }, { policy: digest(14), deploymentDomain: digest(15) }] } };
}

test('legacy native options and optional mixed assets are verified before artifact loading or sends', async () => {
  for (const mixed of [false, true]) {
    const { runtime, options } = fixture();
    if (mixed) options.pools[1].assetCapability = assetFor(runtime);
    const previousLoads = loadAttempts, previousNatives = nativeFactories;
    await assert.rejects(deployFlatSystem(runtime, options), error => error.cause?.message === 'TEST_STOP_BEFORE_ARTIFACTS_OR_SEND');
    assert.equal(loadAttempts, previousLoads + 1); assert.equal(nativeFactories, previousNatives + 1);
    assert.deepEqual(runtime.reads, Array(2).fill({ holder: runtime.accounts[0], blockNumber: '0x2' }));
  }
});

test('pool asset overrides and copied/cross-runtime capabilities fail before artifact loading', async () => {
  for (const override of ['asset', 'assetCodeHash', 'assetCapability', 'cross-runtime', 'copied']) {
    const { runtime, options } = fixture(), previousLoads = loadAttempts;
    if (override === 'cross-runtime') options.pools[0].assetCapability = assetFor(fixture().runtime);
    else if (override === 'copied') options.pools[0].assetCapability = { ...assetFor(runtime) };
    else options.pools[0][override] = override === 'assetCapability' ? undefined : digest(99);
    await assert.rejects(deployFlatSystem(runtime, options), /EXACT_FIELDS|TEST_ASSET_CAPABILITY/);
    assert.equal(loadAttempts, previousLoads); assert.equal(runtime.reads.length, 0);
  }
});

test('source wires only pins to planner and makes mixed aggregate aliases explicitly unavailable', async () => {
  const source = await readFile(new URL('./deploy-system.mjs', import.meta.url), 'utf8');
  assert.match(source, /pools: configuration\.pools\.map\(\(\{ assetCapability, \.\.\.pool \}\) => pool\)/);
  assert.match(source, /assetCapability, assetMetadata: assetCapability\.metadata/);
  assert.match(source, /asset: commonAsset\?\.asset \?\? null/);
  assert.match(source, /assetCodeHash: commonAsset\?\.assetCodeHash \?\? null/);
  assert.match(source, /FLAT_DEPLOY_AMBIGUOUS_AGGREGATE_ASSET/);
});
