/** Trusted local bootstrap for exact official-protocol private-delivery routers.
 * No caller-provided artifacts, target addresses, signing keys or read callbacks.
 * Intended canonical module: wallet-platform/modules/ops/deploy-private-external-router-v1.mjs. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertOfficialProtocolFixture} from '../../../../tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import {assertOwnedLocalEvmV2} from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {assertOwnedFlatSystem} from '../system/deploy-system.mjs';
import {assertOwnedPoolAsset} from '../../../chains/shared/contracts/owned-pool-asset.mjs';
import {exactRecord} from '../../../execution/encoding/commitments.mjs';
const D=join(dirname(fileURLToPath(import.meta.url)),'../../artifacts/private-external-v1'),owned=new WeakMap();
const sha=b=>createHash('sha256').update(b).digest('hex');
const bare=x=>{assert.ok(/^0x[0-9a-f]+$/.test(x));return x.slice(2);};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const metadataSHA256='443ef522cabc6c8d286e772b747fa676749a960397abf93cd5e3f26235685b8a';
function metadata(){const raw=readFileSync(join(D,'metadata-output.json'));assert.equal(sha(raw),metadataSHA256);return JSON.parse(raw);}
function expectedRuntime(output,name,values){
 const artifact=output.contracts['PrivateExternalDelivery.sol'][name],nodes=output.sources['PrivateExternalDelivery.sol'].ast.nodes;
 const names=Object.fromEntries(nodes.filter(x=>x.nodeType==='ContractDefinition').flatMap(x=>x.nodes)
  .filter(x=>x.nodeType==='VariableDeclaration'&&x.mutability==='immutable').map(x=>[String(x.id),x.name]));
 const code=Buffer.from(artifact.evm.deployedBytecode.object,'hex'),used=new Set(),ranges=[];
 for(const [id,positions]of Object.entries(artifact.evm.deployedBytecode.immutableReferences)){
  const label=names[id];assert.ok(Object.hasOwn(values,label),'KNOWN_IMMUTABLE');used.add(label);
  const value=values[label];assert.ok(/^[0-9a-f]{64}$/.test(value));
  for(const r of positions){assert.equal(r.length,32);assert.ok(r.start>=0&&r.start+32<=code.length);
   assert.ok(!ranges.some(([a,b])=>r.start<b&&r.start+32>a),'IMMUTABLE_NONOVERLAP');ranges.push([r.start,r.start+32]);
   assert.equal(code.subarray(r.start,r.start+32).toString('hex'),'0'.repeat(64));Buffer.from(value,'hex').copy(code,r.start);
  }
 }
 assert.deepEqual([...used].sort(),Object.keys(values).sort(),'EXACT_IMMUTABLE_SET');return'0x'+code.toString('hex');
}
export function assertOwnedPrivateExternalRouterV1(router,input){
 exactRecord(input,['runtime','system','poolIndex']);const s=owned.get(router);assert.ok(s,'OWNED_EXTERNAL_ROUTER_REQUIRED');
 for(const key of ['runtime','system','poolIndex'])assert.equal(s[key],input[key],'ORIGINAL_EXTERNAL_ROUTER_BINDING');
 return undefined;
}
export async function createOwnedPrivateExternalRouterV1(input){assert.equal(arguments.length,1);return buildOwnedPrivateExternalRouterV1(input,null);}
async function buildOwnedPrivateExternalRouterV1(input,recovery){
 exactRecord(input,['runtime','system','poolIndex','protocolFixture','protocolKind']);
 const {runtime,system,poolIndex,protocolFixture:p,protocolKind}=input;
 await assertOwnedLocalEvmV2(runtime);assertOwnedFlatSystem(runtime,system);assertOfficialProtocolFixture(runtime,p);
 assert.equal(system.pools.length,2);assert.ok(poolIndex===0||poolIndex===1);
 assert.ok(['UNISWAP_V3_EXACT_OUTPUT_SINGLE','METAMORPHO_V1_EXACT_SHARE_MINT'].includes(protocolKind));
 const uni=protocolKind==='UNISWAP_V3_EXACT_OUTPUT_SINGLE',output=uni?p.second:p.vault,protocol=uni?p.swapRouter:p.vault;
 const pool=system.pools[poolIndex],sourcePool=system.pools[1-poolIndex];assertOwnedPoolAsset(runtime,pool.assetCapability);
 assert.equal(pool.assetMetadata.address,output.address);assert.equal(pool.assetMetadata.kind,'ERC20');
 const parsed=metadata(),name=uni?'PrivateUniswapV3Delivery':'PrivateMetaMorphoDelivery',artifact=parsed.contracts['PrivateExternalDelivery.sol'][name];
 const vendorRaw=readFileSync(join(D,'protocol-fixture-artifact-pins.json'));assert.equal(sha(vendorRaw),'9913e72be559a10c7340ba291f88b067eab2dd3a0c290052c4c024db14bff2e8','FIXED_PROTOCOL_ARTIFACT_MANIFEST');const vendor=JSON.parse(vendorRaw);
 for(const row of vendor.files.filter(x=>x.path.startsWith('abi-tools/')))assert.equal(sha(readFileSync(join(D,row.path))),row.sha256,'ABI_VENDOR_PIN');
 const require=createRequire(join(D,'abi-tools/package.json')),{Interface}=require('ethers'),iface=new Interface(artifact.abi),solver=runtime.accounts[0];
 const initial=await runtime.block();await runtime.assertCanonical(initial);
 const poolCode=await runtime.code(pool.address,initial.number);
 const values={solver:bare(solver).padStart(64,'0'),inputAsset:bare(p.first.address).padStart(64,'0'),outputAsset:bare(output.address).padStart(64,'0'),
  protocol:bare(protocol.address).padStart(64,'0'),targetPool:bare(pool.address).padStart(64,'0'),inputCode:sha(Buffer.from(bare(p.first.code),'hex')),
  outputCode:sha(Buffer.from(bare(output.code),'hex')),protocolCode:sha(Buffer.from(bare(protocol.code),'hex')),poolCode:sha(Buffer.from(bare(poolCode),'hex')),
  scope:pool.domain.scope,policy:pool.domain.policy,...(uni?{fee:(3000).toString(16).padStart(64,'0')}:{})};
 const expected=expectedRuntime(parsed,name,values);
 const args=uni?[solver,p.first.address,output.address,protocol.address,pool.address,3000]:[solver,p.first.address,output.address,pool.address];
 const creation='0x'+artifact.evm.bytecode.object+iface.encodeDeploy(args).slice(2);
 const label='deploy owned external router '+protocolKind;
 let receipt;if(recovery){assert.equal(recovery.schema,'ORIGINAL_EXTERNAL_ROUTER_RECOVERY_V1');assert.equal(recovery.protocolKind,protocolKind);assert.equal(recovery.poolIndex,poolIndex);assert.equal(recovery.genesis,runtime.metadata.evmGenesis);assert.deepEqual(await runtime.block(),recovery.head);receipt=structuredClone(recovery.receipt);await runtime.checkReceipt(receipt);}else receipt=await runtime.send(label,{from:solver,data:creation});
 await runtime.assertCanonical(receipt);const address=receipt.contractAddress.toLowerCase();
 assert.equal(await runtime.code(address,receipt.blockNumber),expected,'FULL_EXTERNAL_RUNTIME_IMMUTABLES');
 const identity=freeze({chainId:runtime.metadata.chainId,router:bare(address),solver:bare(solver),inputAsset:bare(p.first.address),outputAsset:bare(output.address),
  protocol:bare(protocol.address),targetPool:bare(pool.address),inputCode:values.inputCode,outputCode:values.outputCode,protocolCode:values.protocolCode,poolCode:values.poolCode,scope:values.scope,policy:values.policy});
 const context=freeze({genesisHash:bare(runtime.metadata.evmGenesis),sourceAssetIdentity:sourcePool.domain.asset,targetAssetIdentity:pool.domain.asset});
 let capability;
 async function read(blockNumber='latest'){
  assertOwnedPrivateExternalRouterV1(capability,{runtime,system,poolIndex});await assertOwnedLocalEvmV2(runtime);assertOwnedFlatSystem(runtime,system);
  const header=await runtime.block(blockNumber);assert.ok(BigInt(header.number)>=BigInt(receipt.blockNumber),'ROUTER_BEFORE_CREATION');
  const original=runtime.transactions.filter(x=>x.transactionHash===receipt.transactionHash);assert.equal(original.length,1);
  assert.equal(original[0].label,label);assert.equal(original[0].request.data,creation);assert.equal(original[0].request.from,solver);
  await runtime.assertCanonical(receipt);
  assert.equal(await runtime.code(address,header.number),expected,'FULL_EXTERNAL_RUNTIME_UNCHANGED');
  for(const [target,hash]of [[p.first.address,identity.inputCode],[output.address,identity.outputCode],[protocol.address,identity.protocolCode],[pool.address,identity.poolCode]])
   assert.equal(sha(Buffer.from(bare(await runtime.code(target,header.number)),'hex')),hash,'EXTERNAL_DEPENDENCY_CODE_CHANGED');
  for(const [method,value]of Object.entries({solver,inputAsset:p.first.address,outputAsset:output.address,protocol:protocol.address,targetPool:pool.address,scope:'0x'+identity.scope,policy:'0x'+identity.policy,...(uni?{fee:3000n}:{})})){
   const actual=iface.decodeFunctionResult(method,await runtime.call({to:address,data:iface.encodeFunctionData(method)},header.number))[0];
   assert.equal(typeof actual==='string'?actual.toLowerCase():actual,value,'EXTERNAL_IMMUTABLE_GETTER');
  }
  assert.equal((await pool.call('asset()',[],header.number)).slice(-40),identity.outputAsset);
  const ledgerNamespace=bare(await pool.call('ledgerNamespace()',[],header.number));
  const sourceLedgerNamespace=bare(await sourcePool.call('ledgerNamespace()',[],header.number));
  const canonical=await runtime.assertCanonical(header);assert.equal(canonical.hash,header.hash);
  return freeze({identity,blockHash:header.hash,blockNumber:header.number,context:{...context,ledgerNamespace,sourceLedgerNamespace},routerRuntimeCodeSHA256:sha(Buffer.from(bare(expected),'hex'))});
 }
 capability=Object.freeze({address,identity,protocolKind,fee:uni?'3000':null,destinationPoolIndex:poolIndex,sourcePoolIndex:1-poolIndex,
  artifact:freeze(artifact),context,routerRuntimeCodeSHA256:sha(Buffer.from(bare(expected),'hex')),creationTransactionHash:receipt.transactionHash,read});
 owned.set(capability,{runtime,system,poolIndex,receipt:structuredClone(receipt),protocolKind});await read(recovery?recovery.head.number:receipt.blockNumber);if(recovery)assert.deepEqual(capability.identity,recovery.identity);return capability;
}

export async function captureOwnedPrivateExternalRouterRecoveryV1(router){
 assert.equal(arguments.length,1);const s=owned.get(router);assert.ok(s,'ORIGINAL_EXTERNAL_ROUTER');const head=await s.runtime.block();await router.read(head.number);
 return {schema:'ORIGINAL_EXTERNAL_ROUTER_RECOVERY_V1',protocolKind:s.protocolKind,poolIndex:s.poolIndex,genesis:s.runtime.metadata.evmGenesis,head:structuredClone(head),receipt:structuredClone(s.receipt),identity:structuredClone(router.identity)};
}
export async function reopenOwnedPrivateExternalRouterRecoveryV1(token){
 assert.equal(arguments.length,1);const {consumeExternalDefiBootstrapPartV1}=await import('../../recovery/external-defi-bootstrap-recovery-v1.mjs');
 const {runtime,record,system,protocols}=consumeExternalDefiBootstrapPartV1(token,'router');
 return buildOwnedPrivateExternalRouterV1({runtime,system,poolIndex:record.poolIndex,protocolFixture:protocols,protocolKind:record.protocolKind},record);
}
