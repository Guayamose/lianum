/** Actual Authority, Source journal/Vault and Original PUBLIC RPC. Deployment,
 * graph metadata, provider rows and the encrypted channel boundary are HOST;
 * this checks current economic reads, never a proof or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as P from '../../../../mobile-protocol/src/device-paged-owner-v3.mjs';
import {publicPagedAccountFromKeyV1} from '../../../src/chains/public-testnet/wire-v1.mjs';
import {createOriginalPagedSepoliaRpcV4} from '../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {buildPagedSepoliaSourceJournalDataV4} from '../../../src/operations/local/funded-graph-paged-source-journal-data-v4.mjs';

const word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),genesis='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
test('PUBLIC economic operation reads Original historical balances across advancing canonical heads and rejects changed state/reorg',{timeout:30000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'original-economic-balance-')),password='host-journal-password-original-32bytes',requests=[];
 let latest=16,reorg=false,changeCanonicalOnBalance=false,changed=false,bundle,readOperation,authority;
 const head=n=>({number:'0x'+n.toString(16),hash:'0x'+n.toString(16).padStart(64,'0'),parentHash:'0x'+(n-1).toString(16).padStart(64,'0'),timestamp:'0x'+(Math.floor(Date.now()/1000)+n).toString(16),gasLimit:'0x100000',baseFeePerGas:'0x1'});
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const r=JSON.parse(options.body);requests.push(r);let result;
  if(r.method==='eth_chainId')result='0xaa36a7';
  else if(r.method==='eth_getBlockByNumber'){
   const tag=r.params[0],n=['latest','safe','finalized'].includes(tag)?latest:Number(BigInt(tag));
   result=n===0?{hash:genesis}:{...head(n),...(reorg&&n===16?{hash:'0x'+'ee'.repeat(32)}:{})};
  }else if(r.method==='eth_getCode')result='0x6000';
  else if(r.method==='eth_getBalance'){
   assert.match(r.params[1],/^0x[0-9a-f]+$/);
   result=changed&&r.params[1]==='0x11'?'0x1e':'0x19';
   if(advance){latest=17;advance=false;}
   if(changeCanonicalOnBalance){reorg=true;changeCanonicalOnBalance=false;}
  }else throw Error('HOST_UNEXPECTED_RPC:'+r.method);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:r.id,result}),{status:200});
 });
 const created=await createOriginalPagedSepoliaRpcV4({endpoint:'https://economic-read-host.invalid',account:publicPagedAccountFromKeyV1('ethereum-sepolia',Buffer.alloc(32,1)),keysetId:'77'.repeat(32)}),runtime=created.runtime;
 const system={profile:P.DEVICE_PAGED_GRAPH_V3,receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4',securityGeneration:'EXACT_PAYOUT_SET_V4',minimumDepositAtomic:'10',manifestSHA256:'1'.repeat(64),consumerSHA256:'2'.repeat(64),pool:'0x'+'a'.repeat(40),state:'0x'+'b'.repeat(40),native:'0x'+'c'.repeat(40),scope:'3'.repeat(64),policy:'4'.repeat(64),assetIdentity:'5'.repeat(64),domain:'6'.repeat(64),hubDomain:'7'.repeat(64),registryCommitment:'8'.repeat(64),deployments:[{name:'PagedSparsePoseidon2V3',address:'0x'+'d'.repeat(40),codeHash:'0x'+'9'.repeat(64)}]};
 let seeded=false,advance=false;
 const d={...Object.fromEntries(['pool','state','native'].map(k=>[k,{expectedCode:'0x6000',codeHash:'0x'+'e'.repeat(64)}])),entries:{pool:{artifact:{abi:[]}}},ledgerLeaves:async()=>({leaves:[],root:word(0)}),call:async(_kind,method)=>{
  if(method==='leafCount()')return word(0);
  if(method==='backedAmount()')return word(seeded?25:0);
  if(method==='graphOutcomes(bytes32)')return word(0);
  if(method==='progress(bytes32)')return '0x'+'0'.repeat(64*15);
  if(['currentRoot()','evidenceState()','revocationSequence()','stateSequence()','receiptRoot()','halted()'].includes(method)){
   return word(0);
  }
  throw Error('HOST_UNEXPECTED_DEPLOYMENT_CALL:'+method);
 }};
 const originalSystem=(r,s)=>{assert.strictEqual(r,runtime);assert.strictEqual(s,system);};
 t.mock.module(new URL('../../../src/operations/local/funded-graph-paged-deployment-v3.mjs',import.meta.url).href,{exports:{assertOriginalFundedPagedGraphWalletV3:originalSystem,readOriginalFundedPagedGraphDeploymentV3:()=>d,pagedGraphProofDataV3:()=>{throw Error('HOST_NO_PROOF');},pagedGraphStaticDataV3:()=>{throw Error('HOST_NO_EFFECT');}}});
 t.mock.module(new URL('../../../../engine/src/execution/local/device-paged-graph-client-v3.mjs',import.meta.url).href,{exports:{createOriginalDevicePagedGraphClientV3:async()=>({close:async()=>{},ownerReopenRequired:()=>false}),reopenOriginalDevicePagedGraphClientV3:()=>{throw Error('HOST_NO_REOPEN');},readOriginalDevicePagedGraphResultV3:()=>{throw Error('HOST_NO_PROOF');},readOriginalDevicePagedNativeReadyV3:()=>{throw Error('HOST_NO_READY');}}});
 t.mock.module(new URL('../../../src/operations/local/device-paged-native-economic-channel-v3.mjs',import.meta.url).href,{exports:{createDevicePagedNativeEconomicChannelV3:(_descriptor,_settlement,operation)=>{readOperation=operation;return {close(){}};}}});
 const provider={};
 t.mock.module(new URL('../../../src/providers/funded-paged-native-provider-v3.mjs',import.meta.url).href,{exports:{assertOriginalPagedNativeProviderV3:(p,b)=>{assert.strictEqual(p,provider);originalSystem(b.runtime,b.system);assert.strictEqual(b.account,authority);},readOriginalPagedNativeOperationRowsV4:()=>({providerId:'88'.repeat(32),rows:[],checkpoint:{revision:'0',dataSHA256:'99'.repeat(32)}})}});
 const source=buildPagedSepoliaSourceJournalDataV4(Object.freeze({assertOriginalSystem:originalSystem,readOriginalSystem:()=>d,assertOriginalReceiverReady:async()=>{}}));
 t.mock.module(new URL('../../../src/operations/local/funded-graph-paged-public-kernel-v4.mjs',import.meta.url).href,{exports:{createOriginalPagedSepoliaSourceJournalV4:async(...args)=>{bundle=await source.create(...args);return bundle;},assertOriginalPagedSepoliaSourceJournalV4:(...args)=>source.assertBundle(...args),closeOriginalPagedSepoliaSourceJournalV4:token=>source.close(token)}});
 try{
  const device=generateKeyPairSync('ec',{namedCurve:'secp256k1'}).publicKey.export({format:'jwk'}),devicePublicKey='04'+Buffer.from(device.x,'base64url').toString('hex')+Buffer.from(device.y,'base64url').toString('hex');
  const A=await import('../../../src/accounts/authority/device-paged-note-authority-v3.mjs');
  authority=await A.createOriginalDevicePagedSepoliaGraphNoteAuthorityV4(runtime,system,{origin:'https://localhost:23456',devicePublicKey,journal:{path:join(directory,'journal.vault'),password}});
  await A.bindOriginalDevicePagedNativePreparationV3(authority,provider);
  const publicData={authorizationRoot:'1'.repeat(64),reserveNullifier:'2'.repeat(64),progressCommitment:'3'.repeat(64),readyCommitment:null,sourceCommitment:'4'.repeat(64),sourceNullifier:'5'.repeat(64),pages:'1',nodes:'3',budget:'25',settleBefore:(Math.floor(Date.now()/1000)+600).toString()},graph={graphId:'host-graph',rootId:'6'.repeat(64),revision:1,public:publicData,phase:'PREPARED',job:null,pending:null,work:null};
  await bundle.vault.update(password,0,data=>({...data,graph}));seeded=true;
  const before=await readFile(bundle.vault.path),consent={...graph,...publicData};
  advance=true;
  const result=await readOperation([],consent);
  assert.equal(result.status.blockNumber,'16');assert.equal(latest,17);
  assert.equal(result.view.ledger.heldAmount,'25');assert.equal(result.view.ledger.backedAmount,'25');
  assert.ok(requests.some(r=>r.method==='eth_getBalance'&&r.params[1]==='0x10'));
  assert.ok(requests.some(r=>r.method==='eth_getBalance'&&r.params[1]==='0x11'));
  assert.deepEqual(await readFile(bundle.vault.path),before,'read never mutates financial journal');
  latest=16;advance=true;changed=true;await assert.rejects(readOperation([],consent),/PAGED_PUBLIC_READ_SOURCE_STATE_CHANGED/);changed=false;
  latest=16;changeCanonicalOnBalance=true;await assert.rejects(readOperation([],consent),/CANONICAL|PAGED_OPERATION/);
  assert.deepEqual(await readFile(bundle.vault.path),before);
  assert.ok(!requests.some(r=>r.method==='eth_sendRawTransaction'));
 }finally{await authority?.close();created.lifecycle.acknowledge();await runtime.close();await rm(directory,{recursive:true,force:true});}
});
