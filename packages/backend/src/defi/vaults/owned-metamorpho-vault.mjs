/** Local official MetaMorpho redemption. Only an original owned fixture can
 * create this adapter. A confirmed private EXIT is joined by private-vault-exit;
 * this adapter itself neither authenticates private notes nor credits balances.
 * Surviving-keeper reopen only; original runtime/process loss remains separate. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Vault } from '@lianum/engine/crypto/vault';
import { canonical } from '@lianum/engine/crypto/privacy';
import { projectRoot } from '@lianum/engine/chains/shared/runtime-harness';
import { ROOT } from '@lianum/proofs/catalog';
import { assertOwnedLocalEvmV2 } from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOfficialProtocolFixture } from '../../operations/deployments/defi/official-protocol-fixture-v3.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { assertOfficialAaveFixtureV1, officialAaveFixtureCompilationV1 } from '../../operations/deployments/defi/official-aave-fixture-v1.mjs';
import { expectedAaveRuntimeCodeV1 } from '../../operations/deployments/defi/aave-v3-runtime-code-v1.mjs';
import { assertAaveStaticRedemptionAccountingV1 } from './aave-static-redemption-accounting-v1.mjs';
import { assertMorphoVaultRedemptionAccountingV1, assertMorphoBluePositionRedemptionAccountingV1, inspectOriginalEvmExitNativeGasV1 } from './morpho-vault-redemption-accounting-v1.mjs';

import {assertOwnedOriginalMorphoBluePositionV1,readOwnedOriginalMorphoBluePositionContextV1} from '../../operations/deployments/defi/deploy-morpho-blue-position-v1.mjs';
const recoveries = new WeakMap();
import {createRetainedOfficialVaultJournalV1,openRetainedOfficialVaultJournalV1} from './retained-external-vault-journal-v1.mjs';
const variants = new WeakMap(), owned = new WeakMap(), bindings = new WeakMap(), receipts = new WeakMap(), nativeCosts = new WeakMap();
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(canonical(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const detached = value => freeze(clone(value));
const fresh = () => randomBytes(32).toString('hex');
const bare = value => { assert.match(value, /^0x[0-9a-f]+$/); return value.slice(2); };
const word = value => BigInt(value).toString(16).padStart(64, '0');
const quantity = value => { assert.match(value, /^0x(0|[1-9a-f][0-9a-f]*)$/); return BigInt(value); };
const uint = (value, bits = 128) => { assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'METAMORPHO_UINT');
  const n = BigInt(value); assert.ok(n > 0n && n < (1n << BigInt(bits)), 'METAMORPHO_UINT_RANGE'); return n; };
function reference(value) { assert.match(value, /^[0-9a-f]{64}$/); assert.notEqual(value, '0'.repeat(64)); return value; }
export const isOwnedMetaMorphoVault = value => owned.has(value) && variants.get(value) === 'METAMORPHO';
export const isOwnedAaveStaticVaultV1 = value => owned.has(value) && variants.get(value) === 'AAVE_STATIC';
export const isOwnedDeviceMetaMorphoVaultV2 = value => owned.has(value) && variants.get(value) === 'DEVICE_METAMORPHO';
export const isOwnedDeviceAaveStaticVaultV1 = value => owned.has(value) && variants.get(value) === 'DEVICE_AAVE_STATIC';
export const isOwnedMorphoBluePositionVaultV1 = value => owned.has(value) && variants.get(value) === 'MORPHO_BLUE_POSITION';
export const isOwnedOfficialStaticVaultV1 = value => owned.has(value);
export function assertOwnedMetaMorphoVault(runtime, value) {
  assert.ok(owned.get(value) === runtime && owned.has(value), 'METAMORPHO_ORIGINAL_CAPABILITY');
}
export function ownedMetaMorphoVaultBinding(runtime, value) { assertOwnedMetaMorphoVault(runtime, value); return bindings.get(value); }
export function assertOwnedMetaMorphoReceipt(value, receipt) { assert.equal(receipts.get(receipt), value, 'METAMORPHO_ORIGINAL_RECEIPT'); }
export function readOriginalOfficialVaultNativeCostsV1(value, result) {
  assert.equal(arguments.length,2);assert.ok(owned.has(value)&&nativeCosts.get(result)?.adapter===value,'ORIGINAL_VAULT_NATIVE_COSTS');
  return detached(nativeCosts.get(result).costs);
}

function compileExit() {
  const source = readFileSync(join(ROOT, 'contracts/defi/BoundedMetaMorphoExit.sol'), 'utf8');
  const require = createRequire(join(projectRoot, 'tools/solidity-js/package.json')), solc = require('solc');
  assert.match(solc.version(), /^0\.8\.37\+commit\.f401782d/);
  const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast'] } } };
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'BoundedMetaMorphoExit.sol': { content: source } }, settings })));
  assert.deepEqual((output.errors ?? []).filter(row => row.severity === 'error'), [], 'METAMORPHO_EXIT_COMPILATION');
  return { artifact: output.contracts['BoundedMetaMorphoExit.sol'].BoundedMetaMorphoExit,
    ast: output.sources['BoundedMetaMorphoExit.sol'].ast, sourceSHA256: sha(source), compiler: solc.version() };
}
function expectedCode(build, vault, asset) {
  const names = Object.fromEntries(build.ast.nodes.filter(node => node.nodeType === 'ContractDefinition')
    .flatMap(node => node.nodes).filter(node => node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable')
    .map(node => [String(node.id), node.name]));
  const code = Buffer.from(build.artifact.evm.deployedBytecode.object, 'hex'), values = { vault, asset }, seen = new Set();
  for (const [id, ranges] of Object.entries(build.artifact.evm.deployedBytecode.immutableReferences)) {
    assert.ok(Object.hasOwn(values, names[id]), 'METAMORPHO_EXIT_IMMUTABLE'); seen.add(names[id]);
    for (const range of ranges) { assert.equal(range.length, 32); Buffer.from(bare(values[names[id]]).padStart(64, '0'), 'hex').copy(code, range.start); }
  }
  assert.deepEqual([...seen].sort(), ['asset', 'vault']); return '0x' + code.toString('hex');
}

export function createOwnedMetaMorphoVault(input) { assert.equal(arguments.length,1); return createOwnedProtocolVaultV1(input,'METAMORPHO'); }
export function createOwnedAaveStaticVaultV1(input) { assert.equal(arguments.length,1); return createOwnedProtocolVaultV1(input,'AAVE_STATIC'); }
export function createRetainedOwnedMetaMorphoVaultV1(input){assert.equal(arguments.length,1);return createOwnedProtocolVaultV1(input,'METAMORPHO',{saved:null});}
export function createRetainedOwnedAaveStaticVaultV1(input){assert.equal(arguments.length,1);return createOwnedProtocolVaultV1(input,'AAVE_STATIC',{saved:null});}
/** Device Aave cannot use the legacy unpermissioned adapter: its execute
 * accepts only the SAME private redemption request issued after SHARE W39. */
