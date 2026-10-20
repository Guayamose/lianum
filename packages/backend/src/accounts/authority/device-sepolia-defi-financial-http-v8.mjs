/** Financial routes over the SAME Original share account and Native receiver.
 * HTTP can select an existing job; only its retained signed review/proof slot
 * can issue a command. Lost replies observe the original Source journal. */
import assert from 'node:assert/strict';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {normalizeDeviceSepoliaDefiFinancialStatusV7} from '@lianum/mobile-protocol/device/sepolia-defi-financial-status-v7';
import * as A from './device-sepolia-defi-shares-authority-v4.mjs';
import * as Native from '../../providers/paged-public-testnet-runtimes-v1.mjs';

/** Unmounted legacy dispatchers remain fenced. A signed reception proof alone
 * cannot authorize provider capital; only the private Source7 mount proceeds. */
export function assertOriginalDeviceSepoliaDefiPaegCapitalV8(){assert.equal(arguments.length,0);assert.fail('SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED');}
const originals=new WeakMap();
const prefix='/v1/mobile/sepolia-defi-shares/',names=new Set(['financial-submit','financial-observe','withdrawal-review','withdrawal-arm','redeem-submit']);
export function isDeviceSepoliaDefiFinancialHttpRouteV8(path){return typeof path==='string'&&path.startsWith(prefix)&&names.has(path.slice(prefix.length));}

