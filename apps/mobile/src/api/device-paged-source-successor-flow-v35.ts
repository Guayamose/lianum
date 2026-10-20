import {createDevicePagedSourceSuccessorApiV35} from './device-paged-source-successor-api-v35.mjs';
import {readDevicePagedSourceSuccessorContinuationV35} from './device-paged-graph-api-v3.mjs';
import {parseDevicePagedConnectionProfileV3} from './device-paged-connection-transport-v3.ts';
import {createDevicePagedContinuedGraphNoteVaultV4} from '../custody/device-paged-note-vault-v3.ts';
import {signWalletSessionPagedSourceSuccessorV35} from '../custody/wallet-session-v1.ts';
import {prepareSourceSuccessorIntentV35,finishSourceSuccessorIntentV35} from '../state/source-successor-intent-v35.ts';
function need(value:unknown):asserts value{if(!value)throw Error('MOBILE_PAGED_SOURCE_SUCCESSOR_BINDING');}
/** One retained intent per predecessor. Losing an HTTP response does not create
 * a second identity; every explicit retry obtains a new, scoped owner approval. */
export async function prepareDevicePagedSourceSuccessorV35(input:{profile:string;vault:any;fetchImpl:typeof fetch;signal:AbortSignal;readContinuation(accept:(reply:unknown)=>Promise<void>):Promise<unknown>;onProgress?(text:string):void}){
 const profile=parseDevicePagedConnectionProfileV3(input.profile),live=()=>need(!input.signal.aborted),summary=await input.vault.summary();need(JSON.stringify(summary.descriptor)===JSON.stringify(profile.descriptor));live();
 const request=await prepareSourceSuccessorIntentV35(input.profile);live();const api=createDevicePagedSourceSuccessorApiV35({descriptor:profile.descriptor,transport:profile.transport,fetchImpl:input.fetchImpl});let nextVault:any=null,result:string|null=null;
 try{
  input.onProgress?.('Checking that the previous operation and its funds are fully settled...');const challenge=await api.challenge(request);live();need(challenge.predecessor.walletRootId===summary.rootId&&challenge.predecessor.sourceRevision===String(summary.noteRevision));
  input.onProgress?.('Confirm the new empty account with your fingerprint. No funds will move.');const signature=await signWalletSessionPagedSourceSuccessorV35(challenge,input.signal);live();const provision=await api.submit(challenge,signature);live();
  await input.vault.beginReadStorage(input.signal);
  try{await input.vault.retainSourceConnection(input.profile);await input.readContinuation(async raw=>{live();const data=readDevicePagedSourceSuccessorContinuationV35(raw,provision),token=await input.vault.prepareSourceSuccessorV35(raw,provision);nextVault=await createDevicePagedContinuedGraphNoteVaultV4(token,input.signal);live();const next=await nextVault.summary();need(next.rootId===data.walletRootId&&String(next.noteRevision)===data.sourceRevision&&next.commitment===null&&next.pending===null&&next.jobs.length===0);result=JSON.stringify(provision.connection);await nextVault.beginReadStorage(input.signal);try{await nextVault.retainSourceConnection(result);}finally{await nextVault.endReadStorage();}live();});}
  finally{await nextVault?.close();await input.vault.endReadStorage();}
  need(result!==null);await finishSourceSuccessorIntentV35(input.profile,result);live();return result;
 }finally{await api.close();}
}
