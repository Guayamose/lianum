/** Explicit legacy-provider replacement before Source birth. Fixed physical
 * configuration, Original runtime/seed/compiled plan and server approval only.
 * The returned handles are live originals; DATA cannot reopen this product. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as N from '../../providers/paged-public-testnet-runtimes-v1.mjs';
import * as P from '../../providers/funded-paged-native-provider-v3.mjs';
export async function continueOriginalPagedPublicPartialBootstrapV5(input,signal=null){
 assert.ok(arguments.length===1||arguments.length===2);assert.ok(signal===null||signal instanceof AbortSignal,'SEPOLIA_PARTIAL_ABORT_SIGNAL');const active=()=>{if(signal?.aborted)throw Error('SEPOLIA_PARTIAL_BOOTSTRAP_ABORTED');};active();assert.deepEqual(Object.keys(input).sort(),['approval','checkpointSHA256','nativeDirectory','operatorConfigurationSHA256','operatorDirectory'].sort());let native,provider,receiver,system;const abort=()=>{receiver?.close().catch(()=>{});native?.close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});try{native=await N.createOriginalPagedPublicPartialBootstrapRuntimesV5(input);active();const bytes=await readFile(join(input.operatorDirectory,'operator.json'));active();assert.equal(createHash('sha256').update(bytes).digest('hex'),input.operatorConfigurationSHA256,'SEPOLIA_PARTIAL_CONFIGURATION_CHANGED');const configuration=JSON.parse(bytes.toString('utf8')),claim=await N.reserveOriginalPagedPublicPartialProviderBirthV5(native,{operatorDirectory:input.operatorDirectory,checkpointSHA256:input.checkpointSHA256,operatorConfigurationSHA256:input.operatorConfigurationSHA256,approval:input.approval}),providerDirectory=join(input.operatorDirectory,'provider-replacement-v5');active();provider=await P.createOriginalPagedPartialBootstrapPublicNativeProviderV5({directory:providerDirectory,journalPassword:configuration.journal.password},native,claim);active();receiver=await N.createOriginalPagedPublicSepoliaReceiverV4(native);active();system=await N.runOriginalPagedPublicPartialBootstrapV5(receiver,claim,configuration.journal.password);active();return Object.freeze({native,provider,receiver,system,configuration:Object.freeze({...configuration,providerDirectory}),transition:Object.freeze({profile:'ORIGINAL_PARTIAL_BOOTSTRAP_PROVIDER_REPLACEMENT_V5',legacyProviderRecovered:false,legacyProviderDirectory:configuration.providerDirectory,providerDirectory,reusedLibraryNonces:['0','1'],checkpointSHA256:input.checkpointSHA256,approval:Object.freeze({...input.approval}),sourcePolicyRenewed:false})});}catch(error){await receiver?.close().catch(()=>{});await provider?.close().catch(()=>{});await native?.close().catch(()=>{});throw error;}finally{signal?.removeEventListener('abort',abort);}
}

/** Same protected credentials, compiled plan and signed approval only. Existing
 * SIGNED/UNKNOWN wires are observed by the Original executor; never reposted. */
export async function reopenOriginalPagedPublicPartialBootstrapV5(input,signal=null){
 assert.ok(arguments.length===1||arguments.length===2);assert.ok(signal===null||signal instanceof AbortSignal,'SEPOLIA_PARTIAL_ABORT_SIGNAL');const active=()=>{if(signal?.aborted)throw Error('SEPOLIA_PARTIAL_BOOTSTRAP_ABORTED');};active();assert.deepEqual(Object.keys(input).sort(),['nativeDirectory','operatorDirectory']);let native,provider,receiver,system;const abort=()=>{receiver?.close().catch(()=>{});native?.close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});try{native=await N.reopenOriginalPagedPublicPartialBootstrapRuntimesV5(input);active();// Native holds the already authenticated token; reading a second reader while
 // its writer lock is active is forbidden. The fixed Native accessor below
 // exposes only its actual configuration/approval DATA, never its key handles.
 const saved=N.readOriginalPagedPublicPartialContinuationContextV5(native),configuration=saved.configuration,claim=N.reserveOriginalPagedPublicPartialContinuationV5(native),providerDirectory=saved.providerDirectory;active();provider=await P.reopenOriginalPagedPartialBootstrapPublicNativeProviderV5({directory:providerDirectory,journalPassword:configuration.journal.password},native,claim);active();receiver=await N.createOriginalPagedPublicSepoliaReceiverV4(native);active();system=await N.runOriginalPagedPublicPartialBootstrapV5(receiver,claim,configuration.journal.password);active();return Object.freeze({native,provider,receiver,system,configuration:Object.freeze({...configuration,providerDirectory}),transition:Object.freeze({profile:'ORIGINAL_PARTIAL_BOOTSTRAP_PROVIDER_REPLACEMENT_V5',legacyProviderRecovered:false,legacyProviderDirectory:configuration.providerDirectory,providerDirectory,reusedLibraryNonces:['0','1'],checkpointSHA256:saved.checkpointSHA256,approval:Object.freeze({...saved.approval}),sourcePolicyRenewed:false,reopened:true,automaticRebroadcast:false})});}catch(error){await receiver?.close().catch(()=>{});await provider?.close().catch(()=>{});await native?.close().catch(()=>{});throw error;}finally{signal?.removeEventListener('abort',abort);}
}

/** Complete the SAME explicit bootstrap, then open only the authenticated
 * Source observer. The fixed base policy may have expired; no SourceLane or
 * financial permission exists until a separate reviewed epoch is accepted. */
async function openPartialFinancialReview(input,signal,reopening){
 assert.ok(signal===null||signal instanceof AbortSignal,'SEPOLIA_PARTIAL_ABORT_SIGNAL');
 const active=()=>{if(signal?.aborted)throw Error('SEPOLIA_PARTIAL_BOOTSTRAP_ABORTED');};active();
 let opened;const abort=()=>{opened?.receiver.close().catch(()=>{});opened?.native.close().catch(()=>{});};
 signal?.addEventListener('abort',abort,{once:true});
 try{
  opened=await (reopening?reopenOriginalPagedPublicPartialBootstrapV5:continueOriginalPagedPublicPartialBootstrapV5)(input,signal);active();
  const original=N.readOriginalPagedPublicRuntimeContextV1(opened.native),policy={profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',keysetId:opened.native.metadata.keysetId,account:original.accounts[0].address,...opened.configuration.sourcePolicy};
  await N.reopenOriginalPagedPublicSepoliaSourceObserverV4(opened.receiver,policy);active();
  const state=await N.readOriginalPagedPublicSepoliaFinancialStateV5(opened.receiver);active();
  assert.equal(state.financialSigningEnabled,false,'SEPOLIA_PARTIAL_REVIEW_MUST_BE_OBSERVER');
  return Object.freeze({...opened,transition:Object.freeze({...opened.transition,financialReviewRequired:true,financialSigningEnabled:false})});
 }catch(error){await opened?.receiver.close().catch(()=>{});await opened?.provider.close().catch(()=>{});await opened?.native.close().catch(()=>{});throw error;}
 finally{signal?.removeEventListener('abort',abort);}
}
export async function continueOriginalPagedPublicPartialBootstrapForFinancialReviewV5(input,signal=null){assert.ok(arguments.length===1||arguments.length===2);return openPartialFinancialReview(input,signal,false);}
export async function reopenOriginalPagedPublicPartialBootstrapForFinancialReviewV5(input,signal=null){assert.ok(arguments.length===1||arguments.length===2);return openPartialFinancialReview(input,signal,true);}
