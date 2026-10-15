/** Recovery acceptance for an EXISTING original public ETH -> BTC graph.
 * This consumer never creates a wallet, funds a deposit, starts/rearms an
 * automation or sends a native payment. It uses the actual SDK and custody.
 * The preceding acceptance must stop after command eight and before BTC.
 */
import assert from 'node:assert/strict';
import {assertPublicThreeNetworkHostCustodyV4,publicThreeNetworkSdkUrlV4} from './public-three-network-host-custody-v4.mjs';
import * as P from '../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {validateNativeAddressV1} from '../../packages/crypto/src/native-wallet-v1.mjs';

const originalPreparations=new WeakMap();
export async function prepareOriginalPublicPartialRecoveryV4(host,input){
 assertPublicThreeNetworkHostCustodyV4(host);
 P.pagedOwnerExactV3(input,['connection','graphId','authorizationRoot','budgetWei','changeWei','recoveryRecipient',...(Object.hasOwn(input,'maximumWaitMs')?['maximumWaitMs']:[])]);
 assert.match(input.graphId,/^[a-z0-9-]{8,100}$/);P.pagedOwnerHexV3(input.authorizationRoot);
 for(const key of ['budgetWei','changeWei'])P.pagedOwnerUintV3(input[key]);
 validateNativeAddressV1('ethereum-sepolia',input.recoveryRecipient);
 const maximumWaitMs=input.maximumWaitMs??6*3600000;
 assert.ok(Number.isSafeInteger(maximumWaitMs)&&maximumWaitMs>=60000&&maximumWaitMs<=6*3600000);
 const Transport=await import(publicThreeNetworkSdkUrlV4('api/device-paged-connection-transport-v3.ts'));
 const Keys=await import(publicThreeNetworkSdkUrlV4('custody/key-store.ts'));
 const connection=Transport.parseDevicePagedConnectionProfileV3(JSON.stringify(input.connection)),d=connection.descriptor;
 assert.equal(d.chainId,'11155111');assert.equal(d.genesis,'25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9');
 assert.equal(d.devicePublicKey,await Keys.readDevicePublicKey());
 const token=Object.freeze(Object.create(null));
 originalPreparations.set(token,{host,input:structuredClone(input),connection,maximumWaitMs,running:false,closed:false});
 return Object.freeze({token,review:Object.freeze({profile:'ORIGINAL_PUBLIC_PARTIAL_RECOVERY_ACCEPTANCE_V4',custody:host.profile,androidBiometrics:false,graphId:input.graphId,authorizationRoot:input.authorizationRoot,budgetWei:input.budgetWei,changeWei:input.changeWei,recoveryRecipient:input.recoveryRecipient,nativePolicy:'RETAIN_ETH_DELIVERY_REQUIRE_BTC_NOT_SENT',providerPayout:'NONE',cutoff:'ORIGINAL_CANONICAL_CHAIN_TIME',financialActionStarted:false})});
}

