/** Query the existing protected wallet through the original readonly channel.
 * The returned view is historical DATA. No financial session, permission,
 * deposit, new source or lease-renewal command is exposed to the screen. */
import {parseDevicePagedConnectionProfileV3,createDevicePagedSourceRenewalPinnedTransportV4} from '../api/device-paged-connection-transport-v3.ts';
import {openExistingDevicePagedCustodyV3,readDevicePagedSourceRecoveryScopeV4} from '../custody/device-paged-note-vault-v3.ts';
import {captureWalletSessionGuardV1,signWalletSessionPagedSourceRenewalV4} from '../custody/wallet-session-v1.ts';
import {readDevicePublicKey} from '../custody/key-store.ts';
import {createDevicePagedSourceRenewalApiV4,readDevicePagedSourceRenewalReplyV4} from '../api/device-paged-source-renewal-api-v4.mjs';

export async function readDevicePagedSourceRecoveryViewV4(rawProfile,signal){
 if(arguments.length!==2||!(signal instanceof AbortSignal))throw Error('MOBILE_PAGED_SOURCE_RECOVERY_VIEW');
 const profile=parseDevicePagedConnectionProfileV3(rawProfile),sessionCurrent=captureWalletSessionGuardV1();
 const current=()=>{if(signal.aborted)throw Error('MOBILE_PAGED_SCREEN_CLOSED');sessionCurrent();};
 let vault,transport,api;
 try{
  current();if(await readDevicePublicKey()!==profile.descriptor.devicePublicKey)throw Error('MOBILE_PAGED_GRAPH_PAIRING');current();
  // Discovery never allocates a root, overwrites a wallet or repeats funding.
  vault=await openExistingDevicePagedCustodyV3(profile.descriptor,'GRAPH',signal);current();
  const sourceToken=await vault.prepareSourceRecovery();current();
  transport=await createDevicePagedSourceRenewalPinnedTransportV4(profile,sourceToken,signal);current();
  api=await createDevicePagedSourceRenewalApiV4({sourceToken,transport});current();
  const challenge=await api.readChannelState();current();
  const signature=await signWalletSessionPagedSourceRenewalV4(challenge);current();
  const reply=await api.submit(challenge,signature);current();
  const accepted=await readDevicePagedSourceRenewalReplyV4(reply,sourceToken);current();
  const scope=await readDevicePagedSourceRecoveryScopeV4(sourceToken);current();
  const observation=accepted.data.observation,owner=observation.ownerValidation.public;
  if(observation.current!==false||observation.ownerValidation.current!==false)throw Error('MOBILE_PAGED_SOURCE_RECOVERY_VIEW');
  const graph=await vault.graphSummary();current();
  // A lost seal/reservation reply may leave either local field unknown. The
  // accepted SDK reply already joins the exact original SourceId (including
  // graphId), root and revision; a known local commitment must still agree.
  if(graph!==null&&(graph.authorizationRoot!==null&&graph.authorizationRoot!==owner.authorizationRoot||graph.reserveNullifier!==null&&graph.reserveNullifier!==owner.reserveNullifier))throw Error('MOBILE_PAGED_SOURCE_RECOVERY_BINDING');
  await readDevicePagedSourceRenewalReplyV4(reply,sourceToken);current();
  return Object.freeze({
   profile:'DEVICE_PAGED_SOURCE_RECOVERY_VIEW_V4',current:false,canOperate:false,
   pairingId:profile.descriptor.pairingId,walletRootId:scope.walletRootId,sourceRevision:String(scope.sourceRevision),
   graphId:graph?.graphId??null,phase:owner.phase,nodes:owner.nodes,pages:owner.pages,
   consultedAt:accepted.data.issuedAt,connectionDeadline:profile.descriptor.deadlineMs,
   authorizationDeadline:observation.ownerValidation.automation?.terms.expiresAt??null,
   authorizationRevoked:observation.ownerValidation.automation?.revoked??null,
   pendingChannelIntent:scope.channel.pending!==null
  });
 }finally{
  // Repeated reads use a new short pinned channel. No occupied custody or
  // expired 60-second transport survives navigation, cancellation or failure.
  try{await api?.close();}finally{try{await transport?.close();}finally{await vault?.close();}}
 }
}
