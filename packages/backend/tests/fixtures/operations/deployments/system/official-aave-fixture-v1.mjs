/** Fresh local official Aave V3 + StaticATokenLM. Every backing unit is held in
 * the genuine Pool/aToken, with a real paid flash-loan premium for yield. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {GENERIC_COMPILER_PIN} from '../../../../../../engine/src/execution/local/local-deployment.mjs';
import { ROOT } from '../../../../../../proofs/src/catalog.mjs';
import { assertOwnedLocalEvmV2 } from '../../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { loadBackedAssetDeploymentArtifacts } from '../../../../../src/operations/deployments/defi/deploy-backed-assets.mjs';
import {loadOfficialAaveWrapperSourcesV1} from '../../../../../src/operations/deployments/defi/aave-v3-official-material-v1.mjs';
import {exactRecord} from '../../../../../src/execution/encoding/commitments.mjs';
import { loadOfficialAaveCoreArtifactsV1 } from '../../../../../src/operations/deployments/defi/aave-v3-official-material-v1.mjs';
import { compileAaveDevelopmentContractsV1 } from '../../../../../src/operations/deployments/defi/aave-v3-development-compilation-v1.mjs';
import { linkAaveCreationCodeV1, expectedAaveRuntimeCodeV1 } from '../../../../../src/operations/deployments/defi/aave-v3-runtime-code-v1.mjs';
const owned = new WeakMap(), sha = value => createHash('sha256').update(value).digest('hex');
const zero = '0x' + '0'.repeat(40), RAY = 10n ** 27n;
// New source review. This is intentionally separate from protocol/native/private acceptance.
export const OFFICIAL_AAVE_DEVELOPMENT_SOURCE_REVIEW_V1 = Object.freeze({
  profile:'OFFICIAL_AAVE_STATIC_V1',coreVersion:'1.19.3',
  wrapperCommit:'101f5d977889254ca2d2711b9582b45f832d10a0',compilation:'NEW_REVIEWED',
  compilationInputSHA256:'9e5bc8f4f7ddc5a5e244aa05af154c515a552179259b2be6c806d98f91c144b8',
  compilationOutputSHA256:'08691c84cc7cfb3a4d2f3244daab71b1995e1c5ee4e7a6b415f0155ef6c348bb',
  localOnly:true,fakeFundsOnly:true,publicNetwork:false,privateGraphAcceptance:false,
});
export function assertOfficialAaveSourceReviewV1() {
  assert.equal(arguments.length,0);const value=OFFICIAL_AAVE_DEVELOPMENT_SOURCE_REVIEW_V1;
  assert.ok(value!==null,'AAVE_DEVELOPMENT_SOURCE_REVIEW_REQUIRED');
  assert.deepEqual(value,{profile:'OFFICIAL_AAVE_STATIC_V1',coreVersion:'1.19.3',
    wrapperCommit:'101f5d977889254ca2d2711b9582b45f832d10a0',compilation:'NEW_REVIEWED',
    compilationInputSHA256:'9e5bc8f4f7ddc5a5e244aa05af154c515a552179259b2be6c806d98f91c144b8',
    compilationOutputSHA256:'08691c84cc7cfb3a4d2f3244daab71b1995e1c5ee4e7a6b415f0155ef6c348bb',
    localOnly:true,fakeFundsOnly:true,publicNetwork:false,privateGraphAcceptance:false});
}
export function assertOfficialAaveFixtureV1(runtime, fixture) {
  assert.ok(owned.has(fixture) && owned.get(fixture).runtime === runtime, 'ORIGINAL_AAVE_FIXTURE_REQUIRED');
}
export function officialAaveFixtureCompilationV1(runtime, fixture) {
  assertOfficialAaveFixtureV1(runtime, fixture); return owned.get(fixture).build;
}
export async function createOfficialAaveFixtureV1(runtime) {
  assert.equal(arguments.length, 1); await assertOwnedLocalEvmV2(runtime); assert.equal(runtime.metadata.chainId, '31337');
  assertOfficialAaveSourceReviewV1();
  const abiD = join(ROOT, 'wallet-platform/artifacts/private-external-v1');
  const manifestRaw = readFileSync(join(abiD, 'protocol-fixture-artifact-pins.json'));
  assert.equal(sha(manifestRaw), '9913e72be559a10c7340ba291f88b067eab2dd3a0c290052c4c024db14bff2e8');
  for (const row of JSON.parse(manifestRaw).files.filter(row => row.path.startsWith('abi-tools/')))
    assert.equal(sha(readFileSync(join(abiD,row.path))), row.sha256);
  const require = createRequire(join(abiD, 'abi-tools/package.json')), {Interface} = require('ethers');
  const core = loadOfficialAaveCoreArtifactsV1(), build = compileAaveDevelopmentContractsV1();
  assert.equal(build.inputSHA256,OFFICIAL_AAVE_DEVELOPMENT_SOURCE_REVIEW_V1.compilationInputSHA256,'AAVE_REVIEWED_COMPILATION_INPUT');
  assert.equal(sha(JSON.stringify({artifacts:build.artifacts,sourceASTs:build.sourceASTs})),
    OFFICIAL_AAVE_DEVELOPMENT_SOURCE_REVIEW_V1.compilationOutputSHA256,'AAVE_REVIEWED_COMPILATION_OUTPUT');
  const sender = runtime.accounts[0], deployments = [], proxies = [], libraries = {};
  async function read(contract, method, args = [], tag = 'latest') {
    return contract.iface.decodeFunctionResult(method, await runtime.call({from: sender, to: contract.address,
      data: contract.iface.encodeFunctionData(method,args)}, tag));
  }
  async function send(contract, method, args = []) {
    const receipt = await runtime.send('aave-official-' + contract.name + '-' + method,
      {from: sender, to: contract.address, data: contract.iface.encodeFunctionData(method,args)});
    await runtime.assertCanonical(receipt); return receipt;
  }
  async function deploy(name, artifact, args, immutableValues, asts = core.sourceASTs, library = false) {
    const iface = new Interface(artifact.abi), creation = linkAaveCreationCodeV1(artifact,libraries) + iface.encodeDeploy(args).slice(2);
    assert.ok((creation.length - 2) / 2 <= 49152, 'AAVE_EIP3860_CREATION_LIMIT');
    const receipt = await runtime.send('aave-official-deploy-' + name, {from: sender,data: creation});
    await runtime.assertCanonical(receipt); const address = receipt.contractAddress.toLowerCase();
    const code = expectedAaveRuntimeCodeV1(artifact,asts,libraries,immutableValues,library ? address : null);
    assert.equal(await runtime.code(address,receipt.blockNumber),code,'AAVE_FULL_DEPLOYED_RUNTIME');
    const record = Object.freeze({name,address,iface,code,receipt:Object.freeze({...receipt}),creationSHA256:sha(Buffer.from(creation.slice(2),'hex'))});
    deployments.push(record); return record;
  }
  async function deployLibrary(name) {
    if (libraries[name]) return;
    const a = core.artifacts[name];
    for (const names of Object.values(a.evm.bytecode.linkReferences)) for (const dependency of Object.keys(names)) await deployLibrary(dependency);
    const row = await deploy(name,a,[],{},core.sourceASTs,true); libraries[name] = row.address;
  }
  const token = loadBackedAssetDeploymentArtifacts().artifacts.token;
  const first = await deploy('underlying', {...token,sourceName:'PrivateAssetTestToken.sol',contractName:'PrivateAssetTestToken'}, [10n ** 15n], {}, {}, false);
  const decimals = (await read(first,'decimals'))[0]; assert.equal(decimals,6n);
  const provider = await deploy('PoolAddressesProvider',core.artifacts.PoolAddressesProvider,['Lianum local Aave V3',sender],{});
  await send(provider,'setACLAdmin',[sender]);
  const acl = await deploy('ACLManager',core.artifacts.ACLManager,[provider.address],{ADDRESSES_PROVIDER:provider.address});
  await send(provider,'setACLManager',[acl.address]); await send(acl,'addPoolAdmin',[sender]);
  assert.equal((await read(acl,'isPoolAdmin',[sender]))[0],true);
  for (const name of ['BorrowLogic','BridgeLogic','EModeLogic','FlashLoanLogic','LiquidationLogic','PoolLogic','SupplyLogic','ConfiguratorLogic']) await deployLibrary(name);
  const poolImplementation = await deploy('Pool',core.artifacts.Pool,[provider.address],{ADDRESSES_PROVIDER:provider.address});
  await send(provider,'setPoolImpl',[poolImplementation.address]);
  async function proxy(name, implementation, admin, address) {
    const a = core.artifacts.InitializableImmutableAdminUpgradeabilityProxy;
    const code = expectedAaveRuntimeCodeV1(a,core.sourceASTs,libraries,{_admin:admin});
    assert.equal(await runtime.code(address),code,'AAVE_EXACT_PROXY_RUNTIME');
    assert.equal(await runtime.proxyImplementation1967(address),implementation.address,'AAVE_EIP1967_IMPLEMENTATION');
    const record = Object.freeze({name,address,code,implementation:implementation.address,iface:implementation.iface}); proxies.push(record); return record;
  }
  const pool = await proxy('PoolProxy',poolImplementation,provider.address,(await read(provider,'getPool'))[0].toLowerCase());
  assert.equal((await read(pool,'ADDRESSES_PROVIDER'))[0].toLowerCase(),provider.address);
  const configuratorImplementation = await deploy('PoolConfigurator',core.artifacts.PoolConfigurator,[],{});
  await send(provider,'setPoolConfiguratorImpl',[configuratorImplementation.address]);
  const configurator = await proxy('PoolConfiguratorProxy',configuratorImplementation,provider.address,(await read(provider,'getPoolConfigurator'))[0].toLowerCase());
  const tokenValues = {POOL:pool.address,_addressesProvider:provider.address,_chainId:31337n};
  const aTokenImplementation = await deploy('AToken',core.artifacts.AToken,[pool.address],tokenValues);
  const stableImplementation = await deploy('StableDebtToken',core.artifacts.StableDebtToken,[pool.address],tokenValues);
  const variableImplementation = await deploy('VariableDebtToken',core.artifacts.VariableDebtToken,[pool.address],tokenValues);
  const optimal = RAY * 8n / 10n, optimalStable = RAY / 5n;
  const rateValues = {ADDRESSES_PROVIDER:provider.address,OPTIMAL_USAGE_RATIO:optimal,MAX_EXCESS_USAGE_RATIO:RAY-optimal,
    OPTIMAL_STABLE_TO_TOTAL_DEBT_RATIO:optimalStable,MAX_EXCESS_STABLE_TO_TOTAL_DEBT_RATIO:RAY-optimalStable,
    _baseVariableBorrowRate:RAY*3n/100n,_variableRateSlope1:RAY*4n/100n,_variableRateSlope2:RAY*48n/100n,
    _stableRateSlope1:RAY*4n/100n,_stableRateSlope2:RAY*75n/100n,_baseStableRateOffset:RAY*2n/100n,_stableRateExcessOffset:RAY*8n/100n};
  const strategy = await deploy('DefaultReserveInterestRateStrategy',core.artifacts.DefaultReserveInterestRateStrategy,
    [provider.address,optimal,rateValues._baseVariableBorrowRate,rateValues._variableRateSlope1,rateValues._variableRateSlope2,
      rateValues._stableRateSlope1,rateValues._stableRateSlope2,rateValues._baseStableRateOffset,rateValues._stableRateExcessOffset,optimalStable],rateValues);
  await send(configurator,'initReserves',[[[aTokenImplementation.address,stableImplementation.address,variableImplementation.address,
    Number(decimals),strategy.address,first.address,sender,zero,'Local Aave interest token','LAAVE','Local variable debt','LVD','Local stable debt','LSD','0x']]]);
  const reserve = (await read(pool,'getReserveData',[first.address]))[0];
  const aToken = await proxy('ATokenProxy',aTokenImplementation,configurator.address,reserve.aTokenAddress.toLowerCase());
  const stableDebt = await proxy('StableDebtTokenProxy',stableImplementation,configurator.address,reserve.stableDebtTokenAddress.toLowerCase());
  const variableDebt = await proxy('VariableDebtTokenProxy',variableImplementation,configurator.address,reserve.variableDebtTokenAddress.toLowerCase());
  assert.equal((await read(aToken,'UNDERLYING_ASSET_ADDRESS'))[0].toLowerCase(),first.address);
  assert.equal((await read(aToken,'POOL'))[0].toLowerCase(),pool.address);
  await send(configurator,'setReserveFlashLoaning',[first.address,true]);
  await send(configurator,'updateFlashloanPremiumTotal',[9]); await send(configurator,'updateFlashloanPremiumToProtocol',[0]);
  assert.equal((await read(pool,'FLASHLOAN_PREMIUM_TOTAL'))[0],9n); assert.equal((await read(pool,'FLASHLOAN_PREMIUM_TO_PROTOCOL'))[0],0n);
  // Public protocol liquidity only, independent from the private source note.
  await send(first,'approve',[pool.address,1_000_000_000n]);
  await send(pool,'supply',[first.address,1_000_000_000n,sender,0]); await send(first,'approve',[pool.address,0]);
  const vaultImplementation = await deploy('StaticATokenLMImplementation',build.artifacts.StaticATokenLM,
    [pool.address,zero],{POOL:pool.address,INCENTIVES_CONTROLLER:zero},build.sourceASTs);
  // The official implementation disables initializers in its own storage.
  // Initialize proxy storage atomically in the original direct CREATE so the
  // pool asset can authenticate metadata at that exact creation block.
  const initializeData = vaultImplementation.iface.encodeFunctionData('initialize',
    [aToken.address,'Local Aave static token','LSTATA']);
  const vaultProxy = await deploy('StaticATokenLMProxy',core.artifacts.AdminUpgradeabilityProxy,
    [vaultImplementation.address,provider.address,initializeData],{});
  const vault = Object.freeze({...vaultProxy,iface:vaultImplementation.iface,
    implementation:vaultImplementation.address,admin:provider.address});
  assert.notEqual(vault.admin,sender,'AAVE_STATIC_PROXY_ADMIN_NOT_CALLER');
  assert.equal(await runtime.proxyImplementation1967(vault.address,vault.receipt.blockNumber),vault.implementation,'AAVE_STATIC_PROXY_IMPLEMENTATION');
  assert.equal(await runtime.proxyAdmin1967(vault.address,vault.receipt.blockNumber),vault.admin,'AAVE_STATIC_PROXY_ADMIN');
  proxies.push(vault);
  assert.equal((await read(vault,'asset'))[0].toLowerCase(),first.address); assert.equal((await read(vault,'aToken'))[0].toLowerCase(),aToken.address);
  assert.equal((await read(vault,'rate'))[0],RAY); assert.equal((await read(vault,'totalSupply'))[0],0n);
  const yieldReceiver = await deploy('LocalAaveFlashYield',build.artifacts.LocalAaveFlashYield,[pool.address,first.address],
    {pool:pool.address,asset:first.address,sender},build.sourceASTs);
  await send(first,'transfer',[yieldReceiver.address,90_000n]);
  return officialAaveFacadeV1(runtime,build,{first,vault,pool,provider,configurator,aToken,stableDebt,variableDebt,strategy,yieldReceiver,deployments,proxies});

}

async function officialAaveFacadeV1(runtime,build,actors,exitOnly=false){
 const {first,vault,pool,provider,configurator,aToken,stableDebt,variableDebt,strategy,yieldReceiver,deployments,proxies}=actors;
 const sender=runtime.accounts[0];
 async function read(contract,method,args=[],tag='latest'){return contract.iface.decodeFunctionResult(method,await runtime.call({from:sender,to:contract.address,data:contract.iface.encodeFunctionData(method,args)},tag));}
 async function send(contract,method,args=[]){assert.equal(exitOnly,false,'AAVE_EXIT_RECOVERY_NO_PROTOCOL_WRITE');const receipt=await runtime.send('aave-official-'+contract.name+'-'+method,{from:sender,to:contract.address,data:contract.iface.encodeFunctionData(method,args)});await runtime.assertCanonical(receipt);return receipt;}
  let fixture;
  async function assertCurrent(tag = 'latest') {
    assertOfficialAaveFixtureV1(runtime,fixture); await assertOwnedLocalEvmV2(runtime); const head = await runtime.block(tag);
    for (const row of [...deployments,...proxies]) assert.equal(await runtime.code(row.address,head.number),row.code,'AAVE_OFFICIAL_CODE_CHANGED');
    for (const row of proxies) assert.equal(await runtime.proxyImplementation1967(row.address,head.number),row.implementation,'AAVE_PROXY_IMPLEMENTATION_CHANGED');
    assert.equal(await runtime.proxyAdmin1967(vault.address,head.number),vault.admin,'AAVE_STATIC_PROXY_ADMIN_CHANGED');
    const current = (await read(pool,'getReserveData',[first.address],head.number))[0];
    assert.equal(current.aTokenAddress.toLowerCase(),aToken.address); assert.equal(current.stableDebtTokenAddress.toLowerCase(),stableDebt.address);
    assert.equal(current.variableDebtTokenAddress.toLowerCase(),variableDebt.address); assert.equal(current.interestRateStrategyAddress.toLowerCase(),strategy.address);
    const config = current.configuration.data; assert.equal((config >> 56n)&1n,1n); assert.equal((config >> 57n)&1n,0n);
    assert.equal((config >> 60n)&1n,0n); assert.equal((config >> 63n)&1n,1n); // active/unfrozen/unpaused/flash enabled
    assert.equal((await read(pool,'FLASHLOAN_PREMIUM_TOTAL',[],head.number))[0],9n);
    assert.equal((await read(pool,'FLASHLOAN_PREMIUM_TO_PROTOCOL',[],head.number))[0],0n);
    await runtime.assertCanonical(head); return head;
  }
  async function accrueYield() {
    const head = await assertCurrent();
    const indexBefore = (await read(pool,'getReserveNormalizedIncome',[first.address],head.number))[0];
    const scaledBefore = (await read(aToken,'scaledBalanceOf',[vault.address],head.number))[0];
    const sharesBefore = (await read(vault,'totalSupply',[],head.number))[0];
    assert.ok(sharesBefore > 0n,'AAVE_YIELD_AFTER_GENUINE_PRIVATE_DELIVERY');
    const receipt = await send(yieldReceiver,'accrue'); const after = await assertCurrent(receipt.blockNumber);
    const indexAfter = (await read(pool,'getReserveNormalizedIncome',[first.address],after.number))[0];
    assert.ok(indexAfter > indexBefore,'AAVE_REAL_YIELD_INDEX_DRIFT');
    assert.equal((await read(aToken,'scaledBalanceOf',[vault.address],after.number))[0],scaledBefore);
    assert.equal((await read(vault,'totalSupply',[],after.number))[0],sharesBefore);
    return Object.freeze({protocol:'AAVE_V3_FLASH_PREMIUM_YIELD',transactionHash:receipt.transactionHash,blockHash:receipt.blockHash,
      indexBefore:indexBefore.toString(),indexAfter:indexAfter.toString(),staticShares:sharesBefore.toString(),
      publicPremium:'90000',privateBalanceCredited:false,borrowAPYEstablished:false});
  }
  fixture = Object.freeze({runtime,first,vault,pool,provider,configurator,aToken,stableDebt,variableDebt,strategy,yieldReceiver,
    deployments:Object.freeze(deployments),proxies:Object.freeze(proxies),read,send,assertCurrent,accrueYield,
    compilation:Object.freeze({classification:'NEW_COMPILATION_NOT_PRIVATE_ACCEPTANCE',compiler:build.compiler,settings:build.settings,
      inputSHA256:build.inputSHA256,sourceRecords:build.sourceRecords,outputSHA256:sha(JSON.stringify({artifacts:build.artifacts,sourceASTs:build.sourceASTs}))})});
  owned.set(fixture,{runtime,build}); await assertCurrent(); return fixture;
}

function aaveRecoveryArtifactsV1(core,build){
 return {underlying:loadBackedAssetDeploymentArtifacts().artifacts.token,...core.artifacts,
 StaticATokenLMImplementation:build.artifacts.StaticATokenLM,StaticATokenLMProxy:core.artifacts.AdminUpgradeabilityProxy,LocalAaveFlashYield:build.artifacts.LocalAaveFlashYield};
}
function assertRetainedAaveBuildV1(build){
 assertOfficialAaveSourceReviewV1();assert.equal(build.compiler,GENERIC_COMPILER_PIN.version);assert.deepEqual(build.compilerPin,GENERIC_COMPILER_PIN);const sources=loadOfficialAaveWrapperSourcesV1();
 for(const name of ['BoundedMetaMorphoExit.sol','BoundedAaveStaticExit.sol','LocalAaveFlashYield.sol','PrivateAaveStaticDelivery.sol'])sources['contracts/defi/'+name]={content:readFileSync(join(ROOT,'contracts/defi',name),'utf8')};
 const settings={optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode'],'':['ast']}}};
 assert.deepEqual(build.settings,settings);assert.equal(sha(JSON.stringify({language:'Solidity',sources,settings})),build.inputSHA256);assert.equal(build.inputSHA256,OFFICIAL_AAVE_DEVELOPMENT_SOURCE_REVIEW_V1.compilationInputSHA256);
 assert.equal(sha(JSON.stringify({artifacts:build.artifacts,sourceASTs:build.sourceASTs})),OFFICIAL_AAVE_DEVELOPMENT_SOURCE_REVIEW_V1.compilationOutputSHA256);
 assert.deepEqual(build.sourceRecords,Object.entries(sources).sort(([a],[b])=>a.localeCompare(b)).map(([path,row])=>({path,bytes:Buffer.byteLength(row.content),sha256:sha(row.content)})));
}
export async function captureOfficialAaveFixtureRecoveryV1(runtime,fixture){
 assert.equal(arguments.length,2);assertOfficialAaveFixtureV1(runtime,fixture);const head=await fixture.assertCurrent(),build=owned.get(fixture).build;assertRetainedAaveBuildV1(build);
 const core=loadOfficialAaveCoreArtifactsV1(),artifacts=aaveRecoveryArtifactsV1(core,build);
 const records=fixture.deployments.map(row=>({name:row.name,address:row.address,code:row.code,receipt:structuredClone(row.receipt),creationSHA256:row.creationSHA256,artifactSHA256:sha(JSON.stringify(artifacts[row.name]))}));
 const proxies=fixture.proxies.map(row=>({name:row.name,address:row.address,code:row.code,implementation:row.implementation,...(row.admin?{admin:row.admin}:{}),...(row.receipt?{receipt:structuredClone(row.receipt),creationSHA256:row.creationSHA256}:{})}));
 const actors=Object.fromEntries(['first','vault','pool','provider','configurator','aToken','stableDebt','variableDebt','strategy','yieldReceiver'].map(name=>[name,fixture[name].address]));
 await runtime.assertCanonical(head);assert.deepEqual(await runtime.block(),head);
 return {schema:'ORIGINAL_OFFICIAL_AAVE_FIXTURE_V1',genesis:runtime.metadata.evmGenesis,head:structuredClone(head),buildFrame:aaveBuildFrameV1(build),records,proxies,actors};
}
export async function reopenOfficialAaveFixtureRecoveryV1(token){
 assert.equal(arguments.length,1);const {consumeExternalDefiProtocolFixtureReopenV1}=await import('../../../../../src/accounts/recovery/external-defi-catalogue-recovery-v1.mjs');const {runtime,record:r}=consumeExternalDefiProtocolFixtureReopenV1(token);
 exactRecord(r,['schema','genesis','head','buildFrame','records','proxies','actors']);assert.equal(r.schema,'ORIGINAL_OFFICIAL_AAVE_FIXTURE_V1');assert.equal(r.genesis,runtime.metadata.evmGenesis);await assertOwnedLocalEvmV2(runtime);assert.deepEqual(await runtime.block(),r.head);const retainedBuild=aaveBuildFromFrameV1(r.buildFrame);assertRetainedAaveBuildV1(retainedBuild);
 const pinsRaw=readFileSync(join(ROOT,'wallet-platform/artifacts/private-external-v1/protocol-fixture-artifact-pins.json'));assert.equal(sha(pinsRaw),'9913e72be559a10c7340ba291f88b067eab2dd3a0c290052c4c024db14bff2e8');
 for(const row of JSON.parse(pinsRaw).files.filter(row=>row.path.startsWith('abi-tools/')))assert.equal(sha(readFileSync(join(ROOT,'wallet-platform/artifacts/private-external-v1',row.path))),row.sha256);
 const {Interface}=createRequire(join(ROOT,'wallet-platform/artifacts/private-external-v1/abi-tools/package.json'))('ethers'),core=loadOfficialAaveCoreArtifactsV1(),artifacts=aaveRecoveryArtifactsV1(core,retainedBuild),deployments=[],byAddress=new Map(),libraries={};
 const libraryNames=new Set(Object.values(core.artifacts).flatMap(artifact=>Object.values(artifact.evm.bytecode.linkReferences).flatMap(refs=>Object.keys(refs))));
 for(const row of r.records){assert.ok(artifacts[row.name]&&!byAddress.has(row.address),'AAVE_ORIGINAL_DEPLOYMENT_REQUIRED');const artifact=artifacts[row.name];assert.equal(sha(JSON.stringify(artifact)),row.artifactSHA256);const originals=runtime.transactions.filter(tx=>tx.transactionHash===row.receipt.transactionHash);assert.equal(originals.length,1);const tx=originals[0];assert.equal(tx.label,'aave-official-deploy-'+row.name);assert.equal(tx.phase,'mined');assert.equal(tx.request.from,runtime.accounts[0]);assert.ok(tx.request.data.startsWith(linkAaveCreationCodeV1(artifact,libraries)));assert.equal(sha(Buffer.from(tx.request.data.slice(2),'hex')),row.creationSHA256);assert.deepEqual(tx.receipt,row.receipt);assert.equal(row.receipt.status,'0x1');assert.equal(row.receipt.contractAddress.toLowerCase(),row.address);await runtime.checkReceipt(row.receipt);await runtime.assertCanonical(row.receipt);assert.equal(await runtime.code(row.address,r.head.number),row.code);const record=Object.freeze({...structuredClone(row),iface:new Interface(artifact.abi)});deployments.push(record);byAddress.set(record.address,record);if(libraryNames.has(row.name))libraries[row.name]=row.address;}
 const proxies=[];
 for(const row of r.proxies){const implementation=byAddress.get(row.implementation);assert.ok(implementation,'AAVE_ORIGINAL_PROXY_IMPLEMENTATION');assert.equal(await runtime.code(row.address,r.head.number),row.code);assert.equal(await runtime.proxyImplementation1967(row.address,r.head.number),row.implementation);if(row.admin){assert.equal(await runtime.proxyAdmin1967(row.address,r.head.number),row.admin);assert.equal(row.admin,r.actors.provider);assert.notEqual(row.admin,runtime.accounts[0]);}const original=byAddress.get(row.address);if(original){assert.equal(original.code,row.code);assert.deepEqual(original.receipt,row.receipt);}const proxy=Object.freeze({...structuredClone(row),iface:implementation.iface});proxies.push(proxy);byAddress.set(proxy.address,proxy);}
 const actors={deployments,proxies};exactRecord(r.actors,['first','vault','pool','provider','configurator','aToken','stableDebt','variableDebt','strategy','yieldReceiver']);for(const [name,address]of Object.entries(r.actors)){assert.ok(byAddress.has(address));actors[name]=byAddress.get(address);}
 const fixture=await officialAaveFacadeV1(runtime,retainedBuild,actors,true);await runtime.assertCanonical(r.head);assert.deepEqual(await runtime.block(),r.head);return fixture;
}

function aaveBuildFrameV1(build){const bytes=Buffer.from(JSON.stringify(build));assert.ok(bytes.length<=16*1024*1024);return {profile:'ORIGINAL_AAVE_BUILD_JSON_FRAME_V1',bytes:bytes.length,sha256:sha(bytes),chunks:Array.from({length:Math.ceil(bytes.length/65536)},(_,i)=>bytes.subarray(i*65536,(i+1)*65536).toString('base64'))};}
function aaveBuildFromFrameV1(frame){exactRecord(frame,['profile','bytes','sha256','chunks']);assert.equal(frame.profile,'ORIGINAL_AAVE_BUILD_JSON_FRAME_V1');assert.ok(Number.isSafeInteger(frame.bytes)&&frame.bytes>0&&frame.bytes<=16*1024*1024);assert.ok(Array.isArray(frame.chunks)&&frame.chunks.length===Math.ceil(frame.bytes/65536));const bytes=Buffer.concat(frame.chunks.map((text,i)=>{assert.equal(typeof text,'string');const part=Buffer.from(text,'base64');assert.equal(part.toString('base64'),text);assert.equal(part.length,i+1===frame.chunks.length?frame.bytes-i*65536:65536);return part;}));assert.equal(bytes.length,frame.bytes);assert.equal(sha(bytes),frame.sha256);const json=bytes.toString('utf8');assert.ok(Buffer.from(json).equals(bytes));const build=JSON.parse(json);assert.equal(JSON.stringify(build),json);return build;}