export async function runOriginalPublicPartialRecoveryV4(token,{signal,onProgress}={}){
 const s=originalPreparations.get(token);assert.ok(s&&!s.running&&!s.closed,'PUBLIC_PARTIAL_ORIGINAL_PREPARATION');
 assertPublicThreeNetworkHostCustodyV4(s.host);assert.ok(signal===undefined||signal instanceof AbortSignal);assert.ok(onProgress===undefined||typeof onProgress==='function');
 const Keys=await import(publicThreeNetworkSdkUrlV4('custody/key-store.ts'));
 const Session=await import(publicThreeNetworkSdkUrlV4('custody/wallet-session-v1.ts'));
 const Views=await import(publicThreeNetworkSdkUrlV4('custody/device-paged-custody-views-v3.mjs'));
 const V=await import(publicThreeNetworkSdkUrlV4('custody/device-paged-note-vault-v3.ts'));
 const G=await import(publicThreeNetworkSdkUrlV4('api/device-paged-graph-api-v3.mjs'));
 const T=await import(publicThreeNetworkSdkUrlV4('api/device-paged-connection-transport-v3.ts'));
 const d=s.connection.descriptor,controller=new AbortController(),started=performance.now(),events=[];
 const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 const timer=setTimeout(cancel,s.maximumWaitMs);let transport,graph,vault,latest=null,ethereumId=null,recoveryAuthorization=null;
 const live=()=>{assertPublicThreeNetworkHostCustodyV4(s.host);assert.ok(!controller.signal.aborted&&performance.now()-started<s.maximumWaitMs,'PUBLIC_PARTIAL_WAIT_EXPIRED');assert.ok(P.devicePagedNowV3()<d.deadlineMs,'PUBLIC_PARTIAL_SOURCE_EXPIRED');};
 const wait=ms=>new Promise((resolve,reject)=>{const t=setTimeout(done,ms);function done(){controller.signal.removeEventListener('abort',stop);resolve();}function stop(){clearTimeout(t);controller.signal.removeEventListener('abort',stop);reject(Error('PUBLIC_PARTIAL_ABORTED'));}controller.signal.addEventListener('abort',stop,{once:true});if(controller.signal.aborted)stop();});
 const progress=async(stage,details={})=>{live();const value=Object.freeze({stage,atUTC:new Date().toISOString(),...details});events.push(value);if(onProgress){let stop;try{await Promise.race([Promise.resolve().then(()=>onProgress(value)),new Promise((_,reject)=>{stop=()=>reject(Error('PUBLIC_PARTIAL_ABORTED'));controller.signal.addEventListener('abort',stop,{once:true});if(controller.signal.aborted)stop();})]);}finally{controller.signal.removeEventListener('abort',stop);}}live();};
 async function graphCommand(action,body,authorization=null){
  live();const draft=await vault.graphCommand(action,body);let reply;
  try{const c=await graph.challenge(draft.action,draft.graphId,draft.jobId,draft.rootId,draft.revision,draft.command);await vault.latchGraph(c);const signature=await Keys.signDevicePagedGraphPermissionV3(c,d.origin,d.pairingId,controller.signal,(action==='RECOVER_CUTOFF'?recoveryAuthorization:authorization)?{authorization:action==='RECOVER_CUTOFF'?recoveryAuthorization:authorization,command:draft.command}:undefined);
   reply=await graph.submit(c,signature,draft.command);G.readDevicePagedGraphReplyV3(reply);await vault.acceptGraphReply(reply);latest=reply.status;live();return reply;}
  catch(error){P.pagedOwnerWipeV3(reply?.private);throw error;}
  finally{P.pagedOwnerWipeV3(draft.command);}
 }
 async function command(action,body,authorization=null){const reply=await graphCommand(action,body,authorization);try{return structuredClone(reply.private);}finally{P.pagedOwnerWipeV3(reply.private);}}
 function bindGraph(){assert.equal(latest.graphId,s.input.graphId);assert.equal(latest.authorizationRoot,s.input.authorizationRoot);assert.equal(latest.nodes,'2');assert.equal(latest.budget,s.input.budgetWei);}
 async function economic(){const request=await vault.graphEconomicOperationRequest();let value;try{value=await command('READ_ECONOMIC_OPERATION',request);const view=value.view??value,rows=view.rows;assert.ok(Array.isArray(rows)&&rows.length===2,'PUBLIC_PARTIAL_ORIGINAL_ROWS');assert.deepEqual(rows.map(r=>r.id),['ethereum','bitcoin']);assert.equal(rows[0].quote.terms.deliver.networkId,'ethereum-sepolia');assert.equal(rows[1].quote.terms.deliver.networkId,'bitcoin-testnet');assert.equal(rows[0].attempt.stage,'MINED');assert.match(rows[0].attempt.nativeId,/^0x[0-9a-f]{64}$/);assert.equal(rows[1].attempt.stage,'NOT_SENT','PUBLIC_PARTIAL_BITCOIN_ALREADY_SENT');assert.equal(rows[1].attempt.nativeId,null);if(ethereumId===null)ethereumId=rows[0].attempt.nativeId;else assert.equal(rows[0].attempt.nativeId,ethereumId,'PUBLIC_PARTIAL_ORIGINAL_ETH_CHANGED');bindGraph();return structuredClone(view);}
  finally{P.pagedOwnerWipeV3(request);P.pagedOwnerWipeV3(value);}}
 async function observeUntil(predicate,stage,proofAuthorization=null){for(let n=0;n<12000;n++){let reply;try{reply=await graphCommand('OBSERVE_GRAPH',{});bindGraph();if(predicate(latest,reply.private)){if(proofAuthorization)Session.bindWalletSessionPagedWithdrawalProofV1(proofAuthorization,reply);return structuredClone(reply.private);}await progress(stage,{phase:latest.phase,pending:latest.pending});}catch(error){if(error?.message!=='MOBILE_PAGED_GRAPH_SERVICE_UNAVAILABLE')throw error;await progress(stage,{responseUnconfirmed:true,financialActionRepeated:false});}finally{P.pagedOwnerWipeV3(reply?.private);}await wait(5000);}throw Error('PUBLIC_PARTIAL_OBSERVATION_LIMIT');}
 s.running=true;
 try{
  assert.equal(Session.walletSessionStatusV1().active,true,'PUBLIC_PARTIAL_MANAGED_SESSION_REQUIRED');
  live();transport=await T.createDevicePagedConnectionTransportV3(s.connection,controller.signal);graph=G.createDevicePagedGraphApiV3({descriptor:d,fetchImpl:transport.fetchImpl});
  vault=await V.openExistingDevicePagedCustodyV3(d,'GRAPH',controller.signal);
  assert.equal((await vault.graphSummary())?.graphId,s.input.graphId,'PUBLIC_PARTIAL_EXISTING_GRAPH_REQUIRED');
  const initial=await command('OBSERVE_GRAPH',{});try{bindGraph();assert.ok(['RESERVED','RECOVERED'].includes(latest.phase)&&!latest.pending,'PUBLIC_PARTIAL_QUIESCENT_GRAPH_REQUIRED');if(latest.phase==='RESERVED'){assert.equal(initial.execution?.completed,'1');assert.equal(initial.execution?.currentNodeId,'bitcoin');}}
  finally{P.pagedOwnerWipeV3(initial);}
  const first=await economic();P.pagedOwnerWipeV3(first);
  if(latest.phase==='RESERVED'){
   const automation=await vault.graphAutomationStatus();assert.ok(automation?.current&&automation.terms.maxCommands===8&&automation.commandsUsed===8,'PUBLIC_PARTIAL_ORIGINAL_QUOTA_REQUIRED');
   if(!automation.revoked){let result;try{result=await command('STOP_AUTOMATION',{});}catch(error){if(!graph.isUnconfirmedReply(error))throw error;await progress('stop-response-unconfirmed',{financialActionRepeated:false});}finally{P.pagedOwnerWipeV3(result);}}
   await observeUntil((_status,value)=>value.automation?.revoked===true,'waiting-stop-confirmation');
   await observeUntil(status=>typeof status.blockTimestamp==='string'&&BigInt(status.blockTimestamp)>=BigInt(status.settleBefore),'waiting-original-cutoff');
   const before=await economic();P.pagedOwnerWipeV3(before);assert.equal(latest.phase,'RESERVED');assert.ok(BigInt(latest.blockTimestamp)>=BigInt(latest.settleBefore));
   const recoveryReply=await graphCommand('OBSERVE_GRAPH',{});try{recoveryAuthorization=await Session.approveWalletSessionPagedCutoffRecoveryV5(await vault.graphCutoffRecoveryReview(recoveryReply),controller.signal);}finally{P.pagedOwnerWipeV3(recoveryReply.private);}
   let recovered;try{recovered=await command('RECOVER_CUTOFF',{});}catch(error){if(!graph.isUnconfirmedReply(error))throw error;await progress('recovery-response-unconfirmed',{financialActionRepeated:false});}finally{P.pagedOwnerWipeV3(recovered);}
   await observeUntil(status=>status.phase==='RECOVERED'&&!status.pending,'recovery-pending');
  }
  let terminal=await economic();try{assert.equal(terminal.settlement.outcome,'PARTIAL');assert.equal(terminal.settlement.budgetDisposition,'OWNER_RECOVERY_NOTE_ISSUED');assert.equal(terminal.settlement.retainedConfirmedDeliveryCount,'1');assert.equal(terminal.ledger.outcome,'3');}finally{P.pagedOwnerWipeV3(terminal);}
  const retainedOptions=await vault.graphWithdrawalOptions();assert.deepEqual(retainedOptions.map(row=>row.role).sort(),['change','recovery']);
  await progress('recovered-before-withdrawals',{phase:latest.phase,graphId:latest.graphId,rootId:latest.rootId,revision:latest.revision,authorizationRoot:latest.authorizationRoot,budgetWei:latest.budget,settleBefore:latest.settleBefore,retainedEthereumNativeId:ethereumId,providerPayoutWei:'0',outputs:retainedOptions.map(row=>({role:row.role,amount:row.amount,withdrawn:row.withdrawn}))});
  for(const role of ['change','recovery']){
   const options=await vault.graphWithdrawalOptions();assert.deepEqual(options.map(r=>r.role).sort(),['change','recovery']);const option=options.find(r=>r.role===role);assert.equal(option.amount,role==='change'?s.input.changeWei:s.input.budgetWei);if(option.withdrawn)continue;
   const binding=Views.readDevicePagedWithdrawalOptionV3(option),authorization=await Session.approveWalletSessionPagedWithdrawalV1(d,{graphId:binding.graphId,rootId:binding.rootId,revision:binding.revision,role,id:null,recipient:s.input.recoveryRecipient,amount:binding.amount,nullifier:binding.nullifier},controller.signal,option);
   let request,signed;try{
    request=await graphCommand('READ_OUTPUT',{role,id:null,recipient:s.input.recoveryRecipient});
    signed=await vault.graphOutputCommand();Session.bindWalletSessionPagedWithdrawalV1(authorization,request,signed);P.pagedOwnerWipeV3(request.private);request=null;
    try{const proofReply=await graphCommand('PROVE_OUTPUT_W39',signed,authorization);try{if(proofReply.status.job?.stage==='PROVED')Session.bindWalletSessionPagedWithdrawalProofV1(authorization,proofReply);}finally{P.pagedOwnerWipeV3(proofReply.private);}}catch(error){if(!graph.isUnconfirmedReply(error))throw error;await progress('withdrawal-proof-response-unconfirmed',{role,proofRepeated:false});}
    P.pagedOwnerWipeV3(signed);signed=null;
    await observeUntil(status=>!status.pending&&status.job?.mode==='withdraw'&&status.job.stage==='PROVED','recovery-withdrawal-proof',authorization);
    const next=await command('NEXT_COMMAND',{});try{assert.equal(next.action,'WITHDRAW_OUTPUT_W39');let result;try{result=await command(next.action,next.command,authorization);}catch(error){if(!graph.isUnconfirmedReply(error))throw error;await progress('withdrawal-response-unconfirmed',{role,financialActionRepeated:false});}finally{P.pagedOwnerWipeV3(result);}}finally{P.pagedOwnerWipeV3(next);}
    await observeUntil(status=>!status.pending&&status.job?.mode==='withdraw'&&status.job.stage==='CONFIRMED','recovery-withdrawal-pending');
   }finally{P.pagedOwnerWipeV3(request?.private);P.pagedOwnerWipeV3(signed);Session.closeWalletSessionAuthorizationV1(authorization);}
  }
  assert.ok((await vault.graphWithdrawalOptions()).every(option=>option.withdrawn),'PUBLIC_PARTIAL_WITHDRAWALS_UNCONFIRMED');
  terminal=await economic();try{assert.equal(terminal.settlement.outcome,'PARTIAL');assert.equal(terminal.ledger.outcome,'3');}finally{P.pagedOwnerWipeV3(terminal);}
  await progress('closed',{phase:'RECOVERED',delivered:1,unsent:1});
  return Object.freeze({profile:'ORIGINAL_PUBLIC_PARTIAL_RECOVERY_ACCEPTANCE_V4',custody:s.host.profile,androidBiometrics:false,graphId:s.input.graphId,authorizationRoot:s.input.authorizationRoot,phase:'RECOVERED',outcome:'PARTIAL',retainedEthereumNativeId:ethereumId,bitcoinNativeId:null,budgetRecoveredWei:s.input.budgetWei,changeRecoveredWei:s.input.changeWei,providerPayoutWei:'0',crossChainRollback:false,events:Object.freeze(events)});
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();if(recoveryAuthorization)Session.closeWalletSessionAuthorizationV1(recoveryAuthorization);await graph?.close();await transport?.close();await vault?.close();s.running=false;}
}
export function closeOriginalPublicPartialRecoveryV4(token){const s=originalPreparations.get(token);assert.ok(s&&!s.running);s.closed=true;}
