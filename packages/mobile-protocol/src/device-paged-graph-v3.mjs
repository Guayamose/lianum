/** Data framing for the prospectively born DEVICE_PAGED private OWNER.
 * Graph/node ordinals and dependency endpoints never enter the public command.
 * A normalized object issues no account, proof, progress or accepted-state cap. */
import * as P from './device-paged-owner-v3.mjs';
import {normalizeDevicePagedPublicFundingMetadataDataV4,assertDevicePagedPublicNetworkIdDataV4} from './device-paged-budget-asset-v4.mjs';
import {normalizeDevicePagedUniswapIntentV3,normalizeDevicePagedUniswapPreparationV3} from './device-paged-uniswap-v3.mjs';
import {DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4,normalizeDevicePagedPublicUniswapPreparationV4} from './device-paged-uniswap-public-v4.mjs';
import {normalizeDevicePagedPublicDefiPreparationV8} from './device-paged-defi-public-v8.mjs';
export {normalizeDevicePagedUniswapIntentV3,normalizeDevicePagedUniswapPreparationV3,DEVICE_PAGED_UNISWAP_INTENT_V3} from './device-paged-uniswap-v3.mjs';
export const DEVICE_PAGED_GRAPH_OWNER_V3='LIANUM_DEVICE_PAGED_GRAPH_OWNER_V3';
const need=v=>{if(!v)throw Error('MOBILE_PAGED_GRAPH_MESSAGE');};
export const DEVICE_PAGED_GRAPH_COMMANDS_V3=Object.freeze({
 BEGIN_GRAPH:'reserve',PREPARE_NATIVE_PAGE:'reserve',APPEND_PAGE:'reserve',SEAL_GRAPH:'reserve',SIGN_GRAPH:'reserve',
 PROVE_R:'reserve',RESERVE_R:'reserve',READ_READY:'reserve',NEXT_COMMAND:'reserve',EXECUTE_NATIVE:'reserve',READ_ECONOMIC_SETTLEMENT:'reserve',READ_ECONOMIC_OPERATION:'reserve',READ_PORTFOLIO:'reserve',READ_SOURCE_CONTINUATION_V4:'reserve',START_AUTOMATION:'reserve',STOP_AUTOMATION:'reserve',
 PROVE_EDGE:'fold',PROVE_NODE:'fold',FOLD:'fold',PROVE_ADMISSION:'admission',ADMIT:'admission',
 PROVE_T:'terminal',FULFILL:'terminal',RECOVER_CUTOFF:'terminal',READ_GRAPH:'reserve',OBSERVE_GRAPH:'reserve',READ_OUTPUT:'withdraw',PROVE_OUTPUT_W39:'withdraw',WITHDRAW_OUTPUT_W39:'withdraw'
});
export const devicePagedGraphProvesV3=action=>['PROVE_R','PROVE_EDGE','PROVE_NODE','PROVE_ADMISSION','PROVE_T','PROVE_OUTPUT_W39'].includes(action);
export const devicePagedGraphEffectsV3=action=>['RESERVE_R','FOLD','ADMIT','FULFILL','RECOVER_CUTOFF','WITHDRAW_OUTPUT_W39'].includes(action);
export function normalizeDevicePagedGraphHealthV3(raw){const h=P.pagedOwnerExactV3(raw,['healthFrom','healthUntil','healthSignatures']);P.pagedOwnerUintV3(h.healthFrom,true);P.pagedOwnerUintV3(h.healthUntil,true);need(BigInt(h.healthFrom)<BigInt(h.healthUntil)&&BigInt(h.healthUntil)-BigInt(h.healthFrom)<=30n&&BigInt(h.healthUntil)<(1n<<64n));need(Array.isArray(h.healthSignatures)&&h.healthSignatures.length===3);let previous=-1n;for(const signature of h.healthSignatures){P.pagedOwnerExactV3(signature,['signerIndex','r','s','v']);P.pagedOwnerUintV3(signature.signerIndex,true);need(BigInt(signature.signerIndex)>previous&&BigInt(signature.signerIndex)<4n);previous=BigInt(signature.signerIndex);need(/^0x[0-9a-f]{64}$/.test(signature.r)&&/^0x[0-9a-f]{64}$/.test(signature.s));const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;need(BigInt(signature.r)>0n&&BigInt(signature.r)<order&&BigInt(signature.s)>0n&&BigInt(signature.s)<=order/2n);need(signature.v==='27'||signature.v==='28');}return frozen(h);}
const frozen=v=>{if(v&&typeof v==='object'){for(const k of Object.keys(v))frozen(v[k]);Object.freeze(v);}return v;};
export function normalizeDevicePagedNativePreparationV3(raw,rawPagedDescriptor=null){
 const config=P.pagedOwnerExactV3(raw,['family','chainDomain','evidencePolicy',...(Object.hasOwn(raw??{},'networks')?['networks']:[]),...(Object.hasOwn(raw??{},'uniswap')?['uniswap']:[]),...(Object.hasOwn(raw??{},'defi')?['defi']:[]),...(Object.hasOwn(raw??{},'budgetAsset')||Object.hasOwn(raw??{},'fundingOrigin')?['budgetAsset','fundingOrigin']:[])]);need(config.family==='EVM');
 if(config.budgetAsset!==undefined){need(rawPagedDescriptor!==null);const m=normalizeDevicePagedPublicFundingMetadataDataV4({budgetAsset:config.budgetAsset,fundingOrigin:config.fundingOrigin},rawPagedDescriptor);config.budgetAsset=m.budgetAsset;}
 P.pagedOwnerHexV3(config.chainDomain);P.pagedOwnerHexV3(config.evidencePolicy);
 if(config.networks!==undefined){
  need(Array.isArray(config.networks)&&config.networks.length>0&&config.networks.length<=8);const domains=new Set();
  config.networks=config.networks.map(rawNetwork=>{const n=P.pagedOwnerExactV3(rawNetwork,['family','label','chainDomain','evidencePolicy','assetSymbol','decimals','destinations',...(Object.hasOwn(rawNetwork??{},'networkId')?['networkId']:[])]);if(n.networkId!==undefined)assertDevicePagedPublicNetworkIdDataV4(n.networkId,n.family);need(['EVM','BTC','SOL'].includes(n.family));P.pagedOwnerHexV3(n.chainDomain);P.pagedOwnerHexV3(n.evidencePolicy);need(!domains.has(n.chainDomain));domains.add(n.chainDomain);need(typeof n.label==='string'&&n.label.length>0&&n.label.length<=80&&typeof n.assetSymbol==='string'&&/^[A-Z0-9]{1,12}$/.test(n.assetSymbol));need(Number.isSafeInteger(n.decimals)&&n.decimals>=0&&n.decimals<=18);need(Array.isArray(n.destinations)&&n.destinations.length<=64);const addresses=new Set();n.destinations=n.destinations.map(rawDestination=>{const d=P.pagedOwnerExactV3(rawDestination,['id','address','label']);need(typeof d.id==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(d.id)&&typeof d.address==='string'&&d.address.length>0&&d.address.length<=128&&typeof d.label==='string'&&d.label.length>0&&d.label.length<=80&&!addresses.has(d.address));addresses.add(d.address);return d;});return n;});
 }
 if(config.uniswap!==undefined){config.uniswap=config.uniswap?.profile===DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4?normalizeDevicePagedPublicUniswapPreparationV4(config.uniswap,rawPagedDescriptor):normalizeDevicePagedUniswapPreparationV3(config.uniswap,rawPagedDescriptor);need(!config.networks?.some(n=>n.chainDomain===config.uniswap.configuration.chainDomain));}
 if(config.defi!==undefined){need(rawPagedDescriptor!==null&&config.uniswap===undefined);config.defi=normalizeDevicePagedPublicDefiPreparationV8(config.defi,rawPagedDescriptor);for(const network of config.defi.networks)need(!config.networks?.some(n=>n.chainDomain===network.chainDomain));}
 return frozen(config);
}
/** Only provider terms leave the mobile preparation. Dependencies, note
 * openings, root keys and receipt secrets are outside this exact frame. */
