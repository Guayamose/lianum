/** Device source U/S and device D27 share composition over one original realm.
 * All resource identities are born before funding. HTTP supplies public terms
 * and device signatures, never a factory, private note key or native callback. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {randomBytes} from 'node:crypto';
import {mkdtemp,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {externalFlatExactV1,externalFlatUintV1} from '../../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
import {createGenericBalanceNativePreparation} from '../../../../engine/src/execution/balances/generic-balance-native-preparation.mjs';
import {createNativeRecipientProcess} from '../../../../engine/src/execution/native/recipients/native-recipient-process.mjs';
import {nativeRecipientInvoiceRequest} from '../../../../engine/src/execution/native/recipients/native-recipient-custody.mjs';
import {NATIVE_ADMISSION_LOSS_CLAUSE} from '../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import {assertOriginalDeviceExternalFlatNoteAuthorityV1,assertOriginalDeviceExternalFlatShareNoteAuthorityV1,
 consumeOriginalDeviceExternalFlatShareProofV1,bindOriginalDeviceExternalFlatShareGraphV1} from '../../accounts/authority/device-external-flat-note-authority-v1.mjs';
import {createOriginalDeviceExternalFlatSourceGraphV1,assertOriginalDeviceExternalFlatSourceGraphV1,
 readOriginalDeviceExternalFlatSourceGraphProofsV1} from '../../accounts/authority/device-external-flat-source-graph-v1.mjs';
import {createFlatNativeExecution} from '../../execution/account/execution/flat-native-execution.mjs';
import {createOriginalDeviceExternalFlatGraphTlsServerV1} from '../../api/mobile/device-external-flat-note-http-v1.mjs';
import {assertOwnedFlatSystem} from '../deployments/system/deploy-system.mjs';
import {assertLocalEvm} from '../../chains/evm/runtime/local-evm-ownership.mjs';
import {assertOwnedFlatOperatorQuorum} from '../operators/claims/native-operators.mjs';
import {assertOwnedPrivateExternalRouterV1} from '../deployments/defi/deploy-private-external-router-v1.mjs';
import {isOwnedMetaMorphoGraphDeliveryObserverV1,prepareOwnedMetaMorphoGraphDescriptorV1} from '../../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';
import {assertOwnedEvmGraphDeliveryObserverV1} from '../../chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs';
import {createOwnedFlatMetaMorphoProviderV1} from '../../providers/evm-vault-provider.mjs';
const workspaces=new WeakMap(),services=new WeakMap(),fresh=()=>randomBytes(32).toString('hex'),bare=v=>v.slice(2);
const need=(v,c)=>assert.ok(v,c),exact=externalFlatExactV1;
function state(workspace){need(!types.isProxy(workspace),'DEVICE_EXTERNAL_GRAPH_WORKSPACE');const s=workspaces.get(workspace);need(s,'DEVICE_EXTERNAL_GRAPH_WORKSPACE');s.live();return s;}
export function assertOriginalDeviceExternalFlatGraphWorkspaceV1(workspace,input){
 assert.equal(arguments.length,2);need(input&&!types.isProxy(input),'DEVICE_EXTERNAL_GRAPH_WORKSPACE');const q=exact(input,['account','targetAccount']),s=state(workspace);
 assert.equal(q.account,s.account,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_BINDING');assert.equal(q.targetAccount,s.targetAccount,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_BINDING');return undefined;
}
/** Called only by the SAME original bridge after it has consumed device ACCESS.
 * D27 public inputs and provider context are checked again by original factories. */
