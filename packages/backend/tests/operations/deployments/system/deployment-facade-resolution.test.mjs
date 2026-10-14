/** Exact source-extracted production facade checks. Synthetic artifacts/RPC;
 * real ABI codecs and pure selector hashing. No constructor, node or key. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import {FLAT_MINIMUM_PROFILE} from '../../../../src/operations/deployments/system/append-only-build-v3.mjs';
import {normalizeMinimumDepositAtomic} from '../../../../src/chains/shared/contracts/minimum-deposit-v3.mjs';
import { FLAT_BUILD_PIN, FLAT_VERIFIER_ORDER } from '../../../../src/operations/deployments/system/deployment-plan.mjs';
import { canonicalClaimRecordDataV1 } from '../../../../src/claims/storage/segmented-record-store.mjs';
import { genericAccountIdentity, immutable } from '@lianum/engine/accounts/journal';
import { poolRouteDigest, poolEconomicIdentity } from '../../../../src/accounts/storage/flat-pool-route-state.mjs';
import { claimArtifactMethod } from '../../../../src/operations/deployments/claims/native-claim-deployment-plan.mjs';
import { encodeClaimABI } from '@lianum/engine/claims/abi';
import { evmFunctionSelector } from '../../../../src/chains/evm/contracts/evm-code-hash.mjs';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';
import { nativeStaticArguments } from '../../../../src/execution/native/dispatch/native-deployment.mjs';
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
function cut(source, begin, end) {
  const start = source.indexOf(begin), stop = source.indexOf(end, start);
  assert.ok(start >= 0 && stop > start); return source.slice(start, stop);
}
const compile = (body, env) => vm.runInThisContext('(function({' + Object.keys(env).join(',') + '}) {' + body + '\n})')(env);
const claimSource = source('../../../../src/operations/deployments/claims/deploy-native-claims.mjs'), flatSource = source('../../../../src/operations/deployments/system/deploy-system.mjs');
const claimFactory = (resolve) => compile(cut(claimSource, 'function abiValues(', '\nasync function nativePreflight') + '; return facade;',
  { assert, fixedArray, exactRecord, encodeClaimABI, prefix: value => '0x' + value, claimArtifactMethod: resolve });
const flatFactory = (selector = evmFunctionSelector) => compile(cut(flatSource, 'const canonicalType =', '\n/** The exact object')
  + cut(flatSource, 'function viewFacade(', '\nasync function unchangedHead') + '; return viewFacade;',
  { assert, fixedArray, exactRecord, nativeStaticArguments, evmFunctionSelector: selector });
function artifact() {
  const methods = [['totalSupply', [], 'view'], ['balanceOf', [{ name: 'owner', type: 'address' }], 'view'],
    ['setValue', [{ name: 'value', type: 'uint256' }], 'nonpayable']];
  return { abi: methods.map(([name, inputs, stateMutability]) => ({ type: 'function', name, inputs, stateMutability })),
    evm: { methodIdentifiers: Object.fromEntries(methods.map(([name, inputs]) => {
      const signature = name + '(' + inputs.map(row => row.type).join(',') + ')';
      return [signature, evmFunctionSelector(signature)];
    })) } };
}

test('claim facade resolves exactly once per RPC and preserves fresh calls/argument/block bytes', async () => {
  let resolutions = 0; const calls = [], data = artifact(), record = { address: '0x' + '12'.repeat(20) };
  const facade = claimFactory((...args) => { resolutions++; return claimArtifactMethod(...args); })(
    { call: async (...args) => { calls.push(args); return 'fresh-' + calls.length; } }, record, data);
  for (const head of ['0x1', '0x2']) assert.equal(await facade.call('balanceOf(address)', ['0x' + '34'.repeat(20)], head), 'fresh-' + calls.length);
  assert.equal(resolutions, 2); assert.equal(calls.length, 2);
  assert.deepEqual(calls, ['0x1', '0x2'].map(head => [{ to: record.address,
    data: '0x70a08231' + '34'.repeat(20).padStart(64, '0') }, head]));
  await assert.rejects(facade.call('setValue(uint256)', ['1']), /VIEW_ONLY/);
  await assert.rejects(facade.call('balanceOf(address)', []));
  await assert.rejects(facade.call('missing()'), /ABI_METHOD/);
  assert.equal(calls.length, 2);
  data.evm.methodIdentifiers['balanceOf(address)'] = '00000000';
  await assert.rejects(facade.call('balanceOf(address)', ['0x' + '34'.repeat(20)]), /COMPILER_SELECTOR/);
  data.evm.methodIdentifiers['balanceOf(address)'] = '70a08231'; data.abi.push(structuredClone(data.abi[1]));
  await assert.rejects(facade.call('balanceOf(address)', ['0x' + '34'.repeat(20)]), /ABI_METHOD/);
  assert.equal(calls.length, 2);
});

test('flat facade retains exact call bytes and reauthenticates mutable ABI/selector input on every call', async () => {
  let resolutions = 0; const calls = [], data = artifact(), record = { address: '0x' + '12'.repeat(20) };
  const facade = flatFactory(signature => { resolutions++; return evmFunctionSelector(signature); })({ call: async (...args) => { calls.push(args); return calls.length; } }, record, data);
  for (const head of ['0x1', '0x2']) assert.equal(await facade.call('totalSupply()', [], head), calls.length);
  assert.deepEqual(calls, ['0x1', '0x2'].map(head => [{ to: record.address, data: '0x18160ddd' }, head]));
  assert.equal(resolutions, 2);
  await assert.rejects(facade.call('setValue(uint256)', ['1']), /READ_ONLY_METHOD/);
  await assert.rejects(facade.call('totalSupply()', ['1']));
  data.evm.methodIdentifiers['totalSupply()'] = '00000000';
  await assert.rejects(facade.call('totalSupply()'), /METHOD_SELECTOR/);
  data.evm.methodIdentifiers['totalSupply()'] = '18160ddd'; data.abi[0].stateMutability = 'nonpayable';
  await assert.rejects(facade.call('totalSupply()'), /READ_ONLY_METHOD/);
  assert.equal(calls.length, 2);
});


test('canonical tuple calls retain genuine nominal Solidity library selectors and reject changed compiler maps', () => {
  const input = { name: 'value', type: 'tuple', internalType: 'struct Lib.Item', components: [{ name: 'amount', type: 'uint256' }] };
  const nominal = 'inspect(Lib.Item)', canonical = 'inspect((uint256))';
  const data = { abi: [{ type: 'function', name: 'inspect', inputs: [input], stateMutability: 'view' }],
    evm: { methodIdentifiers: { [nominal]: evmFunctionSelector(nominal) } } };
  assert.equal(claimArtifactMethod(data, canonical).selector, evmFunctionSelector(nominal));
  assert.equal(claimArtifactMethod(data, nominal).selector, evmFunctionSelector(nominal));
  data.evm.methodIdentifiers[nominal] = evmFunctionSelector(canonical);
  assert.throws(() => claimArtifactMethod(data, canonical), /COMPILER_SELECTOR/);
});


// Actual reconstruction and route-policy producers. Loader artifacts, system,
// accounts and readers are explicit HOST ports; no chain, deploy, claim or key.
const admissionSource = source('../../../../src/accounts/authority/flat-pool-admission-policy.mjs');
const recoveryFactory = () => compile(cut(flatSource, 'function flatRecoveryArtifactV1(', '\nexport function flatRecoveryViewDataV1')
  + '; return flatRecoveryRouteIdentityV1;', {
    assert, exactRecord, FLAT_BUILD_PIN, FLAT_VERIFIER_ORDER,
    sha: bytes => createHash('sha256').update(bytes).digest('hex'), viewFacade: flatFactory(),
  });
function originalPolicyFactory() {
  const systems = new WeakMap(), accounts = new WeakMap();
  const create = compile(admissionSource.slice(admissionSource.indexOf('export async function createFlatPoolAdmissionPolicy(')).replace('export async function', 'async function')
    + '; return createFlatPoolAdmissionPolicy;', {
      assert, exactRecord, immutable, genericAccountIdentity, poolRouteDigest, poolEconomicIdentity,FLAT_MINIMUM_PROFILE,normalizeMinimumDepositAtomic,
      owned: new WeakMap(), bare: value => value.slice(2),
      assertOwnedFlatSystem(runtime, system) { assert.equal(systems.get(system), runtime, 'HOST_ORIGINAL_SYSTEM'); },
      assertOwnedFlatAccountAuthority(account, expected) { assert.deepEqual(accounts.get(account), expected, 'HOST_ORIGINAL_ACCOUNT'); },
      async createFlatSystemStateReader() { return { read() { throw Error('HOST_MUST_NOT_READ_CHAIN'); } }; },
    });
  return async (runtime, system, account) => {
    systems.set(system, runtime); accounts.set(account, { runtime, system, poolIndex: 0 });
    return create({ runtime, system, accounts: [{ poolIndex: 0, account }], routeOrder: [account.config.registry[0].assetId] });
  };
}
function originalRecoveryFixture() {
  const word = n => BigInt(n).toString(16).padStart(64, '0'), address = n => '0x' + word(n).slice(-40);
  const bundle = { ledger: { artifacts: {} }, provenance: {
    classification: 'HOST_PUBLIC_LOADER_FIXTURE', ledgerAttempt: 'original-host',
    source: { zVersion: 'original', aSHA256: word(1) }, key: { zManifest: word(2), aProgram: word(3) },
  }, verifiers: {} }, verifiers = {};
  for (const [i, [role]] of FLAT_VERIFIER_ORDER.entries()) {
    const data = artifact(), lineage = { zSource: word(i + 4), aKey: { zVK: word(i + 20), aProgram: word(i + 40) } };
    const contractName = 'HOSTVerifier' + i, file = 'host/' + role + '.sol';
    bundle.verifiers[role] = { source: file, contracts: { [contractName]: data }, lineage };
    verifiers[role] = { record: { address: address(i + 10), codeHash: '0x' + word(i + 30), source: file, contractName, lineage },
      artifactSHA256: createHash('sha256').update(JSON.stringify(data)).digest('hex') };
  }
  const pool = { address: address(100), codeHash: '0x' + word(101), assetIdentity: '0x' + word(102), domain: word(103), domainCommitment: '0x' + word(104) };
  const common = { pools: [pool], hub: { address: address(105), codeHash: '0x' + word(106) },
    hubDomain: '0x' + word(107), ledgerNamespace: '0x' + word(108), registryCommitment: '0x' + word(109), verifierSetCommitment: '0x' + word(110) };
  const account = { config: { accountId: 'HOST_original_account', journalId: 'HOST_original_journal', lifetime: word(111),
    registry: [{ assetId: word(112), pool: pool.address.slice(2), assetIdentity: pool.assetIdentity.slice(2), chainId: '31337', genesis: word(113), kind: 'ERC20', token: address(114).slice(2), codeHash: word(115), decimals: 6 }] } };
  return { bundle, captured: { system: { provenance: bundle.provenance }, verifiers }, common, account };
}

test('HOST original system route survives AEAD object reordering on new objects without adopting the saved route', async () => {
  const { bundle, captured, common, account } = originalRecoveryFixture(), restore = recoveryFactory(), policyFor = originalPolicyFactory();
  const runtime = {}, before = restore(runtime, bundle, captured), original = { ...common, ...before };
  const route = (await policyFor(runtime, original, account)).identityForAsset(account.config.registry[0].assetId);
  const saved = JSON.parse(canonicalClaimRecordDataV1(captured));
  assert.notEqual(JSON.stringify(saved.system.provenance), JSON.stringify(bundle.provenance));
  assert.notDeepEqual(Object.keys(saved.verifiers), FLAT_VERIFIER_ORDER.map(([role]) => role));
  const naive = { ...common, provenance: saved.system.provenance,
    verifiers: Object.fromEntries(Object.entries(saved.verifiers).map(([role, packed]) => [role, packed.record])) };
  const naiveRoute = (await policyFor({}, naive, structuredClone(account))).identityForAsset(account.config.registry[0].assetId);
  assert.notEqual(naiveRoute.sourceProvenanceSHA256, route.sourceProvenanceSHA256);
  assert.notEqual(naiveRoute.keyLineageSHA256, route.keyLineageSHA256);
  const successorRuntime = {}, identity = restore(successorRuntime, bundle, saved), successor = { ...common, ...identity };
  const reopened = (await policyFor(successorRuntime, successor, structuredClone(account))).identityForAsset(account.config.registry[0].assetId);
  assert.notEqual(successor, original); assert.notEqual(identity.verifiers, before.verifiers);
  assert.equal(identity.provenance, bundle.provenance); assert.deepEqual(Object.keys(identity.verifiers), FLAT_VERIFIER_ORDER.map(([role]) => role));
  for (const [role] of FLAT_VERIFIER_ORDER) assert.equal(identity.verifiers[role].lineage, bundle.verifiers[role].lineage);
  assert.deepEqual(reopened, route, 'FLAT_CATALOGUE_ORIGINAL_ROUTE');
});

test('HOST original route reconstruction rejects changed source, lineage, role set and artifact before returning any system', () => {
  const { bundle, captured } = originalRecoveryFixture(), restore = recoveryFactory();
  const changes = [
    value => { value.system.provenance.source.zVersion = 'changed'; },
    value => { value.verifiers[FLAT_VERIFIER_ORDER[0][0]].record.lineage.aKey.zVK = '99'.repeat(32); },
    value => { delete value.verifiers[FLAT_VERIFIER_ORDER[1][0]]; },
    value => { value.verifiers.extra = value.verifiers[FLAT_VERIFIER_ORDER[0][0]]; },
    value => { value.verifiers[FLAT_VERIFIER_ORDER[0][0]].artifactSHA256 = '99'.repeat(32); },
  ];
  for (const change of changes) {
    const value = JSON.parse(canonicalClaimRecordDataV1(captured)); change(value);
    assert.throws(() => restore({}, bundle, value));
  }
});