export function normalizeDevicePagedNativePageRequestV3(raw){
 const command=P.pagedOwnerExactV3(raw,['preparation','settleBefore']),page=P.pagedOwnerExactV3(command.preparation,['preparationId','pageIndex','nodes']);
 need(typeof page.preparationId==='string'&&/^paged-page-[0-9a-f]{32}$/.test(page.preparationId));P.pagedOwnerUintV3(page.pageIndex,true);P.pagedOwnerUintV3(command.settleBefore);
 need(Array.isArray(page.nodes)&&page.nodes.length>0&&page.nodes.length<=64);
 const ids=new Set();page.nodes=page.nodes.map(rawNode=>{
  const n=P.pagedOwnerExactV3(rawNode,Object.hasOwn(rawNode??{},'intent')?['id','ordinal','chainDomain','evidencePolicy','amount','receiptKeyCommitment','receiptRho','payoutCommitment','intent']:['id','ordinal','chainDomain','evidencePolicy','amount','receiptKeyCommitment','receiptRho','payoutCommitment']);
  need(typeof n.id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(n.id)&&!ids.has(n.id));ids.add(n.id);
  P.pagedOwnerUintV3(n.ordinal,true);P.pagedOwnerUintV3(n.amount);for(const k of ['chainDomain','evidencePolicy','receiptKeyCommitment','receiptRho','payoutCommitment'])P.pagedOwnerHexV3(n[k]);if(n.intent!==undefined){if(Object.hasOwn(n.intent??{},'kind')){n.intent=normalizeDevicePagedUniswapIntentV3(n.intent);need(BigInt(n.intent.validUntil)<=BigInt(command.settleBefore));}else{const intent=P.pagedOwnerExactV3(n.intent,['family','recipient','amount']);need(['EVM','BTC','SOL'].includes(intent.family));need(typeof intent.recipient==='string'&&intent.recipient.length>0&&intent.recipient.length<=128&&!/[\s\x00-\x1f]/.test(intent.recipient));P.pagedOwnerUintV3(intent.amount);n.intent=intent;}}return n;
 });command.preparation=page;return frozen(command);
}
const id=v=>{need(typeof v==='string'&&/^[a-z0-9-]{8,100}$/.test(v));return v;};
export function normalizeDevicePagedGraphDraftV3(raw){const d=P.pagedOwnerExactV3(raw,['action','graphId','jobId','rootId','revision','commandSHA256','replyPublicKey']);need(Object.hasOwn(DEVICE_PAGED_GRAPH_COMMANDS_V3,d.action));id(d.graphId);id(d.jobId);P.pagedOwnerHexV3(d.rootId);need(Number.isSafeInteger(d.revision)&&d.revision>0);P.pagedOwnerHexV3(d.commandSHA256);need(typeof d.replyPublicKey==='string'&&/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/.test(d.replyPublicKey));return frozen(d);}
export function normalizeDevicePagedGraphConsentV3(raw){const c=P.pagedOwnerExactV3(raw,['version','profile','descriptor','action','graphId','jobId','rootId','revision','commandSHA256','replyPublicKey','challengeId','nonce','authorizationRoot','reserveNullifier','progressCommitment','recipient','expiresAt']);need(c.version===3&&c.profile===DEVICE_PAGED_GRAPH_OWNER_V3);c.descriptor=P.normalizeDevicePagedDescriptorV3(c.descriptor);normalizeDevicePagedGraphDraftV3(Object.fromEntries(['action','graphId','jobId','rootId','revision','commandSHA256','replyPublicKey'].map(k=>[k,c[k]])));id(c.challengeId);P.pagedOwnerHexV3(c.nonce);for(const k of ['authorizationRoot','reserveNullifier','progressCommitment'])if(c[k]!==null)P.pagedOwnerHexV3(c[k]);c.recipient=P.normalizeDevicePagedRecipientV3(DEVICE_PAGED_GRAPH_COMMANDS_V3[c.action],c.jobId,c.recipient);need(Number.isSafeInteger(c.expiresAt)&&c.expiresAt<=c.descriptor.deadlineMs);return frozen(c);}
export function validateDevicePagedGraphConsentFreshV3(raw,now=P.devicePagedWallNowV3()){
 const c=normalizeDevicePagedGraphConsentV3(raw);
 const reject=code=>{const error=Error('MOBILE_PAGED_GRAPH_MESSAGE');Object.defineProperty(error,'code',{value:code});throw error;};
 // The code only identifies the unchanged guard. It grants no retry or new
 // permission; the issuer still decides whether an original observation is safe.
 const code=!Number.isSafeInteger(now)?'MOBILE_PAGED_GRAPH_CONSENT_CLOCK_INVALID':now>=c.descriptor.deadlineMs?'MOBILE_PAGED_GRAPH_CONSENT_DEADLINE':now>=c.expiresAt?'MOBILE_PAGED_GRAPH_CONSENT_EXPIRED':null;
 if(code)reject(code);
 // Only the exact previously registered challenge may survive wall rollback;
 // the clock helper rejects a new future frame and never renews its deadline.
 try{P.assertDevicePagedFrameElapsedV3('graph:consent:'+c.descriptor.pairingId+':'+c.challengeId+':'+c.nonce,c.expiresAt,now);}catch(error){if(error instanceof Error&&error.message==='MOBILE_PAGED_CLOCK_EXPIRED')reject('MOBILE_PAGED_GRAPH_CONSENT_EXPIRED');if(error instanceof Error&&error.code==='MOBILE_PAGED_CLOCK_FUTURE')reject('MOBILE_PAGED_GRAPH_CONSENT_FUTURE');throw error;}
 return c;
}
export function devicePagedGraphPermissionMessageV3(raw){const text='LIANUM_DEVICE_PAGED_GRAPH_PERMISSION/3\n'+JSON.stringify(normalizeDevicePagedGraphConsentV3(raw)),bytes=new TextEncoder().encode(text);need(bytes.length<=8192&&/^[\x20-\x7e\n]*$/.test(text));return bytes;}
export function normalizeDevicePagedGraphPublicV3(raw){const hasTimestamp=raw&&typeof raw==='object'&&Object.hasOwn(raw,'blockTimestamp'),s=P.pagedOwnerExactV3(raw,['profile','descriptor','graphId','rootId','revision','authorizationRoot','reserveNullifier','progressCommitment','readyCommitment','sourceCommitment','sourceNullifier','pages','nodes','budget','settleBefore','phase','job','pending','issuedAt','expiresAt','blockHash','blockNumber',...(hasTimestamp?['blockTimestamp']:[])]);if(hasTimestamp)P.pagedOwnerUintV3(s.blockTimestamp,true);need(s.profile===DEVICE_PAGED_GRAPH_OWNER_V3);s.descriptor=P.normalizeDevicePagedDescriptorV3(s.descriptor);id(s.graphId);P.pagedOwnerHexV3(s.rootId);need(Number.isSafeInteger(s.revision)&&s.revision>0);for(const k of ['authorizationRoot','reserveNullifier','progressCommitment','readyCommitment','sourceCommitment','sourceNullifier'])if(s[k]!==null)P.pagedOwnerHexV3(s[k]);for(const k of ['pages','nodes','budget','settleBefore'])if(s[k]!==null)P.pagedOwnerUintV3(s[k],true);need(['BUILDING','SIGNING','PREPARED','RESERVED','FULFILLED','RECOVERED','UNKNOWN','FAILED'].includes(s.phase));need(typeof s.pending==='boolean');if(s.job!==null){const j=P.pagedOwnerExactV3(s.job,['jobId','mode','publicInputs','proofSHA256','stage','transactionHash']);id(j.jobId);need(['reserve','fold','admission','terminal','withdraw'].includes(j.mode));j.publicInputs=P.normalizeDevicePagedPublicInputsV3(j.mode,j.publicInputs);P.pagedOwnerHexV3(j.proofSHA256);need(['PROVED','UNKNOWN','CONFIRMED'].includes(j.stage));need(j.transactionHash===null||/^0x[0-9a-f]{64}$/.test(j.transactionHash));s.job=j;}need(Number.isSafeInteger(s.issuedAt)&&s.expiresAt===s.issuedAt+15000&&/^0x[0-9a-f]{64}$/.test(s.blockHash));P.pagedOwnerUintV3(s.blockNumber,true);return frozen(s);}
export function validateDevicePagedGraphPublicFreshV3(raw,now=P.devicePagedWallNowV3()){
 const s=normalizeDevicePagedGraphPublicV3(raw);need(Number.isSafeInteger(now));
 // Only these clock failures permit a fresh observation of the original
 // operation. Malformed frames keep the existing generic rejection.
 const code=now>=s.descriptor.deadlineMs?'MOBILE_PAGED_GRAPH_STATUS_DEADLINE':s.issuedAt>now?'MOBILE_PAGED_GRAPH_STATUS_FUTURE':now>=s.expiresAt?'MOBILE_PAGED_GRAPH_STATUS_EXPIRED':null;
 if(code){const error=Error('MOBILE_PAGED_GRAPH_MESSAGE');Object.defineProperty(error,'code',{value:code});throw error;}
 try{P.assertDevicePagedFrameElapsedV3('graph:status:'+s.descriptor.pairingId+':'+s.graphId+':'+s.issuedAt+':'+s.blockHash,s.expiresAt,now);}catch(error){if(error instanceof Error&&error.message==='MOBILE_PAGED_CLOCK_EXPIRED'){const expired=Error('MOBILE_PAGED_GRAPH_MESSAGE');Object.defineProperty(expired,'code',{value:'MOBILE_PAGED_GRAPH_STATUS_EXPIRED'});throw expired;}throw error;}
 return s;
}
export function normalizeDevicePagedGraphReplyV3(raw){const r=P.pagedOwnerExactV3(raw,['profile','status','ciphertext']);need(r.profile===DEVICE_PAGED_GRAPH_OWNER_V3);r.status=normalizeDevicePagedGraphPublicV3(r.status);need(r.ciphertext&&typeof r.ciphertext==='object');return frozen(r);}
export {snapshotDevicePagedWitnessV3 as snapshotDevicePagedGraphCommandV3} from './device-paged-owner-v3.mjs';
