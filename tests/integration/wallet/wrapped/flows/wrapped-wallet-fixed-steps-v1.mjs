import { inspectWrappedInstallationSourcesV2 } from '../../../deployments/wrapped/wrapped-installation-source-inspector-v2.mjs';
/** Fixed SOL-custody -> genuine I84 graph -> original cSOL exits -> SOL
 * discharge. The second private graph recipient uses its original process;
 * the ordered unused BTC account is never relabeled as that recipient. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ownedWrappedWalletFixedFixtureV1 } from '../../../fixtures/wallet/wrapped/flows/wrapped-wallet-fixed-fixture-v1.mjs';
import { WRAPPED_WALLET_FIXED_RELEASE_V1, WRAPPED_WALLET_ECONOMICS_V1 as E } from '../validation/wrapped-wallet-fixed-policy-v1.mjs';
import { createWrappedWalletAcceptanceV1 } from './wrapped-wallet-acceptance-v1.mjs';
const bare=value=>value.slice(2),proof=value=>({proof:typeof value.proof==='string'?value.proof:Buffer.from(value.proof).toString('hex'),publicInputs:[...value.publicInputs]});
export async function runWrappedWalletFixedStepsV1(fixture,deadlineMs){assert.equal(arguments.length,2);return runFixedStepsV1(fixture,deadlineMs,'full');}
export async function runWrappedWalletFixedStepsUntilRecoveryV1(fixture,deadlineMs){assert.equal(arguments.length,2);return runFixedStepsV1(fixture,deadlineMs,'capture');}
export async function resumeWrappedWalletFixedStepsAfterRecoveryV1(fixture,deadlineMs){assert.equal(arguments.length,2);return runFixedStepsV1(fixture,deadlineMs,'resume');}
async function runFixedStepsV1(fixture,deadlineMs,phase){
 assert.equal(arguments.length,3);assert.ok(['full','capture','resume'].includes(phase));assert.ok(WRAPPED_WALLET_FIXED_RELEASE_V1,'WRAPPED_FIXED_NOT_RELEASED');
 const s=ownedWrappedWalletFixedFixtureV1(fixture),{runtime,system,graphNative}=s,owner=s.owners[1],caller=runtime.accounts[4];
 const {freshFixtureId,writeFixturePrivate}=await import('../../../fixtures/runners/owned-flat-fixture.mjs');
 const {claimDomainCommitment}=await import('../../../../../packages/backend/src/claims/protocol/framing.mjs');
 const {decodeDepositIntentInputs}=await import('../../../../../packages/backend/src/execution/account/preparation/deposit-intent.mjs');
 const {createOwnedNativeValueProviderCustody}=await import('../../../../../packages/backend/src/chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs');
 const {profileCommitment}=await import('../../../../../packages/backend/src/chains/shared/transfers/generic-native-value-v2.mjs');
 const {createWrappedFixedRecipientWithLifetimeV1}=await import('../../../fixtures/wallet/wrapped/flows/wrapped-wallet-fixed-fixture-v1.mjs');
 const {NATIVE_ADMISSION_LOSS_CLAUSE}=await import('../../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs');
 const check=()=>{inspectWrappedInstallationSourcesV2();assert.ok(Date.now()<deadlineMs,'WRAPPED_FIXED_ORIGINAL_DEADLINE');};
 const retained=[],retain=(label,relation,result)=>{const p=proof(result);retained.push({label,relation,proof:p});writeFixturePrivate(join(s.directory,'fixed-proof-'+label+'.json'),{label,relation,proof:p});return p;};
 let wallet;
 async function originalClaim(action,body){
  const before=s.solana.transfers.length;
  try{return await wallet.claim(action,body);}catch(error){
   // A single explicit original continuation is allowed only after the exact
   // one broadcast is independently observed. Never repeat a send/key action.
   assert.equal(error.message,'WRAPPED_ACCEPTANCE_EXPLICIT_ORIGINAL_RECONCILIATION_REQUIRED');
   if(error.claimRequest?.errorCode===null){
    // Original payout may return its incomplete retained ticket without an
    // exception. The exact API row then carries a null-code reconciliation.
    assert.equal(action,'redeem');assert.equal(error.claimRequest.state,'RECONCILIATION_REQUIRED');
    const status=await wallet.claimStatus(),rows=status.requests.filter(row=>row.requestId===body.requestId);assert.equal(rows.length,1);
    const request=rows[0];assert.equal(request.action,'redeem');assert.equal(request.state,'RECONCILIATION_REQUIRED');assert.equal(request.errorCode,null);
    assert.equal(request.result?.kind,'REDEEM');assert.equal(request.result.amount,body.amount);assert.equal(request.result.status,'UNKNOWN');
    const observed=await s.observer.read(),ticket=observed.gateways[1].tickets.find(row=>row.ticket.id===request.result.ticketId);
    assert.ok(ticket);assert.equal(ticket.state,'2');assert.equal(ticket.ticket.amount,body.amount);assert.equal(ticket.ticket.kind,'1');
    assert.equal(observed.gateways[1].activePayout,ticket.ticket.id);await s.observer.assertCurrent(observed);
   }else assert.equal(error.claimRequest?.errorCode,'CLAIM_NATIVE_FINALITY_UNRESOLVED');
   assert.equal(s.solana.transfers.length,before+1);const original=s.solana.transfers.at(-1);assert.equal(original.broadcastAttempts,1);
   assert.equal(original.route,action==='deposit'?'deposit':'redeem');
   const observed=await s.solana.observe(original.nativeId,{timeoutMs:Math.min(60000,Math.max(0,deadlineMs-Date.now()))});
   assert.equal(observed.status,'observed');assert.equal(observed.nativeWire,original.nativeWire);check();
   const ids=s.solana.transfers.map(row=>row.nativeId),counts=s.solana.transfers.map(row=>row.broadcastAttempts);
   const result=await wallet.claim('resume',{requestId:body.requestId});
   assert.deepEqual(s.solana.transfers.map(row=>row.nativeId),ids);assert.deepEqual(s.solana.transfers.map(row=>row.broadcastAttempts),counts);return result;
  }
 }
 async function claim(action,body){
  let failed=false;
  try{return await originalClaim(action,body);}catch(error){failed=true;throw error;}
  finally{
   // A session restart keeps its original journal but replaces its controller.
   // Terminal reconciliation and fixture cleanup must use that exact handle.
   try{s.controller=wallet.originalController();}catch(error){if(!failed)throw error;}
  }
 }
 if(phase!=='resume'){
 check();await owner.owner.prepareDepositIntent({amount:E.source,validFrom:String(await runtime.time()),validUntil:String(await runtime.time()+86400n),exitRecipient:bare(caller)});
 check();const d27=retain('deposit-intent','deposit_intent',await owner.ownerProof.proveDepositIntent());check();
 const handoff=await owner.owner.createNativeClaimIngressHandoff({claimDomain:claimDomainCommitment(system.claims.configs[1]),ingressProverIdentity:s.ingressProverIdentity,statement:decodeDepositIntentInputs(d27.publicInputs)});
 wallet=await createWrappedWalletAcceptanceV1({runtime,system,owners:s.owners,controller:s.controller,handoff,
  journal:{path:join(s.directory,'original-account.vault'),password:freshFixtureId()},deadlineMs});
 // Resource teardown can win the race with claim polling after a restart.
 // Adopt the session's current controller before fixture controller cleanup.
 s.resources.push(Object.freeze({async close(){
  let failed=false;
  try{await wallet.close();}catch(error){failed=true;throw error;}
  finally{try{s.controller=wallet.originalController();}catch(error){if(!failed)throw error;}}
 }}));

 assert.equal(s.privateLifetimeCredentialsStored,true,'WRAPPED_FIXED_DURABLE_INITIALIZATION_REQUIRED');s.nativeRetentionRequired=true;await claim('deposit',{requestId:'wrapped_sol_original_deposit',intentId:wallet.prepared.intentId});check();
 const issued=await s.controller.reconcile({operationId:wallet.prepared.intentId});assert.equal(issued.status,'ISSUED');assert.ok(issued.submission);
 await handoff.bindIssuance(issued.submission);assert.equal((await owner.owner.reconcileDepositIntent(issued.submission)).stage,'CONFIRMED');
 await wallet.audit();
 const now=await runtime.time(),cutoff=now+28800n,domain=system.pools[1].domain,operationId=freshFixtureId();
 const directory=join(graphNative.metadata.scratchDirectory,'original-wrapped-provider');mkdirSync(directory,{mode:0o700});
 const registration=system.adapterProfiles.find(row=>row.kind==='native-value');
 const custody=await createOwnedNativeValueProviderCustody({runtime,system,poolIndex:1,nativeRuntime:graphNative,bootstrap:s.bootstrap,
  profileCommitment:profileCommitment(registration.profile),recipientEndpoint:graphNative.accounts[1],
  terms:{scope:domain.scope,policy:domain.policy,asset:domain.asset,amount:E.graphNative,executionFrom:String(now),executionUntil:String(cutoff-60n),settleBefore:String(cutoff)},
  acceptedLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,directory,password:freshFixtureId()});s.providerCustody=custody;
 const offer=custody.offer(),recipient=await createWrappedFixedRecipientWithLifetimeV1(fixture,{mode:'create',path:join(s.directory,'original-recipient.vault'),password:freshFixtureId(),
  expectedTerms:{scope:domain.scope,policy:domain.policy,asset:domain.asset,hubDomain:domain.hubDomain,registryCommitment:domain.registryCommitment,
   operationId,slot:0,evidencePolicy:offer.evidencePolicy,value:E.payout,settleBefore:String(cutoff),actionTemplate:offer.actionTemplate},withdrawalRecipient:bare(caller)});s.resources.push(recipient);
 const {settleBefore:ignored,...actionTemplate}=offer.actionTemplate;
 await owner.owner.prepareAuthorization({changeRecipient:bare(caller),recoveryRecipient:bare(caller),nativeConfig:{
  ...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(k=>[k,domain[k]])),operationId,
  fundingNotBefore:String(now),fundingValidUntil:String(now+7200n),settleBefore:String(cutoff),
  nodes:[{id:'original-wrapped-evm-leg',dependsOn:[],evidencePolicy:offer.evidencePolicy,actionTemplate,recipientOffer:await recipient.offer()}]}});
 const invoices=await owner.owner.invoiceRequests();assert.equal(invoices.length,1);assert.equal(invoices[0].slot,0);
 const accepted=await recipient.acceptInvoice(invoices[0].invoice);await custody.bindQuote({recipientCustody:recipient});
 const deliveryRiskSalt=(await recipient.acceptedQuote()).deliveryRiskSalt;await owner.owner.authorize({invoiceSignatures:[accepted.invoiceSignature]});
 check();const authorization=retain('authorization','authorization',await owner.ownerProof.proveAuthorization()),rolePackets={};check();
 for(const name of ['reservation','recovery','assembler'])rolePackets[name]=(await owner.roles[name]()).select();
 for(const name of ['local','dependency']){rolePackets[name]=[];for(let slot=0;slot<4;slot++)rolePackets[name].push((await owner.roles[name](slot)).select());}
 const ref=freshFixtureId(),account=wallet.accounts[1];
 await account.ownerActions.registerGraph({ownerOperationRef:ref,prepared:{authorization,rolePackets},providers:[{slot:0,custody,deliveryRiskSalt}]});
 const approval=await account.ownerActions.approveManualWrappedGraph({requestId:'wrapped_sol_original_graph',ownerOperationRef:ref});
 await wallet.bindOriginalRecipient({recipient,provider:custody,approval});
 const body=wallet.bindManualGraph(approval);await wallet.graph('prepare',body);await wallet.graph('execute',{requestId:body.requestId});await wallet.graph('reconcile',{requestId:body.requestId});check();
 const execution=wallet.executions[1].snapshot(ref);assert.equal(execution.outcome,'FULFILLED');assert.equal(execution.admittedReceipts,1);
 assert.deepEqual(execution.nativeExposure,[{slot:0,family:'3',status:'ADMITTED'}]);await wallet.audit();
 s.cycleRecoveryContext=Object.freeze({schema:'WRAPPED_ORIGINAL_GRAPH_FULFILLED_CONTINUATION_V1',wallet,recipient,provider:custody,
  proofs:retained.map(({proof:p,...row})=>({...row,publicInputs:p.publicInputs})),stage:'GRAPH_FULFILLED_BEFORE_WITHDRAWAL'});
 }else{
  assert.ok(s.recovered&&s.recoveryWallet,'WRAPPED_FIXED_ORIGINAL_COLD_WALLET_REQUIRED');
  assert.equal(s.recoveredLifecyclePhase,'GRAPH_FULFILLED_BEFORE_WITHDRAWAL');assert.ok(Array.isArray(s.recoveredStepProofs));wallet=s.recoveryWallet;await wallet.audit();check();
 }
 if(phase==='capture')return {pausedForRecovery:true,oneSharedApplication:true,proofs:structuredClone(s.cycleRecoveryContext.proofs),fullWalletAcceptance:false};
 // Resume the same original source process only; no replacement root/key.
 if(!owner.report().available){const original=owner.report();await owner.restart();const reopened=owner.report();
  assert.equal(reopened.processIdentitySHA256,original.processIdentitySHA256);assert.equal(reopened.generation,original.generation+1);}
 for(const [role,requestId,amount]of [['recipient','wrapped_original_recipient_exit',E.payout],['change','wrapped_original_change_exit',E.change]]){
  const offers=await wallet.withdrawalOffers(),offer=offers.find(row=>row.terms.role===role);assert.ok(offer,'WRAPPED_FIXED_ORIGINAL_WITHDRAWAL_OFFER');
  assert.equal(offer.terms.amount,amount);assert.equal(offer.terms.recipient,bare(caller));
  const prepare={requestId,role,termsSHA256:offer.termsSHA256},before=runtime.transactions.length;
  assert.deepEqual(await wallet.cancelWithdrawalReview(prepare),{cancelled:true,sent:false});assert.equal(runtime.transactions.length,before);
  await wallet.withdraw('prepare',prepare);await wallet.withdraw('execute',{requestId,termsSHA256:offer.termsSHA256});
  const sent=runtime.transactions.length;await wallet.withdraw('reconcile',{requestId,termsSHA256:offer.termsSHA256});assert.equal(runtime.transactions.length,sent);
 }
 assert.equal(await system.pools[1].assetCapability.balance(caller),BigInt(E.source));
 await claim('redeem',{requestId:'wrapped_sol_original_redemption',amount:E.source,maxFee:system.claims.configs[1].refundMaxFee});
 await wallet.audit();check();return {oneSharedApplication:true,evidence:wallet.evidence(),proofs:phase==='resume'?structuredClone(s.recoveredStepProofs):retained.map(({proof:p,...row})=>({...row,publicInputs:p.publicInputs}))};
}
