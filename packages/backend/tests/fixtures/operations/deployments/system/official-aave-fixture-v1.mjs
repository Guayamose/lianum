/** Fresh local official Aave V3 + StaticATokenLM. Every backing unit is held in
 * the genuine Pool/aToken, with a real paid flash-loan premium for yield. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../../../../../proofs/src/catalog.mjs';
import { assertOwnedLocalEvmV2 } from '../../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { loadBackedAssetDeploymentArtifacts } from '../../../../../src/operations/deployments/defi/deploy-backed-assets.mjs';
import { loadOfficialAaveCoreArtifactsV1 } from '../../../../../src/operations/deployments/defi/aave-v3-official-material-v1.mjs';
import { compileAaveDevelopmentContractsV1 } from '../../../../../src/operations/deployments/defi/aave-v3-development-compilation-v1.mjs';
import { linkAaveCreationCodeV1, expectedAaveRuntimeCodeV1 } from '../../../../../src/operations/deployments/defi/aave-v3-runtime-code-v1.mjs';
const owned = new WeakMap(), sha = value => createHash('sha256').update(value).digest('hex');
const zero = '0x' + '0'.repeat(40), RAY = 10n ** 27n;
// New source review. This is intentionally separate from protocol/native/private acceptance.
export const OFFICIAL_AAVE_DEVELOPMENT_SOURCE_REVIEW_V1 = null;
export function assertOfficialAaveSourceReviewV1() {
  assert.equal(arguments.length,0);const value=OFFICIAL_AAVE_DEVELOPMENT_SOURCE_REVIEW_V1;
  assert.ok(value!==null,'AAVE_DEVELOPMENT_SOURCE_REVIEW_REQUIRED');
  assert.deepEqual(value,{profile:'OFFICIAL_AAVE_STATIC_V1',coreVersion:'1.19.3',
    wrapperCommit:'101f5d977889254ca2d2711b9582b45f832d10a0',compilation:'NEW_REVIEWED',
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
  const vault = await deploy('StaticATokenLM',build.artifacts.StaticATokenLM,[pool.address,zero],{POOL:pool.address,INCENTIVES_CONTROLLER:zero},build.sourceASTs);
  await send(vault,'initialize',[aToken.address,'Local Aave static token','LSTATA']);
  assert.equal((await read(vault,'asset'))[0].toLowerCase(),first.address); assert.equal((await read(vault,'aToken'))[0].toLowerCase(),aToken.address);
  assert.equal((await read(vault,'rate'))[0],RAY); assert.equal((await read(vault,'totalSupply'))[0],0n);
  const yieldReceiver = await deploy('LocalAaveFlashYield',build.artifacts.LocalAaveFlashYield,[pool.address,first.address],
    {pool:pool.address,asset:first.address,sender},build.sourceASTs);
  await send(first,'transfer',[yieldReceiver.address,90_000n]);
  let fixture;
  async function assertCurrent(tag = 'latest') {
    assertOfficialAaveFixtureV1(runtime,fixture); await assertOwnedLocalEvmV2(runtime); const head = await runtime.block(tag);
    for (const row of [...deployments,...proxies]) assert.equal(await runtime.code(row.address,head.number),row.code,'AAVE_OFFICIAL_CODE_CHANGED');
    for (const row of proxies) assert.equal(await runtime.proxyImplementation1967(row.address,head.number),row.implementation,'AAVE_PROXY_IMPLEMENTATION_CHANGED');
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
