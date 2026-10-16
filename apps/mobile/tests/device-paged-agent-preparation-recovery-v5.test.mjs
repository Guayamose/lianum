/** Actual signed proposal, SDK public persistence and controller/orchestration.
 * Custody/transport/review ports are explicit HOST state machines. This checks
 * interruption decisions and absence of financial approval, not chain proofs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {secp256k1} from '@noble/curves/secp256k1.js';
import * as Public from '@lianum/sdk/agent/operation';
import * as Agent from '@lianum/sdk/agent';
import * as Preparation from '@lianum/sdk/agent/preparation';
import * as P from '../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {devicePagedAgentProposalDigestV4} from '@lianum/mobile-protocol/device/paged-agent-v4';
const sha=value=>createHash('sha256').update(value).digest('hex');
test('seed/BEGIN/APPEND/SEAL response loss reopens the same signed preparation and cursor, without financial approval',async t=>{
 const owner=new Uint8Array(32);owner[31]=1;const agent=new Uint8Array(32);agent[31]=3;t.after(()=>{owner.fill(0);agent.fill(0);});
 const now=Math.floor(P.devicePagedNowV3()),descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://localhost:9444',pairingId:'host-agent-prepare-reentry',devicePublicKey:Buffer.from(secp256k1.getPublicKey(owner,false)).toString('hex'),deadlineMs:now+9*3600000,chainId:'11155111',chainDeadlineSeconds:String(Math.floor(now/1000)+9*3600),...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,sha(k)])),...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)]))});
 const packet={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nSE9TVCBEQVRB\n-----END CERTIFICATE-----\n',certificateSHA256:sha('HOST cert')}};
 const network={family:'EVM',networkId:'ethereum-sepolia',chainDomain:sha('chain'),evidencePolicy:sha('evidence'),assetSymbol:'ETH',decimals:18,label:'HOST public data',destinations:[]};
 const pairing={descriptor,nativePreparation:{family:'EVM',chainDomain:network.chainDomain,evidencePolicy:network.evidencePolicy,budgetAsset:{networkId:network.networkId,genesis:descriptor.genesis,assetIdentity:descriptor.assetIdentity,symbol:'ETH',decimals:18,unit:'wei'},fundingOrigin:'OPERATOR_TESTNET',networks:[network]}};
 const terms={budget:'65',fundingNotBefore:String(Math.floor(now/1000)),fundingValidUntil:String(Math.floor(now/1000)+600),settleBefore:String(Math.floor(now/1000)+6*3600)},nodes=Array.from({length:65},(_,i)=>({id:'payment-'+i,networkId:network.networkId,recipient:'0x'+'56'.repeat(20),amountAtomic:'1',providerPayoutAtomic:'1',dependsOn:i?['payment-'+(i-1)]:[]})),signed=Agent.createDevicePagedAgentNativeProposalV4(agent,descriptor,terms,nodes);
 let state,drop,financial=0;const data=new Map(),apis=new WeakSet(),replies=new WeakSet(),reviewTokens=new WeakMap();
 const storage={get:async key=>data.get(key)??null,set:async(key,value)=>{data.set(key,value);},digest:async text=>sha(text)};
 const reset=stage=>{data.clear();drop=stage;state={graph:null,seed:null,pages:[],pendingPage:null,pending:null,begin:null,cached:null,remote:false,remotePages:0,remotePhase:'BUILDING',seeds:0,appends:0,begins:0,seals:0,notes:0};};
 const status=()=>({descriptor,note:{state:state.remote?'UNKNOWN':'LIVE'}});
 const localNode=(node,index)=>({...node,ordinal:String(index)});
 function vault(){return{
  beginReadStorage:async()=>{},endReadStorage:async()=>{},readDraft:async()=>({}),acceptStatus:async()=>{},summary:async()=>({rootId:sha('root'),noteRevision:1}),close:async()=>{},
  graphSummary:async()=>state.graph?{graphId:state.graph,phase:state.cached?.phase??'STALE',pending:state.pending,status:state.cached}:null,
  prepareGraph:async(_status,originalTerms)=>{assert.equal(await Preparation.createDevicePagedAgentPreparationStoreV5(descriptor,storage).read()!==null,true,'association precedes the first persisted graph seed');state.seeds++;state.graph='paged-graph-'+sha('same graph').slice(0,32);state.seed={...originalTerms};if(drop==='SEED'){drop=null;throw Error('HOST_CRASH_AFTER_SEED');}return{graphId:state.graph,command:{...state.seed}};},
  graphAgentPreparationDataV5:async()=>({graphId:state.graph,rootId:sha('root'),revision:1,hasBeginCommand:state.begin!==null,terms:state.seed,pages:structuredClone(state.pages),pendingPage:structuredClone(state.pendingPage)}),
  graphInitialBeginCommandV5:async()=>{assert.equal(state.remote,false);assert.equal(state.begin,null);return{graphId:state.graph,command:{...state.seed}};},
  graphSavedCommand:async()=>state.begin,
  resumeGraphBegin:async()=>{assert.equal(state.remote,false);assert.ok(state.begin);return structuredClone(state.begin);},
  graphCommand:async(action,command)=>{const draft={action,command:structuredClone(command),graphId:state.graph,jobId:'HOST-'+action,rootId:sha('root'),revision:1};if(action==='BEGIN_GRAPH')state.begin=structuredClone(draft);return draft;},
  armGraphCommand:async draft=>draft,consumeArmedGraphConsent:async(_arm,c)=>{state.pending={action:c.action};},
  acceptGraphReply:async reply=>{assert.ok(replies.has(reply));state.cached=reply.status;state.pending=null;},
  prepareGraphPage:async page=>{assert.equal(state.pendingPage,null);state.notes+=page.length;state.pendingPage={pageIndex:String(state.pages.length),nodes:page.map((node,i)=>localNode(structuredClone(node),state.pages.length*64+i))};},
  graphNativePreparationCommand:async()=>({pageIndex:state.pendingPage.pageIndex}),graphNativeActions:async()=>({preparationId:'HOST retained'}),
  completeGraphPage:async()=>{state.pages.push(state.pendingPage);state.pendingPage=null;return{command:{}};},
  graphPageAppendCommand:async()=>({pageIndex:state.pages.at(-1).pageIndex}),
  graphExecutionReview:async()=>({budget:state.seed.budget,settleBefore:state.seed.settleBefore,steps:state.pages.flatMap(page=>page.nodes.map(node=>({id:node.id,reserve:node.amount,intent:node.intent})))}),
  graphBuilderSummary:async()=>({nodes:state.pages.flatMap(page=>page.nodes)}),
 };}
 const publicStore=()=>Public.createDevicePagedAgentPublicOperationStoreV4(descriptor,storage),preparationStore=()=>Preparation.createDevicePagedAgentPreparationStoreV5(descriptor,storage);
 t.mock.module(new URL('../src/state/device-paged-agent-public-store-v4.ts',import.meta.url).href,{exports:{createNativeDevicePagedAgentPublicStoreV4:publicStore,createNativeDevicePagedAgentPreparationStoreV5:preparationStore}});
 t.mock.module(new URL('../src/api/device-paged-connection-transport-v3.ts',import.meta.url).href,{exports:{parseDevicePagedConnectionProfileV3:text=>Public.normalizeDevicePagedAgentPublicConnectionV4(JSON.parse(text)),createDevicePagedConnectionTransportV3:async()=>({fetchImpl:async()=>{throw Error('HOST unused fetch');},close:async()=>{}})}});
 t.mock.module(new URL('../src/api/device-paged-owner-api-v3.mjs',import.meta.url).href,{exports:{createDevicePagedOwnerApiV3:()=>({challenge:async()=>({}),submit:async()=>status(),close:async()=>{}})}});
 t.mock.module(new URL('../src/custody/device-paged-note-vault-v3.ts',import.meta.url).href,{exports:{openExistingDevicePagedCustodyV3:async()=>vault()}});
 t.mock.module(new URL('../src/api/device-paged-graph-api-v3.mjs',import.meta.url).href,{exports:{readDevicePagedGraphApiV3:api=>{assert.ok(apis.has(api));return descriptor;},readDevicePagedGraphPairingV3:value=>{assert.strictEqual(value,pairing);return pairing;},readDevicePagedGraphReplyV3:value=>{assert.ok(replies.has(value));return value;},createDevicePagedGraphApiV3:()=>{const api={pairing:async()=>pairing,close:async()=>{},challenge:async(action,graphId,jobId,rootId,revision,command)=>({action,graphId,jobId,rootId,revision,command}),submit:async c=>{if(c.action==='BEGIN_GRAPH'){assert.equal(state.remote,false);state.remote=true;state.begins++;}else if(c.action==='APPEND_PAGE'){assert.equal(Number(c.command.pageIndex),state.remotePages);state.remotePages++;state.appends++;}else if(c.action==='SEAL_GRAPH'){assert.equal(state.remotePages,2);state.remotePhase='SIGNING';state.seals++;}else assert.ok(['PREPARE_NATIVE_PAGE','OBSERVE_GRAPH'].includes(c.action));if(drop===c.action){drop=null;throw Error('HOST_LOST_REPLY_'+c.action);}const reply={status:{descriptor,graphId:state.graph,phase:state.remotePhase,pages:String(state.remotePages)},private:{}};replies.add(reply);return reply;}};apis.add(api);return api;}}});
 t.mock.module(new URL('../src/custody/wallet-session-v1.ts',import.meta.url).href,{exports:{signWalletSessionPagedGraphV1:async c=>{assert.ok(!['START_AUTOMATION','SIGN_GRAPH'].includes(c.action));return'HOST ordinary signature';}}});
 const forbidden=async()=>{financial++;throw Error('financial approval forbidden in preparation');};
 t.mock.module(new URL('../src/custody/key-store.ts',import.meta.url).href,{exports:{readDevicePublicKey:async()=>descriptor.devicePublicKey,signDevicePagedOwnerPermissionV3:async()=> 'HOST read signature',openDevicePagedGraphAgentAutomationSessionV4:forbidden,signDevicePagedAgentReadGrantV4:forbidden,signDevicePagedGraphExecutionPermissionV3:forbidden,closeDevicePagedGraphExecutionSessionV3(){}}});
 t.mock.module(new URL('../src/custody/device-paged-custody-views-v3.mjs',import.meta.url).href,{exports:{readDevicePagedExecutionReviewV3:value=>value,createDevicePagedAutomationReviewV4:value=>value}});
 t.mock.module(new URL('../src/custody/device-paged-agent-review-v4.mjs',import.meta.url).href,{exports:{createDevicePagedAgentAutomationReviewV4:(execution,agentPublicKey)=>{const token={};reviewTokens.set(token,{execution,agentPublicKey});return token;},readDevicePagedAgentAutomationReviewV4:token=>{assert.ok(reviewTokens.has(token));return reviewTokens.get(token);}}});
 const {createDevicePagedAgentUiControllerV4}=await import('../src/api/device-paged-agent-ui-controller-v4.ts');
 for(const stage of ['SEED','BEGIN_GRAPH','APPEND_PAGE','SEAL_GRAPH'])await t.test(stage,async()=>{
  reset(stage);let controller=createDevicePagedAgentUiControllerV4(JSON.stringify(packet),new AbortController().signal);await assert.rejects(controller.prepare(signed),/HOST_/);const retained=await controller.preparation();assert.ok(retained);assert.equal(retained.proposalSHA256,devicePagedAgentProposalDigestV4(signed.proposal));const originalGraph=state.graph;await controller.close();state.cached=null;
  controller=createDevicePagedAgentUiControllerV4(JSON.stringify(packet),new AbortController().signal);assert.deepEqual((await controller.preparation()).proposal,signed);const review=await controller.prepare(signed);assert.equal(review.execution.steps.length,65);assert.equal(state.graph,originalGraph);assert.equal(state.seeds,1);assert.equal(state.begins,1);assert.equal(state.appends,2);assert.equal(state.seals,1);assert.equal(state.notes,65);assert.equal(financial,0);await controller.close();
 });
 reset('BEGIN_GRAPH');let controller=createDevicePagedAgentUiControllerV4(JSON.stringify(packet),new AbortController().signal);await assert.rejects(controller.prepare(signed),/HOST_/);await controller.close();state.cached=null;
 const changed=Agent.createDevicePagedAgentNativeProposalV4(agent,descriptor,terms,nodes.map((n,i)=>i? n:{...n,recipient:'0x'+'78'.repeat(20)}));controller=createDevicePagedAgentUiControllerV4(JSON.stringify(packet),new AbortController().signal);const prior=state.begins;await assert.rejects(controller.prepare(changed),/PREPARATION_BINDING/);assert.equal(state.begins,prior);assert.equal(financial,0);await controller.close();
});
