/** Trusted local acceptance bootstrap. Real official protocols, fake tokens.
 * Importing does not start a node, compile, prove or send a transaction. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertOwnedLocalEvmV2} from '../chain-adapters/owned-evm-v2-runtime.mjs';
import {loadBackedAssetDeploymentArtifacts} from './deploy-backed-assets.mjs';
const D=join(dirname(fileURLToPath(import.meta.url)),'../../artifacts/private-external-v1'),require=createRequire(join(D,'abi-tools/package.json'));
let Interface,AbiCoder,keccak256;
const zero='0x'+'0'.repeat(40),sha=b=>createHash('sha256').update(b).digest('hex');
const owned=new WeakMap();
export function assertOfficialProtocolFixture(runtime,fixture){assert.equal(owned.get(fixture),runtime,'ORIGINAL_PROTOCOL_FIXTURE_REQUIRED');}
function artifact(path,source,name){const output=JSON.parse(readFileSync(path));return source?output.contracts[source][name]:output;}
function creation(a){const b=a.bytecode??a.evm?.bytecode?.object;assert.ok(typeof b==='string');const raw=b.startsWith('0x')?b.slice(2):b;assert.ok(/^[0-9a-f]+$/.test(raw)&&raw.length%2===0,'FIXED_CREATION_HEX');return'0x'+raw;}
export async function createOfficialProtocolFixture(runtime){
 assert.equal(arguments.length,1);await assertOwnedLocalEvmV2(runtime);assert.equal(runtime.metadata.chainId,'31337');
 const pinsRaw=readFileSync(join(D,'protocol-fixture-artifact-pins.json'));assert.equal(sha(pinsRaw),'9913e72be559a10c7340ba291f88b067eab2dd3a0c290052c4c024db14bff2e8','FIXED_PROTOCOL_ARTIFACT_MANIFEST');const pins=JSON.parse(pinsRaw);
 for(const row of pins.files)assert.equal(sha(readFileSync(join(D,row.path))),row.sha256,'PROTOCOL_FIXTURE_ARTIFACT_PIN');
 ({Interface,AbiCoder,keccak256}=require('ethers'));
 const sender=runtime.accounts[0],deployments=[];
 async function deploy(name,a,args){
  const iface=new Interface(a.abi),data=creation(a)+iface.encodeDeploy(args).slice(2);
  const receipt=await runtime.send('official-deploy-'+name,{from:sender,data});await runtime.assertCanonical(receipt);
  const address=receipt.contractAddress.toLowerCase(),code=await runtime.code(address,receipt.blockNumber);
  assert.ok(/^0x[0-9a-f]+$/.test(code)&&code.length>2&&((code.length-2)/2)<=24576,'ACTUAL_DEPLOYED_CODE');
  const record=Object.freeze({name,address,iface,receipt:Object.freeze({...receipt}),code,creationSHA256:sha(Buffer.from(data.slice(2),'hex'))});deployments.push(record);return record;
 }
 async function read(contract,method,args=[]){const raw=await runtime.call({from:sender,to:contract.address,data:contract.iface.encodeFunctionData(method,args)});return contract.iface.decodeFunctionResult(method,raw);}
 async function send(contract,method,args=[]){const receipt=await runtime.send('official-'+contract.name+'-'+method,{from:sender,to:contract.address,data:contract.iface.encodeFunctionData(method,args)});await runtime.assertCanonical(receipt);return receipt;}
 const tokenArtifact=loadBackedAssetDeploymentArtifacts().artifacts.token;
 const first=await deploy('input-token',tokenArtifact,[10n**15n]),second=await deploy('output-token',tokenArtifact,[10n**15n]);
 const [token0,token1]=BigInt(first.address)<BigInt(second.address)?[first,second]:[second,first];
 const core=join(D,'official-protocols/uniswap-v3-core-1.0.1/package/artifacts/contracts');
 const periphery=join(D,'official-protocols/uniswap-v3-periphery-1.4.4/package/artifacts/contracts');
 const factory=await deploy('uniswap-factory',artifact(join(core,'UniswapV3Factory.sol/UniswapV3Factory.json')),[]);
 const swapRouter=await deploy('uniswap-router',artifact(join(periphery,'SwapRouter.sol/SwapRouter.json')),[factory.address,zero]);
 const positionManager=await deploy('uniswap-position-manager',artifact(join(periphery,'NonfungiblePositionManager.sol/NonfungiblePositionManager.json')),[factory.address,zero,zero]);
 assert.equal((await read(swapRouter,'factory'))[0].toLowerCase(),factory.address);
 await send(factory,'createPool',[token0.address,token1.address,3000]);
 const poolAddress=(await read(factory,'getPool',[token0.address,token1.address,3000]))[0].toLowerCase();assert.notEqual(poolAddress,zero);
 const pool=Object.freeze({name:'uniswap-pool',address:poolAddress,iface:new Interface(artifact(join(core,'UniswapV3Pool.sol/UniswapV3Pool.json')).abi)});
 await send(pool,'initialize',[1n<<96n]);
 for(const t of [token0,token1])await send(t,'approve',[positionManager.address,10n**9n]);
 await send(positionManager,'mint',[[token0.address,token1.address,3000,-887220,887220,10n**9n,10n**9n,0,0,sender,(await runtime.time())+3600n]]);
 for(const t of [token0,token1])await send(t,'approve',[positionManager.address,0]);
 assert.ok((await read(pool,'liquidity'))[0]>0n,'REAL_UNISWAP_LIQUIDITY');
 const blue=await deploy('morpho-blue',artifact(join(D,'official-compilation-v2/Morpho.json'),'lib/morpho-blue/src/Morpho.sol','Morpho'),[sender]);
 await send(blue,'enableIrm',[zero]);await send(blue,'enableLltv',[0]);
 const market=[first.address,zero,zero,zero,0];await send(blue,'createMarket',[market]);
 const marketId=keccak256(AbiCoder.defaultAbiCoder().encode(['address','address','address','address','uint256'],market));
 const vault=await deploy('metamorpho',artifact(join(D,'official-compilation-v2/MetaMorpho.json'),'src/MetaMorpho.sol','MetaMorpho'),[sender,blue.address,86400,first.address,'Local MetaMorpho','LMOR']);
 assert.equal((await read(vault,'MORPHO'))[0].toLowerCase(),blue.address);assert.equal((await read(vault,'asset'))[0].toLowerCase(),first.address);
 await send(vault,'submitCap',[market,10n**12n]);
 const pending=await read(vault,'pendingCap',[marketId]);await runtime.advanceTo(BigInt(pending[1]));
 await send(vault,'acceptCap',[market]);await send(vault,'setSupplyQueue',[[marketId]]);
 assert.ok((await read(vault,'maxDeposit',[sender]))[0]>0n,'REAL_METAMORPHO_CAPACITY');
 const fixture=Object.freeze({runtime,first,second,swapRouter,pool,vault,blue,marketId,deployments:Object.freeze(deployments),read,send});owned.set(fixture,runtime);return fixture;
}

function recoveryArtifactsV1(){
 const core=join(D,'official-protocols/uniswap-v3-core-1.0.1/package/artifacts/contracts'),periphery=join(D,'official-protocols/uniswap-v3-periphery-1.4.4/package/artifacts/contracts');
 const token=loadBackedAssetDeploymentArtifacts().artifacts.token;
 return {'input-token':token,'output-token':token,
 'uniswap-factory':artifact(join(core,'UniswapV3Factory.sol/UniswapV3Factory.json')),
 'uniswap-router':artifact(join(periphery,'SwapRouter.sol/SwapRouter.json')),
 'uniswap-position-manager':artifact(join(periphery,'NonfungiblePositionManager.sol/NonfungiblePositionManager.json')),
 'morpho-blue':artifact(join(D,'official-compilation-v2/Morpho.json'),'lib/morpho-blue/src/Morpho.sol','Morpho'),
 'metamorpho':artifact(join(D,'official-compilation-v2/MetaMorpho.json'),'src/MetaMorpho.sol','MetaMorpho')};
}
export async function captureOfficialProtocolFixtureRecoveryV1(runtime,fixture){
 assert.equal(arguments.length,2);assertOfficialProtocolFixture(runtime,fixture);await assertOwnedLocalEvmV2(runtime);
 const head=await runtime.block(),artifacts=recoveryArtifactsV1();assert.equal(fixture.deployments.length,7);
 const records=fixture.deployments.map(record=>({name:record.name,address:record.address,receipt:structuredClone(record.receipt),code:record.code,creationSHA256:record.creationSHA256,artifactSHA256:sha(Buffer.from(JSON.stringify(artifacts[record.name])))}));
 assert.deepEqual(records.map(r=>r.name),Object.keys(artifacts));
 const reads=[];
 for(const [target,method,args]of [[fixture.swapRouter,'factory',[]],[fixture.vault,'asset',[]],[fixture.vault,'MORPHO',[]],[fixture.vault,'owner',[]],
  [fixture.vault,'totalAssets',[]],[fixture.vault,'totalSupply',[]],[fixture.pool,'fee',[]],[fixture.pool,'factory',[]],[fixture.pool,'token0',[]],[fixture.pool,'token1',[]],[fixture.pool,'liquidity',[]]]){
  const calldata=target.iface.encodeFunctionData(method,args);reads.push({address:target.address,calldata,result:await runtime.call({to:target.address,data:calldata},head.number)});
 }
 const poolCode=await runtime.code(fixture.pool.address,head.number);await runtime.assertCanonical(head);assert.deepEqual(await runtime.block(),head);
 return {schema:'ORIGINAL_OFFICIAL_PROTOCOL_FIXTURE_V1',genesis:runtime.metadata.evmGenesis,head:structuredClone(head),records,pool:{address:fixture.pool.address,code:poolCode},marketId:fixture.marketId,reads};
}
export async function reopenOfficialProtocolFixtureRecoveryV1(token){
 assert.equal(arguments.length,1);const {consumeExternalDefiBootstrapPartV1}=await import('./external-defi-bootstrap-recovery-v1.mjs');
 const {runtime,record:r}=consumeExternalDefiBootstrapPartV1(token,'protocols');await assertOwnedLocalEvmV2(runtime);
 assert.equal(r.schema,'ORIGINAL_OFFICIAL_PROTOCOL_FIXTURE_V1');assert.equal(r.genesis,runtime.metadata.evmGenesis);assert.deepEqual(await runtime.block(),r.head);
 const pinsRaw=readFileSync(join(D,'protocol-fixture-artifact-pins.json'));
 assert.equal(sha(pinsRaw),'9913e72be559a10c7340ba291f88b067eab2dd3a0c290052c4c024db14bff2e8','FIXED_PROTOCOL_ARTIFACT_MANIFEST');
 // Same fixed resource manifest as the original constructor.
 const sourcePins=JSON.parse(pinsRaw);for(const row of sourcePins.files)assert.equal(sha(readFileSync(join(D,row.path))),row.sha256);
 ({Interface,AbiCoder,keccak256}=require('ethers'));const artifacts=recoveryArtifactsV1();assert.deepEqual(r.records.map(x=>x.name),Object.keys(artifacts));
 const deployments=[];
 for(const packed of r.records){
  const a=artifacts[packed.name];assert.equal(sha(Buffer.from(JSON.stringify(a))),packed.artifactSHA256);
  const original=runtime.transactions.filter(t=>t.transactionHash===packed.receipt.transactionHash);assert.equal(original.length,1);const tx=original[0];
  assert.equal(tx.label,'official-deploy-'+packed.name);assert.equal(tx.phase,'mined');assert.equal(tx.request.from,runtime.accounts[0]);assert.ok(tx.request.data.startsWith(creation(a)));
  assert.equal(sha(Buffer.from(tx.request.data.slice(2),'hex')),packed.creationSHA256);assert.deepEqual(tx.receipt,packed.receipt);assert.equal(packed.receipt.status,'0x1');assert.equal(packed.receipt.contractAddress.toLowerCase(),packed.address);
  await runtime.checkReceipt(packed.receipt);await runtime.assertCanonical(packed.receipt);assert.equal(await runtime.code(packed.address,r.head.number),packed.code);
  deployments.push(Object.freeze({name:packed.name,address:packed.address,iface:new Interface(a.abi),receipt:Object.freeze(structuredClone(packed.receipt)),code:packed.code,creationSHA256:packed.creationSHA256}));
 }
 const named=Object.fromEntries(deployments.map(x=>[x.name,x]));
 const poolArtifact=artifact(join(D,'official-protocols/uniswap-v3-core-1.0.1/package/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'));
 const pool=Object.freeze({name:'uniswap-pool',address:r.pool.address,iface:new Interface(poolArtifact.abi)});
 assert.equal(await runtime.code(pool.address,r.head.number),r.pool.code);
 for(const read of r.reads)assert.equal(await runtime.call({to:read.address,data:read.calldata},r.head.number),read.result,'ORIGINAL_PROTOCOL_CONFIG_STATE');
 const sender=runtime.accounts[0];
 const read=async(contract,method,args=[])=>contract.iface.decodeFunctionResult(method,await runtime.call({from:sender,to:contract.address,data:contract.iface.encodeFunctionData(method,args)}));
 const send=async(contract,method,args=[])=>{const receipt=await runtime.send('official-'+contract.name+'-'+method,{from:sender,to:contract.address,data:contract.iface.encodeFunctionData(method,args)});await runtime.assertCanonical(receipt);return receipt;};
 const fixture=Object.freeze({runtime,first:named['input-token'],second:named['output-token'],swapRouter:named['uniswap-router'],pool,vault:named.metamorpho,blue:named['morpho-blue'],marketId:r.marketId,deployments:Object.freeze(deployments),read,send});
 await runtime.assertCanonical(r.head);assert.deepEqual(await runtime.block(),r.head);owned.set(fixture,runtime);return fixture;
}
