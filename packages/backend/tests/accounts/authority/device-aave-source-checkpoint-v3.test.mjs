/** Real Aave adapter and private-exit owners, AEAD journal, CAS and checkpoint
 * lifecycle. Fixed lower compilation/chain/lifetime/SOURCE ports are fixtures;
 * no financial proof, canonical receipt or SOURCE authority is established. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {deviceAaveStaticRedemptionPermissionMessageV1} from '@lianum/mobile-protocol/device-morpho-blue-redemption-v1';
import {devicePublicKey,signDeviceMessage} from '../../../../../apps/mobile/src/custody/signing.mjs';
import {loadOriginalProtocolAbiToolsV1} from '../../../src/operations/deployments/defi/official-protocol-resources-v1.mjs';
const backend=new URL('../../../src/',import.meta.url),h=value=>createHash('sha256').update(value).digest('hex'),a=value=>'0x'+value.repeat(40),code='0x6000';
function gate(){let release,enter;const entered=new Promise(resolve=>{enter=resolve;}),wait=new Promise(resolve=>{release=resolve;});return{entered,release,async pause(){enter();await wait;}};}

test('HOST Aave SOURCE checkpoints use real private owners, preserve journals and refuse busy or changed state',async t=>{
 const scratch=await mkdtemp(join(tmpdir(),'aave-source-checkpoint-'));
 t.after(()=>rm(scratch,{recursive:true,force:true}));
 const {Interface}=loadOriginalProtocolAbiToolsV1();
 const abi=['constructor(address vault)','function asset() view returns (address)','function totalAssets() view returns (uint256)','function totalSupply() view returns (uint256)','function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function used(address,bytes32) view returns (bool)','function rate() view returns (uint256)','function scaledBalanceOf(address) view returns (uint256)','function scaledTotalSupply() view returns (uint256)','function previewRedeem(uint256) view returns (uint256)','function maxRedeem(address) view returns (uint256)'];
 const iface=new Interface(abi),contract=address=>Object.freeze({address,code,iface});
 let reads=0,checks=0,captures=0,deployments=0,blockGate=null,adapter,service,sourceCalls=0;
 const sender=a('1'),router=a('2'),header=Object.freeze({number:'0x1',hash:'0x'+h('header'),timestamp:'0x1770'}),system=Object.freeze({}),account=Object.freeze({});
 const fixture=Object.freeze({vault:contract(a('3')),first:contract(a('4')),aToken:contract(a('5')),pool:contract(a('6')),stableDebt:contract(a('7')),variableDebt:contract(a('8')),async assertCurrent(at){assert.equal(at,header.number);}});
 const sourceASTs={host:{ast:{nodes:[{nodeType:'VariableDeclaration',mutability:'immutable',id:1,name:'vault'},{nodeType:'VariableDeclaration',mutability:'immutable',id:2,name:'asset'}]}}};
 const artifact={abi,evm:{bytecode:{object:'6000',linkReferences:{}},deployedBytecode:{object:'00'.repeat(64),linkReferences:{},immutableReferences:{1:[{start:0,length:32}],2:[{start:32,length:32}]}}}};
 const build={compiler:'0.8.37+commit.f401782d',inputSHA256:h('inert-compilation'),sourceASTs,artifacts:{BoundedAaveStaticExit:artifact}};
 const routerCode='0x'+fixture.vault.address.slice(2).padStart(64,'0')+fixture.first.address.slice(2).padStart(64,'0');
 const deployment=Object.freeze({contractAddress:router,transactionHash:'0x'+h('deployment'),blockNumber:header.number,blockHash:header.hash});
 const runtime=Object.freeze({metadata:{chainId:'31337',scratchDirectory:scratch,evmGenesis:'0x'+h('genesis')},accounts:[sender],transactions:[],
  async send(label,input){assert.equal(label,'deploy-bounded-aave-static-exit');assert.deepEqual(input,{from:sender,data:'0x6000'+iface.encodeDeploy([fixture.vault.address]).slice(2)});deployments++;return deployment;},
  async assertCanonical(value){assert.deepEqual(value,Object.hasOwn(value,'contractAddress')?deployment:header);},async code(address){return address===router?routerCode:code;},
  async block(){if(blockGate)await blockGate.pause();return header;},
  async call(request,at){assert.equal(at,header.number);reads++;const fragment=iface.parseTransaction({data:request.data});assert.ok(fragment);let value=100n;if(fragment.name==='asset')value=fixture.first.address;else if(fragment.name==='used')value=false;return iface.encodeFunctionResult(fragment.name,[value]);},
 });
 const signingKey=new Uint8Array(32);signingKey[31]=4;t.after(()=>signingKey.fill(0));
 const descriptor=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://localhost:9443',pairingId:h('pairing'),devicePublicKey:devicePublicKey(signingKey),lifetime:h('lifetime'),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,name==='asset'?fixture.vault.address.slice(2):h(name).slice(0,['pool','hub'].includes(name)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'AAVE',decimals:6}});
 const lifetimes=new Map();let exitGate=null;
 function lifetime(kind){return async(r,identity,credentials,record)=>{
  assert.equal(r,runtime);let accepted=structuredClone(record),pending=null;const state={kind,identity,credentials};lifetimes.set(kind,state);
  return{
   async check(current){checks++;assert.deepEqual(current,accepted);assert.equal(pending,null);if(kind==='exit'&&exitGate)await exitGate.pause();},
   async before(current,next){assert.deepEqual(current,accepted);assert.equal(pending,null);pending=structuredClone(next);},
   async acknowledged(next){assert.deepEqual(next,pending);accepted=structuredClone(next);pending=null;},
   async capture(current){await this.check(current);captures++;return{credentials:{...credentials},checkpoint:{revision:current.revision,stateSHA256:h(JSON.stringify(current))},pending:null};},
  };
 };}
 const adapterToken=Object.freeze({}),exitToken=Object.freeze({});
 const boundaries=[
  ['chains/evm/runtime/owned-evm-v2-runtime.mjs',{assertOwnedLocalEvmV2:async value=>assert.equal(value,runtime)}],
  ['operations/deployments/defi/official-aave-fixture-v1.mjs',{assertOfficialAaveFixtureV1:(r,f)=>{assert.equal(r,runtime);assert.equal(f,fixture);},officialAaveFixtureCompilationV1:(r,f)=>{assert.equal(r,runtime);assert.equal(f,fixture);return build;}}],
  ['operations/deployments/system/deploy-system.mjs',{assertOwnedFlatSystem:(r,s)=>{assert.equal(r,runtime);assert.equal(s,system);}}],
  ['accounts/authority/device-external-flat-note-authority-v1.mjs',{assertOriginalDeviceExternalFlatNoteAuthorityV1:value=>{assert.equal(value,account);return descriptor;}}],
  ['defi/vaults/retained-external-vault-journal-v1.mjs',{createRetainedOfficialVaultJournalV1:lifetime('adapter'),createRetainedPrivateVaultExitJournalV1:lifetime('exit')}],
  ['operations/recovery/device-external-flat-original-source-v2.mjs',{
   consumeOriginalDeviceGraphSourceRequestV2(token,kind,value){sourceCalls++;assert.equal(token,kind==='aave-adapter-checkpoint'?adapterToken:exitToken,'HOST_SOURCE_REQUEST_IDENTITY');assert.equal(value,kind==='aave-adapter-checkpoint'?adapter:service,'HOST_SOURCE_REQUEST_BINDING');},
   assertOriginalDeviceGraphSourceAvailableV2:value=>assert.equal(value,service),
   beginOriginalDeviceGraphSourceActivityV2:async value=>{assert.equal(value,service);return value;},endOriginalDeviceGraphSourceActivityV2:async value=>assert.equal(value,service),
  }],
 ];
 const namespaces=await Promise.all(boundaries.map(([path])=>import(new URL(path,backend)))),mocks=[];
 t.after(()=>{for(const m of mocks.reverse())m.restore();});
 for(const [i,[path,exports]]of boundaries.entries())mocks.push(mock.module(new URL(path,backend),{exports:{...namespaces[i],...exports}}));
 // The query isolates this owner's private maps. Its real APIs are also the
 // exact dependency of the private-exit owner; do not replace adapter brands.
 const adapterURL=new URL('defi/vaults/owned-metamorpho-vault.mjs',backend),actualAdapter=await import(adapterURL.href+'?checkpoint-host');
 mocks.push(mock.module(adapterURL,{exports:actualAdapter}));
 const exit=await import(new URL('defi/withdrawals/device-morpho-blue-private-exit-v1.mjs?checkpoint-host',backend));
 adapter=await actualAdapter.createRetainedOwnedDeviceAaveStaticVaultV1({runtime,protocolFixture:fixture});
 assert.equal(actualAdapter.isOwnedDeviceAaveStaticVaultV1(adapter),true);assert.equal(actualAdapter.isOwnedDeviceAaveStaticVaultV1({...adapter}),false);
 const intent={reference:h('original-reference'),kind:'redeem',amount:'20',minimumOutput:'1',deadline:'6100'};
 await adapter.prepareOnce(intent);assert.equal(deployments,1);
 const checkpoint=()=>actualAdapter.checkpointRetainedOwnedDeviceAaveStaticVaultSourceV3(adapter,adapterToken);
 const first=await checkpoint();assert.equal(first.variant,'DEVICE_AAVE_STATIC');assert.equal(first.record.data.operations.length,1);assert.equal(first.record.data.operations[0].reference,intent.reference);assert.equal(first.record.data.operations[0].phase,'PREPARED');
 assert.deepEqual(await checkpoint(),first);const bytes=await readFile(lifetimes.get('adapter').credentials.path);
 await assert.rejects(actualAdapter.checkpointRetainedOwnedDeviceAaveStaticVaultSourceV3({...adapter},adapterToken),/HOST_SOURCE_REQUEST_BINDING/);
 await assert.rejects(actualAdapter.checkpointRetainedOwnedDeviceAaveStaticVaultSourceV3(adapter,{...adapterToken}),/HOST_SOURCE_REQUEST_IDENTITY/);
 blockGate=gate();const observation=adapter.observe();await blockGate.entered;assert.equal(await checkpoint(),null);blockGate.release();await observation;blockGate=null;
 assert.deepEqual(await readFile(lifetimes.get('adapter').credentials.path),bytes);
 service=await exit.createOriginalDeviceAaveStaticPrivateExitV1({runtime,system,account,protocols:fixture,adapter});
 const save=token=>exit.checkpointOriginalDeviceAaveStaticPrivateExitSourceV3(service,exitToken,token);
 await assert.rejects(save({...adapterToken}),/HOST_SOURCE_REQUEST_IDENTITY/);
 const saved=await save(adapterToken);assert.equal(saved.schema,'DEVICE_AAVE_STATIC_REDEMPTION_PRIVATE_V1');assert.deepEqual(saved.adapter,first);assert.equal(saved.record.data.schema,'DEVICE_AAVE_STATIC_REDEMPTION_JOURNAL_V1');
 assert.deepEqual(await save(adapterToken),saved);assert.ok(service.challenge());
 const access=service.challenge(),signature=signDeviceMessage(signingKey,deviceAaveStaticRedemptionPermissionMessageV1(access));
 exitGate=gate();const status=service.status({access,signature});await exitGate.entered;const calls=sourceCalls;assert.equal(await save(adapterToken),null);assert.equal(sourceCalls,calls+1);exitGate.release();exitGate=null;await status;
 assert.deepEqual(await save(adapterToken),saved);assert.deepEqual(await readFile(lifetimes.get('adapter').credentials.path),bytes);
 // Alter the real authenticated ciphertext, restore it, and prove the actual
 // checkpointing flag clears on failure without closing or replacing owners.
 const credentials=lifetimes.get('exit').credentials,encrypted=await readFile(credentials.path),damaged=Buffer.from(encrypted);damaged[damaged.length-2]^=1;
 try{await writeFile(credentials.path,damaged);await assert.rejects(save(adapterToken));}finally{await writeFile(credentials.path,encrypted);damaged.fill(0);encrypted.fill(0);}
 assert.deepEqual(await save(adapterToken),saved);assert.ok(service.challenge());
 const store=new Vault(credentials.path),before=await store.read(credentials.password),beforeCalls=sourceCalls;
 await store.update(credentials.password,before.revision,data=>({...data,operations:[{changedOriginal:true}]}));
 await assert.rejects(save(adapterToken),/BLUE_REDEMPTION_ORIGINAL_CHECKPOINT/);assert.equal(sourceCalls,beforeCalls+1);
 // A changed but valid AEAD record is neither adopted nor forwarded to the
 // adapter; closing revokes the original adapter and exit in place.
 assert.deepEqual(await service.close(),{closed:true,originalWorkDrained:true});
 assert.throws(()=>service.challenge(),/BLUE_REDEMPTION_UNAVAILABLE/);
 await assert.rejects(checkpoint(),/AAVE_SOURCE_ORIGINAL_ADAPTER/);
 assert.ok(reads>0&&checks>=8&&captures>=4);assert.equal(deployments,1);bytes.fill(0);
});