export function createOriginalDeviceSepoliaDefiFinancialHttpV8(runtime,account){
 assert.equal(arguments.length,2);const binding=A.readOriginalDeviceSepoliaDefiSharesBindingV8(runtime,account),descriptor=P.normalizeExternalFlatDescriptorV1(account.descriptor);
 let closed=false,closing,work=Promise.resolve(),queued=0,timer=null,kick=null,workerRunning=false;const source={provider:null,Core:null};
 const current=()=>{assert.ok(!closed,'SEPOLIA_DEFI_FINANCIAL_HTTP_CLOSED');assert.deepEqual(A.readOriginalDeviceSepoliaDefiSharesBindingV8(runtime,account),binding,'SEPOLIA_DEFI_FINANCIAL_HTTP_BINDING');};
 function requireSource(){current();if(!source.provider)assertOriginalDeviceSepoliaDefiPaegCapitalV8();const scope=source.Core.readOriginalPagedPublicNativeSepoliaDefiScopeV8(source.provider);assert.strictEqual(scope.runtime,runtime,'SEPOLIA_DEFI_FINANCIAL_SOURCE_RUNTIME');assert.strictEqual(account,binding.protocol==='AAVE_STATIC'?scope.aaveAccount:scope.morphoAccount,'SEPOLIA_DEFI_FINANCIAL_SOURCE_ACCOUNT');return scope;}
 function serial(fn){current();assert.ok(queued<8,'SEPOLIA_DEFI_FINANCIAL_HTTP_QUEUE');queued++;const task=work.then(()=>{current();return fn();}).finally(()=>queued--);work=task.catch(()=>{});return task;}
 function result(raw,data,kind){const value=normalizeDeviceSepoliaDefiFinancialStatusV7(raw);assert.equal(value.jobId,data.job.jobId);assert.equal(value.reference,data.review.reference);assert.equal(value.protocol,binding.protocol);assert.equal(value.kind,kind);return value;}
 async function observe(data,kind){return result(await Native.observeOriginalPagedPublicSepoliaDefiCommandV8(runtime,account,data.job.jobId,kind),data,kind);}
 async function execute(data,kind,command){return result(await Native.executeOriginalPagedPublicSepoliaDefiCommandV8(runtime,command),data,kind);}
 function slot(data){return A.originalDeviceSepoliaDefiSharesProofSlotV4(account,data.job.jobId);}
 function redeemReview(data){assert.equal(data.job.mode,'withdraw_balance');assert.equal(data.review.action,'REDEEM');}
 async function redeem(data){
  redeemReview(data);
  if(data.financial.redemption?.dispatchLatched)return observe(data,'REDEEM');
  const withdrawal=await observe(data,'WITHDRAW');
  // The canonical Native observation, never a client hash or receipt DTO,
  // decides whether the already approved redemption may be prepared.
  if(withdrawal.phase!=='CONFIRMED')return withdrawal;
  const command=await A.prepareOriginalDeviceSepoliaDefiRedeemCommandV4(slot(data),withdrawal.transactionHash);return execute(data,'REDEEM',command);
 }
 async function dispatch(path,payload){
  assert.ok(isDeviceSepoliaDefiFinancialHttpRouteV8(path),'SEPOLIA_DEFI_FINANCIAL_HTTP_ROUTE');
  if(path!==prefix+'financial-observe')requireSource();
  return serial(async()=>{
   const action=path.slice(prefix.length),fields=['access','signature','reference','jobId',...(path===prefix+'financial-submit'?['capitalNodeId']:[])];P.externalFlatExactV1(payload,action==='withdrawal-arm'?[...fields,'consent','consentSignature']:fields);
   const authenticate=action==='financial-submit'?A.requestOriginalDeviceSepoliaDefiFinancialIntentV8:A.authorizeOriginalDeviceSepoliaDefiFinancialAccessV8;
   const data=await authenticate(account,Object.fromEntries(fields.map(key=>[key,payload[key]])));
   assert.deepEqual(data.descriptor,descriptor);assert.equal(data.protocol,binding.protocol);assert.equal(data.job.jobId,payload.jobId);assert.equal(data.review.reference,payload.reference);assert.equal(data.job.reviewReference,payload.reference);
   if(action==='financial-observe')return observe(data,data.financial.kind);
   if(action==='financial-submit'){
    assert.equal(data.job.mode,'deposit_intent');assert.equal(data.review.action,'INVEST');
    if(data.financial.submission?.dispatchLatched||data.job.stage!=='PROVED')return observe(data,'INVEST');
    assert.equal(data.job.financialRequested,true,'SEPOLIA_DEFI_FINANCIAL_INTENT_REQUIRED');assert.equal(data.job.capitalNodeId,payload.capitalNodeId,'SEPOLIA_DEFI_CAPITAL_NODE_REBOUND');requireSource();await source.Core.bindOriginalPagedPublicNativeSepoliaDefiPreparationV8(source.provider,slot(data),{id:data.job.capitalNodeId});return normalizeDeviceSepoliaDefiFinancialStatusV7({jobId:data.job.jobId,reference:data.review.reference,phase:'PREPARED',transactionHash:null,canonical:false,protocol:binding.protocol,kind:'INVEST'});
   }
   redeemReview(data);
   if(action==='withdrawal-review'){await warmBeforeChallenge();return{consent:await A.challengeOriginalDeviceSepoliaDefiWithdrawalV4(slot(data))};}
   if(action==='withdrawal-arm'){
    if(data.financial.submission?.dispatchLatched||data.job.stage!=='PROVED')return observe(data,'WITHDRAW');
    const command=await A.armOriginalDeviceSepoliaDefiWithdrawalCommandV4(slot(data),payload.consent,payload.consentSignature);return execute(data,'WITHDRAW',command);
   }
   return redeem(data);
  });
 }
 async function runApprovedPending(){
  requireSource();
  return serial(async()=>{const rows=await A.readOriginalDeviceSepoliaDefiPendingV8(account);let observed=0,redemptionsStarted=0,failures=0;
   for(const data of rows){
    try{
     assert.deepEqual(data.descriptor,descriptor);assert.equal(data.protocol,binding.protocol);
     // INVEST requires the reserved graph's Original READY. HTTP's worker
     // can observe a submission but cannot mint a capital command.
     if(!data.financial.submission?.dispatchLatched&&!data.financial.redemption?.dispatchLatched)continue;
     if(data.job.mode==='deposit_intent'){if(data.job.stage!=='CONFIRMED'){await observe(data,'INVEST');observed++;}continue;}
     if(data.financial.redemption?.dispatchLatched){if(data.financial.redemption.phase!=='CONFIRMED'){await observe(data,'REDEEM');observed++;}continue;}
     const withdrawal=await observe(data,'WITHDRAW');observed++;
     if(withdrawal.phase!=='CONFIRMED')continue;
     const head=await runtime.block(),now=BigInt(head.timestamp);await runtime.assertCanonical(head);
     if(now<BigInt(data.review.validFrom)||now>=BigInt(data.review.validUntil))continue;
     const command=await A.prepareOriginalDeviceSepoliaDefiRedeemCommandV4(slot(data),withdrawal.transactionHash);await execute(data,'REDEEM',command);redemptionsStarted++;
    }catch{failures++;}
   }
   return Object.freeze({observed,redemptionsStarted,failures});
  });
 }
 function background(){if(workerRunning||closed)return;workerRunning=true;runApprovedPending().catch(()=>{}).finally(()=>{workerRunning=false;});}
 function scheduleApprovedWork(){if(kick||closed)return;kick=setImmediate(()=>{kick=null;background();});kick.unref?.();}
 async function warmBeforeChallenge(){requireSource();await source.Core.warmOriginalPagedPublicNativeSepoliaDefiDispatchV8(source.provider);await A.assertOriginalDeviceSepoliaDefiFinancialAccountV8(account);}
 const dispatcher=Object.freeze({descriptor,dispatch,runExclusive:serial,runApprovedPending,assertPaegSource:requireSource,warmBeforeChallenge,warmAfterProof:warmBeforeChallenge,
  startApprovedWorker(){assert.equal(arguments.length,0);current();if(!source.provider)return;requireSource();source.Core.startOriginalPagedPublicNativeSepoliaDefiDispatchV8(source.provider);if(!timer){timer=setInterval(background,5000);timer.unref?.();}scheduleApprovedWork();},
  async close(){if(closing)return closing;closed=true;clearInterval(timer);clearImmediate(kick);timer=null;kick=null;return closing=(async()=>{await work;})();},
 });originals.set(dispatcher,{runtime,account,binding,current,source,assertIdle(){assert.equal(queued,0,'SEPOLIA_DEFI_FINANCIAL_MOUNT_BUSY');}});return dispatcher;
}

/** Only an actual Source7 provider can enable this existing dispatcher. A
 * descriptor/Boolean never mounts capital or creates an investment command. */
export async function mountOriginalDeviceSepoliaDefiFinancialSourceV8(dispatcher,provider){assert.equal(arguments.length,2);const s=originals.get(dispatcher);assert.ok(s,'SEPOLIA_DEFI_ORIGINAL_FINANCIAL_HTTP');s.current();s.assertIdle();const Core=await import('../../providers/funded-paged-native-provider-v3.mjs'),scope=Core.readOriginalPagedPublicNativeSepoliaDefiScopeV8(provider);assert.strictEqual(scope.runtime,s.runtime,'SEPOLIA_DEFI_FINANCIAL_SOURCE_RUNTIME');assert.strictEqual(s.account,s.binding.protocol==='AAVE_STATIC'?scope.aaveAccount:scope.morphoAccount,'SEPOLIA_DEFI_FINANCIAL_SOURCE_ACCOUNT');s.current();s.assertIdle();assert.ok(!s.source.provider||s.source.provider===provider,'SEPOLIA_DEFI_FINANCIAL_SOURCE_REBOUND');s.source.provider=provider;s.source.Core=Core;return dispatcher;}
