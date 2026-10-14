/** Custody orchestration above the original pinned readonly wire. The Vault
 * retains SourceToken ownership, protected intent CAS and original reply joins. */
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import * as Crypto from './device-paged-graph-crypto-provider-v3.ts';
import {readDevicePagedSourceRecoveryScopeV4,assertDevicePagedSourceRecoveryTokenV4,prepareDevicePagedSourceRenewalIntentV4,acceptDevicePagedSourceRenewalReplyV4} from '../custody/device-paged-note-vault-v3.ts';
import {createDevicePagedSourceRenewalWireV4,readDevicePagedSourceRenewalWireChallengeV4,readDevicePagedSourceRenewalWireReplyV4} from './device-paged-source-renewal-wire-v4.mjs';
const need=ok=>{if(!ok)throw Error('MOBILE_PAGED_SOURCE_RENEWAL_ORIGINAL_SDK');};
async function newIntent(){const bytes=await Crypto.getRandomBytesAsync(16);try{need(bytes instanceof Uint8Array&&bytes.length===16);return'source-channel-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}finally{bytes?.fill(0);}}
export async function createDevicePagedSourceRenewalApiV4(raw){
 need(arguments.length===1);const input=P.pagedOwnerExactV3(raw,['sourceToken','transport']),sourceToken=input.sourceToken,initial=await readDevicePagedSourceRecoveryScopeV4(sourceToken);let closed=false,busy=false;
 const guard=async()=>{need(!closed);await assertDevicePagedSourceRecoveryTokenV4(sourceToken);need(!closed);},wire=await createDevicePagedSourceRenewalWireV4({sourceToken,transport:input.transport,descriptor:initial.descriptor,guard});
 async function run(fn){await guard();need(!busy);busy=true;try{const result=await fn();await guard();return result;}finally{busy=false;}}
 return Object.freeze({descriptor:wire.descriptor,
  readChannelState(){return run(()=>wire.prepare('READ_CHANNEL_STATE',null));},
  renewChannel(){return run(async()=>wire.prepare('RENEW_CHANNEL',await prepareDevicePagedSourceRenewalIntentV4(sourceToken,await newIntent())));},
  readRenewalIntent(){return run(async()=>{const scope=await readDevicePagedSourceRecoveryScopeV4(sourceToken);need(scope.channelObserved&&scope.channel.pending!==null);return wire.prepare('READ_RENEWAL_INTENT',scope.channel.pending);});},
  retryNotIssuedIntent(reply){return run(async()=>{const accepted=await readDevicePagedSourceRenewalWireReplyV4(reply,sourceToken),scope=await readDevicePagedSourceRecoveryScopeV4(sourceToken);need(accepted.data.intentState==='NOT_ISSUED'&&scope.channelObserved&&scope.channel.pending!==null);for(const k of ['intentId','expectedGeneration','expectedLeaseId'])need(scope.channel.pending[k]===accepted.challenge.request[k]);return wire.retryNotIssuedIntent(reply);});},
  submit(challenge,signature){return run(async()=>{const result=await wire.submit(challenge,signature);await guard();await acceptDevicePagedSourceRenewalReplyV4(sourceToken,result);return result;});},
  isUnconfirmedReply(error){return !closed&&wire.isUnconfirmedReply(error);},
  close(){closed=true;return wire.close();}
 });
}
export const readDevicePagedSourceRenewalChallengeV4=readDevicePagedSourceRenewalWireChallengeV4;
export const readDevicePagedSourceRenewalReplyV4=readDevicePagedSourceRenewalWireReplyV4;