export function createRetainedOwnedDeviceMetaMorphoVaultV2(input){assert.equal(arguments.length,1);return createOwnedProtocolVaultV1(input,'DEVICE_METAMORPHO',{saved:null});}
export async function reopenRetainedOwnedDeviceMetaMorphoVaultV2(token){assert.equal(arguments.length,1);const {consumeOriginalDeviceExternalFlatGraphRecoveryPartV1}=await import('../../operations/local/device-external-flat-source-graph-service-v1.mjs');const {runtime,protocols,saved}=consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(token,'meta-exit');assert.equal(saved.variant,'DEVICE_METAMORPHO');assertOfficialProtocolFixture(runtime,protocols);return createOwnedProtocolVaultV1({runtime,protocolFixture:protocols},'DEVICE_METAMORPHO',{saved});}
export function createRetainedOwnedDeviceAaveStaticVaultV1(input){assert.equal(arguments.length,1);return createOwnedProtocolVaultV1(input,'DEVICE_AAVE_STATIC',{saved:null});}
export async function reopenRetainedOwnedDeviceAaveStaticVaultV1(token){assert.equal(arguments.length,1);const {consumeOriginalDeviceExternalFlatGraphRecoveryPartV1}=await import('../../operations/local/device-external-flat-source-graph-service-v1.mjs');const {runtime,protocols,saved}=consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(token,'aave-exit');assert.equal(saved.variant,'DEVICE_AAVE_STATIC');assertOfficialAaveFixtureV1(runtime,protocols);return createOwnedProtocolVaultV1({runtime,protocolFixture:protocols},'DEVICE_AAVE_STATIC',{saved});}
/** Private SOURCE token binds this non-destructive checkpoint to the same Aave adapter. */
export async function checkpointRetainedOwnedDeviceAaveStaticVaultSourceV3(value,token){assert.equal(arguments.length,2);const {consumeOriginalDeviceGraphSourceRequestV2}=await import('../../operations/recovery/device-external-flat-original-source-v2.mjs');consumeOriginalDeviceGraphSourceRequestV2(token,'aave-adapter-checkpoint',value);const state=recoveries.get(value);assert.ok(state&&variants.get(value)==='DEVICE_AAVE_STATIC','AAVE_SOURCE_ORIGINAL_ADAPTER');return state.checkpoint();}
export function captureRetainedOwnedOfficialStaticVaultV1(value){assert.equal(arguments.length,1);const state=recoveries.get(value);assert.ok(state,'EXTERNAL_VAULT_RETAINED_REQUIRED');return state.capture();}
export function retainedOwnedOfficialStaticVaultContextV1(value){assert.equal(arguments.length,1);const state=recoveries.get(value);assert.ok(state,'EXTERNAL_VAULT_RETAINED_REQUIRED');return state.context();}
export async function reopenRetainedOwnedOfficialStaticVaultV1(token){assert.equal(arguments.length,1);const {consumeExternalDefiOfficialVaultReopenV1}=await import('../../accounts/recovery/external-defi-catalogue-recovery-v1.mjs');const {input,saved}=consumeExternalDefiOfficialVaultReopenV1(token);assert.ok(['METAMORPHO','AAVE_STATIC'].includes(saved.variant));return createOwnedProtocolVaultV1(input,saved.variant,{saved});}
export function createRetainedOwnedMorphoBluePositionVaultV1(input){
 assert.equal(arguments.length,1);exactRecord(input,['runtime','position']);assertOwnedOriginalMorphoBluePositionV1(input.runtime,input.position);
 const {protocolFixture}=readOwnedOriginalMorphoBluePositionContextV1(input.runtime,input.position);
 return createOwnedProtocolVaultV1({runtime:input.runtime,protocolFixture},'MORPHO_BLUE_POSITION',{saved:null},input.position);
}
export async function reopenRetainedOwnedMorphoBluePositionVaultV1(token){
 assert.equal(arguments.length,1);const {consumeOriginalDeviceExternalFlatGraphRecoveryPartV1}=await import('../../operations/local/device-external-flat-source-graph-service-v1.mjs');
 const {runtime,position,saved}=consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(token,'blue-exit');
 assert.equal(saved.variant,'MORPHO_BLUE_POSITION');assertOwnedOriginalMorphoBluePositionV1(runtime,position);
 const {protocolFixture}=readOwnedOriginalMorphoBluePositionContextV1(runtime,position);
 return createOwnedProtocolVaultV1({runtime,protocolFixture},'MORPHO_BLUE_POSITION',{saved},position);
}
async function createOwnedProtocolVaultV1(input, variant, retained = null, position = null) {
  const deviceMeta = variant === 'DEVICE_METAMORPHO', deviceAave = variant === 'DEVICE_AAVE_STATIC', aave = deviceAave || variant === 'AAVE_STATIC', blue = variant === 'MORPHO_BLUE_POSITION'; exactRecord(input, ['runtime', 'protocolFixture']);
  const { runtime, protocolFixture: originalFixture } = input;
  if(blue){assertOwnedOriginalMorphoBluePositionV1(runtime,position);assert.equal(readOwnedOriginalMorphoBluePositionContextV1(runtime,position).protocolFixture,originalFixture);}
  const fixture=blue?Object.freeze({...originalFixture,vault:position.contract}):originalFixture;
  const adapterProfile=deviceMeta?'OWNED_DEVICE_METAMORPHO_EXIT_V2':blue?'OWNED_MORPHO_BLUE_POSITION_EXIT_V1':deviceAave?'OWNED_DEVICE_AAVE_STATIC_EXIT_V1':aave?'OWNED_AAVE_STATIC_EXIT_V1':'OWNED_METAMORPHO_EXIT_V1';
  const deploymentLabel=blue?'deploy-bounded-morpho-blue-position-exit':aave?'deploy-bounded-aave-static-exit':'deploy-bounded-metamorpho-exit';
  await assertOwnedLocalEvmV2(runtime); if(aave)assertOfficialAaveFixtureV1(runtime,fixture);else assertOfficialProtocolFixture(runtime, originalFixture);
  assert.equal(runtime.metadata.chainId, '31337');
  const require = createRequire(join(ROOT, 'wallet-platform/artifacts/private-external-v1/abi-tools/package.json'));
  const originalBuild = aave ? officialAaveFixtureCompilationV1(runtime,fixture) : null;
  const { Interface } = require('ethers'), build = aave ? {...originalBuild,artifact:originalBuild.artifacts.BoundedAaveStaticExit,sourceSHA256:originalBuild.inputSHA256} : (retained?.saved?retained.saved.build:compileExit()), iface = new Interface(build.artifact.abi);
  const sender = runtime.accounts[0], vault = fixture.vault, asset = fixture.first;
  const creation = '0x' + build.artifact.evm.bytecode.object + iface.encodeDeploy([vault.address]).slice(2);
  if(retained?.saved){assert.equal(retained.saved.schema,'EXTERNAL_ORIGINAL_OFFICIAL_VAULT_V1');assert.equal(retained.saved.variant,variant);assert.deepEqual(retained.saved.build,build);if(!aave)assert.equal(build.sourceSHA256,sha(readFileSync(join(ROOT,'contracts/defi/BoundedMetaMorphoExit.sol'),'utf8')));assert.match(build.compiler,/^0\.8\.37\+commit\.f401782d/);}
  const deployment = retained?.saved ? retained.saved.deployment : await runtime.send(deploymentLabel, { from: sender, data: creation });
  if(retained?.saved){const original=runtime.transactions.filter(row=>row.transactionHash===deployment.transactionHash);assert.equal(original.length,1);assert.equal(original[0].label,deploymentLabel);assert.equal(original[0].phase,'mined');assert.equal(original[0].request.from,sender);assert.equal(original[0].request.data,creation);assert.deepEqual(original[0].receipt,deployment);await runtime.checkReceipt(deployment);}
  await runtime.assertCanonical(deployment); const router = deployment.contractAddress.toLowerCase();
  const routerCode = aave ? expectedAaveRuntimeCodeV1(build.artifact,build.sourceASTs,{}, {vault:vault.address,asset:asset.address}) : expectedCode(build, vault.address, asset.address);
  assert.equal(await runtime.code(router, deployment.blockNumber), routerCode, 'METAMORPHO_EXIT_DEPLOYED_CODE');
  const id = detached({ chainId: '31337', genesisHash: bare(runtime.metadata.evmGenesis), domain: sha((blue?'MORPHO_BLUE_POSITION_EXIT/':aave?'AAVE_STATIC_EXIT/':'METAMORPHO_EXIT/') + router),
    runtimeId: sha(runtime.metadata.scratchDirectory), asset: bare(asset.address), vault: bare(vault.address),
    assetCodeSHA256: sha(Buffer.from(bare(asset.code), 'hex')), vaultCodeSHA256: sha(Buffer.from(bare(vault.code), 'hex')) });
  const binding = detached({ identity: id, sender: bare(sender), receiver: bare(sender) });
  const directory = retained?.saved ? retained.saved.directory : await mkdtemp(join(runtime.metadata.scratchDirectory, blue?'morpho-blue-position-exit-':aave?'aave-static-exit-':'metamorpho-exit-'));
  const store = new Vault(join(directory, 'operations.vault'));let password=retained?.saved?retained.saved.lifetime.credentials.password:fresh();const keeper=retained?.saved?retained.saved.keeper:fresh();
  let record = retained?.saved ? await store.read(password) : await store.create({ profile: adapterProfile, identity: id, router, operations: [], sendBlocked: false }, password);
  const lifetimeIdentity={profile:'EXTERNAL_ORIGINAL_OFFICIAL_VAULT_LIFETIME_V1',variant,binding};
  if(retained?.saved){assert.deepEqual(binding,retained.saved.binding);assert.deepEqual(record,retained.saved.record);assert.equal(record.data.profile,adapterProfile);assert.deepEqual(record.data.identity,id);assert.equal(record.data.router,router);}
  const lifetime=retained?await (retained.saved?openRetainedOfficialVaultJournalV1(runtime,lifetimeIdentity,{path:store.path,password},record,retained.saved.lifetime):createRetainedOfficialVaultJournalV1(runtime,lifetimeIdentity,{path:store.path,password},record)):null;
  let busy = false, poisoned = false, pending = null, adapter,closed=false,capturing=false,blueRequest=null;
  async function bluePermission(ref){if(!blue&&!deviceAave&&!deviceMeta)return;const {assertOriginalBluePositionRedemptionRequestV1,assertOriginalAaveStaticRedemptionRequestV1,assertOriginalMetaMorphoRedemptionRequestV2}=await import('../withdrawals/device-morpho-blue-private-exit-v1.mjs');(deviceMeta?assertOriginalMetaMorphoRedemptionRequestV2:deviceAave?assertOriginalAaveStaticRedemptionRequestV1:assertOriginalBluePositionRedemptionRequestV1)(blueRequest,adapter,ref);}
  const assertFixture = async () => {if(blue)assertOwnedOriginalMorphoBluePositionV1(runtime,position);if(aave)assertOfficialAaveFixtureV1(runtime,originalFixture);else assertOfficialProtocolFixture(runtime, originalFixture);await assertOwnedLocalEvmV2(runtime);};
  async function healthy() { if(retained)assert.ok(!closed,'EXTERNAL_VAULT_CLOSED'); assert.ok(!poisoned, 'METAMORPHO_STORAGE_UNAVAILABLE'); await assertFixture();
    try { if(lifetime)await lifetime.check(record);assert.deepEqual(await store.read(password), record, 'METAMORPHO_JOURNAL_CHANGED'); } catch (error) { poisoned = true; throw error; } }
  async function exclusive(work) {if(retained)assert.ok(!closed&&!capturing,'EXTERNAL_VAULT_CLOSED'); assert.ok(!busy, 'METAMORPHO_BUSY'); busy = true; try { await healthy(); return await work(); } finally { busy = false; } }
  async function write(transform) { try { await healthy(); pending = { revision: record.revision + 1, data: clone(transform(clone(record.data))) };
    if(lifetime)await lifetime.before(record,pending);
    const next = await store.update(password, record.revision, old => { assert.deepEqual(old, record.data); return pending.data; });
    assert.deepEqual(next, pending); assert.deepEqual(await store.read(password), next);if(lifetime)await lifetime.acknowledged(next); record = next; pending = null;
  } catch (error) { poisoned = true; throw error; } }
  const find = ref => { reference(ref); const row = record.data.operations.find(row => row.reference === ref); assert.ok(row, 'METAMORPHO_PREPARATION_REQUIRED'); return row; };
  const update = (ref, changes) => write(data => ({ ...data, operations: data.operations.map(row => row.reference === ref ? { ...row, ...clone(changes) } : row) }));
  const read = async (contract, method, args, at) => contract.iface.decodeFunctionResult(method,
    await runtime.call({ to: contract.address, data: contract.iface.encodeFunctionData(method, args) }, at));
  const routerContract = { address: router, iface };
  async function observed(at = 'latest', ref = '0'.repeat(64)) {
    await assertFixture(); const header = await runtime.block(at), tag = header.number;
    assert.equal(await runtime.code(vault.address, tag), vault.code, 'METAMORPHO_CODE_CHANGED');
    assert.equal(await runtime.code(asset.address, tag), asset.code, 'METAMORPHO_ASSET_CODE_CHANGED');
    if(aave)await fixture.assertCurrent(tag);else {
    assert.equal(await runtime.code(fixture.blue.address, tag), fixture.blue.code, 'METAMORPHO_MORPHO_CODE_CHANGED');
    assert.equal((await read(vault, 'MORPHO', [], tag))[0].toLowerCase(), fixture.blue.address, 'METAMORPHO_ORIGINAL_MORPHO');
    const params = await read(fixture.blue, 'idToMarketParams', [fixture.marketId], tag);
    assert.equal(params[0].toLowerCase(), asset.address, 'METAMORPHO_ORIGINAL_MARKET');
    for (const index of [1, 2, 3]) assert.equal(params[index].toLowerCase(), '0x' + '0'.repeat(40), 'METAMORPHO_ORIGINAL_MARKET');
    assert.equal(params[4], 0n, 'METAMORPHO_ORIGINAL_MARKET');
    }
    assert.equal(await runtime.code(router, tag), routerCode, 'METAMORPHO_EXIT_CODE_CHANGED');
    assert.equal((await read(vault, 'asset', [], tag))[0].toLowerCase(), asset.address);
    const values = await Promise.all([
      read(vault, 'totalAssets', [], tag), read(vault, 'totalSupply', [], tag), read(vault, 'balanceOf', [sender], tag),
      read(asset, 'balanceOf', [sender], tag), read(vault, 'allowance', [sender, router], tag),
      read(vault, 'balanceOf', [router], tag), read(routerContract, 'used', [sender, '0x' + ref], tag),
      ...(aave?[]:[
      read(fixture.blue, 'market', [fixture.marketId], tag),
      read(fixture.blue, 'position', [fixture.marketId, vault.address], tag),
      read(asset, 'balanceOf', [fixture.blue.address], tag), read(asset, 'balanceOf', [vault.address], tag),
      read(asset, 'totalSupply', [], tag),
      ]),
    ]);
    await runtime.assertCanonical(header);
    const [assets, shares, senderShares, senderAssets, allowance, routerShares, used] = values.slice(0, 7).map(row => row[0]);
    let morpho = null, aaveAccounting = null;
    if(aave) {
      const rows=await Promise.all([read(vault,'rate',[],tag),read(fixture.aToken,'scaledBalanceOf',[vault.address],tag),
        read(fixture.aToken,'scaledTotalSupply',[],tag),read(fixture.aToken,'balanceOf',[vault.address],tag),
        read(asset,'balanceOf',[fixture.aToken.address],tag),read(asset,'balanceOf',[vault.address],tag),read(asset,'totalSupply',[],tag),
        read(fixture.stableDebt,'totalSupply',[],tag),read(fixture.variableDebt,'totalSupply',[],tag)]);
      aaveAccounting={pool:fixture.pool.address,aToken:fixture.aToken.address,wrapper:vault.address,
        ...Object.fromEntries(['rate','scaledWrapper','scaledTotal','wrapperAssets','poolUnderlying','wrapperUnderlying','inputSupply','stableDebt','variableDebt'].map((key,index)=>[key,rows[index][0].toString()]))};
    }else {
    morpho = { protocol: fixture.blue.address, marketId: fixture.marketId, positionOwner: vault.address,
      market: Object.fromEntries(['totalSupplyAssets', 'totalSupplyShares', 'totalBorrowAssets', 'totalBorrowShares', 'lastUpdate', 'fee']
        .map((name, index) => [name, values[7][index].toString()])),
      position: Object.fromEntries(['supplyShares', 'borrowShares', 'collateral'].map((name, index) => [name, values[8][index].toString()])),
      underlyingBalance: values[9][0].toString(), vaultUnderlyingBalance: values[10][0].toString(), assetTotalSupply: values[11][0].toString() };
    if(blue){assert.equal(position.contract.address,vault.address);assert.equal(morpho.position.supplyShares,shares.toString(),'BLUE_POSITION_EXACT_SHARE_BACKING');assert.equal(morpho.vaultUnderlyingBalance,'0','BLUE_POSITION_NO_IDLE_ASSET');const expected=shares*(BigInt(morpho.market.totalSupplyAssets)+1n)/(BigInt(morpho.market.totalSupplyShares)+1_000_000n);assert.equal(assets,expected,'BLUE_POSITION_ORIGINAL_NAV');}
    // Fixed original market has zero collateral, IRM, LLTV and debt; these are
    // read from the same canonical block, not inferred from a vault NAV.
    for (const name of ['totalBorrowAssets', 'totalBorrowShares', 'fee']) assert.equal(morpho.market[name], '0', 'METAMORPHO_ORIGINAL_MARKET');
    for (const name of ['borrowShares', 'collateral']) assert.equal(morpho.position[name], '0', 'METAMORPHO_ORIGINAL_POSITION');
    }
    return detached({ identity: id, snapshot: { blockNumber: quantity(tag).toString(), blockHash: bare(header.hash),
      blockTimestamp: quantity(header.timestamp).toString(), totalAssets: assets.toString(), totalShares: shares.toString() },
      balances: { senderShares: senderShares.toString(), senderAssets: senderAssets.toString(), allowance: allowance.toString(),
        routerShares: routerShares.toString(), used }, ...(aave?{aave:aaveAccounting}:{morpho}), header, privateSpendable: false });
  }
  async function quote(intent) {
    exactRecord(intent, ['reference', 'kind', 'amount', 'minimumOutput', 'deadline']); reference(intent.reference);
    assert.equal(intent.kind, 'redeem'); const shares = uint(intent.amount), minimum = uint(intent.minimumOutput), deadline = uint(intent.deadline, 64);
    const current = await observed('latest', intent.reference), at = current.header.number;
    assert.equal(current.balances.used, false, 'METAMORPHO_REFERENCE_USED');
    assert.ok(shares <= BigInt(current.balances.senderShares), 'METAMORPHO_SHARE_BALANCE');
    const [preview, maximum] = await Promise.all([read(vault, 'previewRedeem', [shares], at), read(vault, 'maxRedeem', [sender], at)]);
    assert.ok(shares <= maximum[0], 'METAMORPHO_REDEEM_LIQUIDITY');
    assert.ok(preview[0] >= minimum, 'METAMORPHO_MINIMUM_ABOVE_PREVIEW');
    const timestamp = BigInt(current.snapshot.blockTimestamp);
    assert.ok(deadline > timestamp && deadline - timestamp <= 300n, 'METAMORPHO_DEADLINE_WINDOW');
    await runtime.assertCanonical(current.header);
    return detached({ identity: id, kind: 'redeem', sender: bare(sender), owner: bare(sender), receiver: bare(sender),
      amount: intent.amount, minimumOutput: intent.minimumOutput, deadline: intent.deadline, nonce: intent.reference,
      previewOutput: preview[0].toString(), quote: current.snapshot });
  }
  function output(ref, freshObservation = false) {
    const row = find(ref), result = detached({ reference: ref, action: row.action, phase: row.phase, execution: row.execution,
      sendBlocked: record.data.sendBlocked, privateSpendable: false, assurance: blue?'ORIGINAL_LOCAL_MORPHO_BLUE_POSITION_PUBLIC_REDEMPTION':aave?'ORIGINAL_LOCAL_AAVE_STATIC_PUBLIC_REDEMPTION':'ORIGINAL_LOCAL_METAMORPHO_PUBLIC_REDEMPTION',
      processRestartSupported: false });
    nativeCosts.set(result,{adapter,costs:{approvalRequired:row.approval!==null,
      approval:row.approval?.nativeGas??null,redemption:row.execution?.nativeGas??null}});
    if (freshObservation && row.phase === 'OBSERVED') receipts.set(result, adapter); return result;
  }
  async function reconcileSend(ref, kind) {
    const row = find(ref), submission = row[kind]; if (!submission) return false;
    const entries = runtime.transactions.slice(submission.journalStart).filter(item => item.label === submission.label);
    assert.ok(entries.length <= 1, 'METAMORPHO_NO_DUPLICATE_SEND');
    if (!entries.length || !entries[0].transactionHash) return false;
    const original = entries[0]; assert.deepEqual(original.request, submission.request, 'METAMORPHO_ORIGINAL_REQUEST');
    assert.equal(quantity(original.senderNonce).toString(), submission.senderNonce, 'METAMORPHO_ORIGINAL_NONCE');
    const hash = original.transactionHash, [transaction, receipt] = await Promise.all([runtime.transaction(hash), runtime.receipt(hash)]);
    if (!transaction || !receipt) return false;
    assert.equal(transaction.hash, hash); assert.equal(receipt.transactionHash, hash);
    assert.equal(transaction.from, sender); assert.equal(transaction.to, submission.request.to); assert.equal(transaction.input, submission.request.data);
    assert.equal(quantity(transaction.nonce).toString(), submission.senderNonce); assert.equal(transaction.blockHash, receipt.blockHash);
    const header = await runtime.assertCanonical(receipt); assert.deepEqual(header.transactions, [hash], 'METAMORPHO_SINGLE_TRANSACTION');
    const before = await observed('0x' + (quantity(header.number) - 1n).toString(16), ref), after = await observed(header.number, ref);
    assert.deepEqual(before, submission.before, 'METAMORPHO_ORIGINAL_PARENT');
    assert.equal(header.parentHash, before.header.hash); await runtime.checkReceipt(receipt);
    let confirmation = null, phase;
    if (receipt.status === '0x0') {
      assert.deepEqual(before.balances, after.balances, 'METAMORPHO_REVERT_BALANCES');
      assert.deepEqual(aave?before.aave:before.morpho,aave?after.aave:after.morpho,'OFFICIAL_VAULT_REVERT_PROTOCOL');
      assert.equal(before.snapshot.totalAssets, after.snapshot.totalAssets); assert.equal(before.snapshot.totalShares, after.snapshot.totalShares);
      phase = 'REVERTED';
    } else {
      assert.equal(receipt.status, '0x1');
      if (kind === 'approval') {
        assert.equal(after.balances.allowance, row.action.amount, 'METAMORPHO_EXACT_ALLOWANCE');
        assert.deepEqual(aave?before.aave:before.morpho,aave?after.aave:after.morpho,'OFFICIAL_VAULT_APPROVAL_PROTOCOL');
        for (const name of ['senderShares', 'senderAssets', 'routerShares', 'used']) assert.equal(after.balances[name], before.balances[name]);
        phase = 'PREPARED';
      } else {
        const events = receipt.logs.filter(log => log.address.toLowerCase() === router).map(log => {
          assert.equal(log.removed, false); assert.equal(log.blockHash, header.hash); assert.equal(log.transactionHash, hash); return iface.parseLog(log);
        });
        assert.equal(events.length, 1, 'METAMORPHO_REDEMPTION_EVENT'); const event = events[0]; assert.equal(event.name, 'Redeemed');
        assert.equal(event.args.owner.toLowerCase(), sender); assert.equal(event.args.operationRef, '0x' + ref);
        const shares = BigInt(row.action.amount), assets = event.args.assets;
        assert.equal(event.args.shares, shares); assert.ok(assets >= BigInt(row.action.minimumOutput), 'METAMORPHO_MINIMUM');
        assert.ok(quantity(header.timestamp) <= BigInt(row.action.deadline), 'METAMORPHO_DEADLINE');
        assert.equal(BigInt(before.balances.senderShares) - BigInt(after.balances.senderShares), shares, 'METAMORPHO_EXACT_SHARE_DELTA');
        assert.equal(BigInt(after.balances.senderAssets) - BigInt(before.balances.senderAssets), assets, 'METAMORPHO_EXACT_ASSET_DELTA');
        assert.equal(before.balances.used, false); assert.equal(after.balances.used, true); assert.equal(after.balances.routerShares, before.balances.routerShares);
        assert.equal(BigInt(before.snapshot.totalShares) - BigInt(after.snapshot.totalShares), shares, 'METAMORPHO_SHARE_SUPPLY');
        const protocolRedemption = aave?assertAaveStaticRedemptionAccountingV1({before:before.aave,after:after.aave,assets:assets.toString()}):blue?assertMorphoBluePositionRedemptionAccountingV1({before:before.morpho,after:after.morpho,shares:shares.toString(),assets:assets.toString()}):assertMorphoVaultRedemptionAccountingV1({ before: before.morpho, after: after.morpho, assets: assets.toString() });
        confirmation = { shares: shares.toString(), assets: assets.toString(), transactionHash: bare(hash), ...(aave?{aaveRedemption:protocolRedemption}:{morphoRedemption:protocolRedemption}), privateSpendable: false }; phase = 'OBSERVED';
      }
    }
    let nativeGas;
    try {
      assert.equal(quantity(transaction.gas),quantity(submission.request.gas));
      assert.equal(quantity(receipt.effectiveGasPrice),quantity(transaction.gasPrice));
      nativeGas=inspectOriginalEvmExitNativeGasV1({transactionHash:bare(hash),blockHash:bare(header.hash),
        blockNumber:quantity(header.number).toString(),payer:bare(sender),receiptStatus:receipt.status==='0x1'?'APPLIED':'REVERTED',
        gasUsed:quantity(receipt.gasUsed).toString(),gasPriceWei:quantity(transaction.gasPrice).toString(),
        gasLimit:quantity(transaction.gas).toString(),nativeValue:quantity(transaction.value).toString()});
    } catch { nativeGas={profile:'ORIGINAL_EVM_EXIT_NATIVE_GAS_V1',status:'UNKNOWN',payer:bare(sender),nativeGasCostWei:null}; }
    await update(ref, { [kind]: { ...submission, transactionHash: bare(hash), receipt: clone(receipt), confirmation, nativeGas },
      phase, ...(kind === 'execution' ? { execution: { ...submission, transactionHash: bare(hash), receipt: clone(receipt), confirmation, nativeGas } } : {}) });
    return kind === 'execution' && phase === 'OBSERVED';
  }
  async function submit(ref, kind, request, before) {
    const row = find(ref); assert.equal(row[kind], null, 'METAMORPHO_NO_RESEND');
    const submission = { label: (blue?'morpho-blue-position-exit-':'metamorpho-exit-') + keeper + '-' + kind + '-' + ref, request,
      journalStart: runtime.transactions.length, senderNonce: (await runtime.nonce(sender)).toString(), before,
      transactionHash: null, receipt: null, confirmation: null };
    await bluePermission(ref);await update(ref, { [kind]: submission, phase: 'EXECUTION_UNRESOLVED' });
    try { await bluePermission(ref);await runtime.send(submission.label, request); }
    catch { await write(data => ({ ...data, sendBlocked: true })); }
    return reconcileSend(ref, kind);
  }
  adapter = Object.freeze({
    observe: () => exclusive(() => observed()),
    /** Read-only official conversion at the same pinned block as share custody.
     * A private note still requires original EXIT before public redemption. */
    observePrivateShares(input) { return exclusive(async () => {
      exactRecord(input, ['amount', 'holder']);
      assert.ok(typeof input.amount === 'string' && /^(0|[1-9][0-9]*)$/.test(input.amount)
        && BigInt(input.amount) < (1n << 64n), 'METAMORPHO_PRIVATE_SHARE_AMOUNT');
      assert.ok(typeof input.holder === 'string' && /^0x[0-9a-f]{40}$/.test(input.holder)
        && input.holder !== '0x' + '0'.repeat(40), 'METAMORPHO_PRIVATE_SHARE_HOLDER');
      const amount = input.amount, holder = input.holder, current = await observed(), at = current.header.number;
      const [preview, maximum, held] = await Promise.all([
        read(vault, 'previewRedeem', [amount], at), read(vault, 'maxRedeem', [holder], at),
        read(vault, 'balanceOf', [holder], at),
      ]);
      assert.ok(BigInt(amount) <= held[0], 'METAMORPHO_PRIVATE_SHARE_BACKING');
      await runtime.assertCanonical(current.header);
      assert.deepEqual(await runtime.block(), current.header, 'METAMORPHO_PRIVATE_POSITION_HEAD_CHANGED');
      return detached({ ...current, privateSharePreview: { amount, holder,
        redeemableUnderlying: preview[0].toString(), maximumShares: maximum[0].toString(), heldShares: held[0].toString() } });
    }); },
    validateQuote: intent => exclusive(() => quote(clone(intent))),
    async prepareOnce(intent) { return exclusive(async () => {
      exactRecord(intent, ['reference', 'kind', 'amount', 'minimumOutput', 'deadline']); reference(intent.reference);
      const previous = record.data.operations.find(row => row.reference === intent.reference);
      if (previous) { for (const name of ['kind', 'amount', 'minimumOutput', 'deadline']) assert.equal(previous.action[name], intent[name], 'METAMORPHO_INTENT_REBOUND'); return output(intent.reference); }
      assert.ok(record.data.operations.length < 32, 'METAMORPHO_CAPACITY'); const action = await quote(clone(intent));
      await write(data => ({ ...data, operations: [...data.operations, { reference: intent.reference, action, phase: 'PREPARED', approval: null, execution: null }] }));
      return output(intent.reference);
    }); },
    async requoteUnsubmitted(intent) { return exclusive(async () => {
      exactRecord(intent, ['reference', 'minimumOutput', 'deadline']); const row = find(intent.reference);
      assert.ok(row.phase === 'PREPARED' && !row.approval && !row.execution && !record.data.sendBlocked, 'METAMORPHO_REQUOTE_UNSUBMITTED');
      const action = await quote({ reference: row.reference, kind: 'redeem', amount: row.action.amount, minimumOutput: intent.minimumOutput, deadline: intent.deadline });
      assert.ok((row.quoteHistory?.length ?? 0) < 8, 'METAMORPHO_REQUOTE_CAPACITY');
      await update(row.reference, { action, quoteHistory: [...(row.quoteHistory ?? []), row.action] }); return output(row.reference);
    }); },
    async execute(ref,originalRequest) { if(blue||deviceAave||deviceMeta){assert.equal(arguments.length,2);const {assertOriginalBluePositionRedemptionRequestV1,assertOriginalAaveStaticRedemptionRequestV1,assertOriginalMetaMorphoRedemptionRequestV2}=await import('../withdrawals/device-morpho-blue-private-exit-v1.mjs');(deviceMeta?assertOriginalMetaMorphoRedemptionRequestV2:deviceAave?assertOriginalAaveStaticRedemptionRequestV1:assertOriginalBluePositionRedemptionRequestV1)(originalRequest,adapter,ref);}return exclusive(async () => {
      blueRequest=blue||deviceAave||deviceMeta?originalRequest:null;try{
      let row = find(ref); if (row.execution) return output(ref, await reconcileSend(ref, 'execution'));
      assert.ok(row.phase === 'PREPARED' && !record.data.sendBlocked, 'METAMORPHO_RECONCILE_REQUIRED');
      assert.ok(record.data.operations.every(other => other.reference === ref || other.phase !== 'EXECUTION_UNRESOLVED'), 'METAMORPHO_OTHER_UNRESOLVED');
      const intent = { reference: ref, ...Object.fromEntries(['kind', 'amount', 'minimumOutput', 'deadline'].map(name => [name, row.action[name]])) };
      await quote(intent); let before = await observed('latest', ref);
      if (!row.approval && before.balances.allowance !== row.action.amount) {
        await submit(ref, 'approval', { from: sender, to: vault.address, data: vault.iface.encodeFunctionData('approve', [router, row.action.amount]), gas: '0x1c9c380', value: '0x0' }, before);
        row = find(ref); if (row.phase !== 'PREPARED' || record.data.sendBlocked) return output(ref);
      }
      await quote(intent); before = await observed('latest', ref); assert.equal(before.balances.allowance, row.action.amount, 'METAMORPHO_EXACT_ALLOWANCE');
      const freshObservation = await submit(ref, 'execution', { from: sender, to: router,
        data: iface.encodeFunctionData('redeem', [row.action.amount, row.action.minimumOutput, row.action.deadline, '0x' + ref]), gas: '0x1c9c380', value: '0x0' }, before);
      return output(ref, freshObservation);
      }finally{blueRequest=null;}
    }); },
    async reconcile(ref) { return exclusive(async () => { const row = find(ref);
      const freshObservation = row.execution ? await reconcileSend(ref, 'execution') : row.approval ? await reconcileSend(ref, 'approval') : false;
      return output(ref, freshObservation); }); },
    async reopen() {if(retained)assert.ok(!closed&&!capturing,'EXTERNAL_VAULT_CLOSED'); assert.ok(!busy, 'METAMORPHO_BUSY'); busy = true; try {
      await assertFixture(); const next = await store.read(password);
      assert.deepEqual(next, pending && next.revision === pending.revision ? pending : record, 'METAMORPHO_ORIGINAL_CHECKPOINT');
      if(lifetime)await lifetime.reconcile(next);record = next; pending = null; poisoned = false;
      return { reopened: true, processRestartSupported: false, references: record.data.operations.map(row => row.reference) };
    } catch (error) { poisoned = true; throw error; } finally { busy = false; } },
    ...(retained?{close(){assert.ok(!busy&&!pending,'EXTERNAL_VAULT_BUSY');closed=true;password=null;return {closed:true};}}:{}),
    metadata: detached({ profile: adapterProfile, sourceSHA256: build.sourceSHA256, compiler: build.compiler,
      publicRedemption: true, privateSpendable: false, underlyingAddress: asset.address, vaultAddress: vault.address, routerAddress: router }),
  });
  owned.set(adapter, runtime); variants.set(adapter,variant); bindings.set(adapter, binding);
  if(retained){recoveries.set(adapter,{context(){assert.ok(!closed&&!capturing);return Object.freeze({runtime,fixture:originalFixture,variant,binding,...(blue?{position}:{})});},async checkpoint(){if(busy||capturing||pending)return null;assert.ok(deviceAave&&!closed&&!poisoned,'AAVE_SOURCE_ORIGINAL_ADAPTER');busy=true;try{await healthy();await observed();const saved={schema:'EXTERNAL_ORIGINAL_OFFICIAL_VAULT_V1',variant,directory,keeper,binding:clone(binding),build:structuredClone(build),deployment:clone(deployment),record:clone(record),lifetime:await lifetime.capture(record)};await healthy();return saved;}catch(error){poisoned=true;throw error;}finally{busy=false;}},async capture(){assert.ok(!busy&&!closed&&!capturing&&!poisoned&&!pending,'EXTERNAL_VAULT_CAPTURE_IDLE');capturing=true;busy=true;try{await healthy();await observed();const saved={schema:'EXTERNAL_ORIGINAL_OFFICIAL_VAULT_V1',variant,directory,keeper,binding:clone(binding),build:structuredClone(build),deployment:clone(deployment),record:clone(record),lifetime:await lifetime.capture(record)};closed=true;password=null;return saved;}catch(error){poisoned=true;closed=true;password=null;throw error;}finally{busy=false;}}});}
  return adapter;
}