export async function prepareOriginalDeviceExternalFlatGraphWorkspaceV1(workspace,bridge,input){
 assert.equal(arguments.length,3);const s=state(workspace);need(s.bridge===bridge&&!s.preparing&&!s.poisoned,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_BINDING');
 need(input&&!types.isProxy(input),'DEVICE_EXTERNAL_GRAPH_TERMS');const q=exact(input,['assetAmount','shareAmount','payoutAmount','validFrom','settleBefore']);
 for(const key of Object.keys(q))externalFlatUintV1(q[key]);for(const key of ['assetAmount','shareAmount','payoutAmount'])need(BigInt(q[key])>0n,'DEVICE_EXTERNAL_GRAPH_TERMS');
 need(BigInt(q.assetAmount)<=BigInt(s.maximumSolverInput),'DEVICE_EXTERNAL_GRAPH_EXPLICIT_SOLVER_ALLOWANCE');
 if(s.prepared){assert.deepEqual(q,s.terms,'DEVICE_EXTERNAL_GRAPH_TERMS_CHANGED');return s.prepared;}
 s.preparing=true;
 try{
  const {runtime,system,router,deliveryObserver,quorum,rule,rulePath,targetAccount}=s,now=await runtime.time(),cutoff=BigInt(q.settleBefore),until=cutoff-60n;
  need(BigInt(q.validFrom)<=now&&now+120n<cutoff&&until>BigInt(q.validFrom),'DEVICE_EXTERNAL_GRAPH_ORIGINAL_WINDOW');
  const proof=await consumeOriginalDeviceExternalFlatShareProofV1(targetAccount,{runtime,system,poolIndex:1,deliveryObserver,shareAmount:q.shareAmount,validFrom:q.validFrom,validUntil:until.toString()});
  const descriptor=prepareOwnedMetaMorphoGraphDescriptorV1({observer:deliveryObserver,router,route:{maximumInput:q.assetAmount,outputAmount:q.shareAmount,validFrom:q.validFrom,validUntil:until.toString()},ownerPublicInputs:[...proof.publicInputs]});
  await bindOriginalDeviceExternalFlatShareGraphV1(targetAccount,{runtime,system,router,deliveryObserver,descriptor});
  const directory=await mkdtemp(join(runtime.metadata.scratchDirectory,'device-external-graph-provider-'));await chmod(directory,0o700);const domain=system.pools[0].domain;
  s.provider=await createOwnedFlatMetaMorphoProviderV1({runtime,system,poolIndex:0,router,observer:deliveryObserver,operatorQuorum:quorum,rule,rulePath,descriptor,depositProof:proof.proof,
   terms:{scope:domain.scope,policy:domain.policy,asset:domain.asset,amount:q.shareAmount,executionFrom:q.validFrom,executionUntil:until.toString(),settleBefore:q.settleBefore},acceptedLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,directory,password:fresh()});
  const offer=s.provider.offer(),operationId=fresh(),expectedTerms={...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(k=>[k,domain[k]])),operationId,slot:0,evidencePolicy:offer.evidencePolicy,value:q.payoutAmount,settleBefore:q.settleBefore,actionTemplate:offer.actionTemplate};
  const recipientDirectory=await mkdtemp(join(runtime.metadata.scratchDirectory,'device-external-graph-recipient-'));await chmod(recipientDirectory,0o700);
  s.recipient=await createNativeRecipientProcess({mode:'create',path:join(recipientDirectory,'recipient.vault'),password:fresh(),expectedTerms,withdrawalRecipient:bare(system.sender)});
  const recipientOffer=await s.recipient.offer(),{settleBefore:_cutoff,...actionTemplate}=offer.actionTemplate;
  const fundingUntil=(now+1800n<cutoff-120n?now+1800n:cutoff-120n).toString(),preparation=createGenericBalanceNativePreparation({
   ...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(k=>[k,domain[k]])),operationId,fundingNotBefore:q.validFrom,fundingValidUntil:fundingUntil,settleBefore:q.settleBefore,
   nodes:[{id:'device-external-share-delivery',dependsOn:[],evidencePolicy:offer.evidencePolicy,actionTemplate,recipientOffer}]});
  const request=nativeRecipientInvoiceRequest(expectedTerms,recipientOffer,{action:preparation.nodes[0].action,deliveryRiskSalt:preparation.nodes[0].deliveryRiskSalt}),accepted=await s.recipient.acceptInvoice(request);
  await s.provider.bindQuote({recipientCustody:s.recipient});const quote=await s.recipient.acceptedQuote();assert.equal(quote.deliveryRiskSalt,preparation.nodes[0].deliveryRiskSalt,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_INVOICE');
  // Provider retains the authenticated invoice itself; no recipient reference
  // remains in its dispatcher. Drain the real invoice child before returning.
  const stopped=await s.recipient.close();need(stopped.exited&&stopped.exit.code===0&&stopped.exit.signal===null,'DEVICE_EXTERNAL_GRAPH_RECIPIENT_CLOSE');s.recipient=null;
  s.terms=structuredClone(q);s.prepared=Object.freeze({preparation,invoiceSignatures:Object.freeze([accepted.invoiceSignature]),providers:Object.freeze([Object.freeze({slot:0,family:'3',recipientIndex:1,rule,rulePath,deliveryRiskSalt:quote.deliveryRiskSalt,provider:s.provider})])});return s.prepared;
 }catch(error){s.poisoned=true;throw error;}finally{s.preparing=false;}
}
export async function createOriginalDeviceExternalFlatSourceGraphServiceV1(input){
 assert.equal(arguments.length,1);need(input&&!types.isProxy(input),'DEVICE_EXTERNAL_GRAPH_SERVICE');const v=exact(input,['account','targetAccount','runtime','system','quorum','router','deliveryObserver','rule','rulePath','maximumSolverInput','tls','host']);externalFlatUintV1(v.maximumSolverInput);need(BigInt(v.maximumSolverInput)>0n,'DEVICE_EXTERNAL_GRAPH_EXPLICIT_SOLVER_ALLOWANCE');
 await assertLocalEvm(v.runtime);assertOwnedFlatSystem(v.runtime,v.system);assertOwnedPrivateExternalRouterV1(v.router,{runtime:v.runtime,system:v.system,poolIndex:1});
 assertOwnedEvmGraphDeliveryObserverV1(v.deliveryObserver,{runtime:v.runtime,system:v.system,poolIndex:1});need(isOwnedMetaMorphoGraphDeliveryObserverV1(v.deliveryObserver),'DEVICE_EXTERNAL_GRAPH_FIXED_METAMORPHO');
 assertOwnedFlatOperatorQuorum(v.quorum,{runtime:v.runtime,system:v.system,nativeRuntime:v.deliveryObserver,family:'3'});
 const descriptor=assertOriginalDeviceExternalFlatNoteAuthorityV1(v.account),targetDescriptor=assertOriginalDeviceExternalFlatShareNoteAuthorityV1(v.targetAccount,{runtime:v.runtime,system:v.system,poolIndex:1,deliveryObserver:v.deliveryObserver});
 assert.equal(descriptor.origin,targetDescriptor.origin);assert.equal(descriptor.devicePublicKey,targetDescriptor.devicePublicKey);
 let closed=false,closing=false,closeWork=null,listener,execution;const proofs=[],s={...v,descriptor,targetDescriptor,bridge:null,prepared:null,terms:null,preparing:false,poisoned:false,provider:null,recipient:null,
  live(){need(!closed,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED');assert.deepEqual(assertOriginalDeviceExternalFlatNoteAuthorityV1(v.account),descriptor);assert.deepEqual(assertOriginalDeviceExternalFlatShareNoteAuthorityV1(v.targetAccount,{runtime:v.runtime,system:v.system,poolIndex:1,deliveryObserver:v.deliveryObserver}),targetDescriptor);}};
 const workspace=Object.freeze({descriptor,targetDescriptor,
  challenge(){assert.equal(arguments.length,0);need(!closing,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED');return s.bridge.challenge();},
  preparation(raw){assert.equal(arguments.length,1);need(!closing,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED');return s.bridge.preparation(raw);},
  review(raw){assert.equal(arguments.length,1);need(!closing,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED');return s.bridge.review(raw);},
  operate(raw){assert.equal(arguments.length,1);need(!closing,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED');return s.bridge.operate(raw);},
  outputQuote(raw){assert.equal(arguments.length,1);need(!closing,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED');return s.bridge.outputQuote(raw);},
  outputReview(raw){assert.equal(arguments.length,1);need(!closing,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED');return s.bridge.outputReview(raw);},
  outputOperate(raw){assert.equal(arguments.length,1);need(!closing,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED');return s.bridge.outputOperate(raw);},
  status(raw){assert.equal(arguments.length,1);need(!closing,'DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED');return s.bridge.status(raw);},
  close(){assert.equal(arguments.length,0);if(closeWork)return closeWork;closing=true;return closeWork=(async()=>{let first;const drain=async fn=>{try{await fn();}catch(e){first??=e;}};
   await drain(async()=>{if(s.bridge)await s.bridge.close();});await drain(async()=>{if(execution)await execution.close();});
   await drain(async()=>{if(s.recipient){const result=await s.recipient.close();need(result.exited&&result.exit.code===0&&result.exit.signal===null,'DEVICE_EXTERNAL_GRAPH_RECIPIENT_CLOSE');s.recipient=null;}});
   await drain(async()=>{if(s.provider){const result=await s.provider.close();need(result.closed,'DEVICE_EXTERNAL_GRAPH_PROVIDER_CLOSE');}});closed=true;if(first)throw first;return{closed:true,originalWorkDrained:true};})();}
 });workspaces.set(workspace,s);
 try{execution=await createFlatNativeExecution({runtime:v.runtime,system:v.system,poolIndex:0,bitcoin:null,solana:null,quorum:v.quorum,evmDelivery:v.deliveryObserver},{onProof:async frame=>proofs.push(structuredClone(frame))});
  s.bridge=await createOriginalDeviceExternalFlatSourceGraphV1({account:v.account,targetAccount:v.targetAccount,runtime:v.runtime,system:v.system,poolIndex:0,execution,workspace});
  listener=await createOriginalDeviceExternalFlatGraphTlsServerV1({account:v.account,targetAccount:v.targetAccount,workspace,tls:v.tls,host:v.host});
 }catch(error){await workspace.close().catch(()=>{});throw error;}
 let serviceClose;const service=Object.freeze({account:v.account,targetAccount:v.targetAccount,descriptor,targetDescriptor,url:listener.url,
  close(){assert.equal(arguments.length,0);return serviceClose??=(async()=>{let first;try{const result=await listener.close();need(result.closed&&result.ownedSocketsRemaining===0&&result.originalOperationsInFlight===0,'DEVICE_EXTERNAL_GRAPH_TLS_CLOSE');}catch(e){first=e;}try{await workspace.close();}catch(e){first??=e;}if(first)throw first;return{closed:true,ownedSocketsRemaining:0,originalOperationsInFlight:0,originalKeeperDrained:true};})();}
 });services.set(service,{workspace,bridge:s.bridge,proofs,live:s.live});return service;
}
export function readOriginalDeviceExternalFlatSourceGraphServiceProofsV1(service){
 assert.equal(arguments.length,1);need(!types.isProxy(service),'DEVICE_EXTERNAL_GRAPH_SERVICE');const s=services.get(service);need(s,'DEVICE_EXTERNAL_GRAPH_SERVICE');s.live();return[...readOriginalDeviceExternalFlatSourceGraphProofsV1(s.bridge),...s.proofs.map(v=>structuredClone(v))];
}
