import * as Note from './device-external-flat-note-v1.mjs';
import {normalizeDeviceExitStatementV1} from './device-exit-consent-v1.mjs';
/** Device-signed U/S and GRAPH transport. These frames never grant an original
 * account, provider, runtime or proof capability. No signing key is a field. */
import {externalFlatExactV1 as exact,externalFlatHexV1 as hex,externalFlatUintV1 as uint,normalizeExternalFlatDescriptorV1,
 normalizeExternalFlatAccessV1,normalizeExternalFlatObservedV1,normalizeExternalFlatSignatureV1}
 from './device-external-flat-note-v1.mjs';
import {normalizeDeviceReservationStatementV1,normalizeDeviceReservationCustodyV1,
 normalizeDeviceReservationWitnessV1,deviceReservationWitnessBytesV1,wipeDeviceReservationWitnessV1,
 normalizeDeviceReservationQuoteV1,normalizeDeviceReservationStatusV1,DEVICE_RESERVATION_DISCLOSURE_V1}
 from './device-reservation-consent-v1.mjs';
export const DEVICE_EXTERNAL_FLAT_GRAPH_V1='DEVICE_EXTERNAL_FLAT_GRAPH_SOURCE_V1';
export const DEVICE_EXTERNAL_FLAT_PRIVATE_U_V2='ORIGINAL_DEVICE_GRAPH_U_PRIVATE_TRANSIT_V2';
export const EXTERNAL_FLAT_GRAPH_ACTIONS_V1=Object.freeze(['PROVE_U','RESERVE_S','OBSERVE_S','EXECUTE_GRAPH','RECONCILE_GRAPH','RECOVER_GRAPH','CANCEL_GRAPH']);
const need=v=>{if(!v)throw Error('MOBILE_EXTERNAL_FLAT_GRAPH_INVALID');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const nonzero=v=>{hex(v);need(v!=='0'.repeat(64));return v;};
const integer=v=>need(Number.isSafeInteger(v)&&v>=0&&!Object.is(v,-0));
export function normalizeExternalFlatGraphQuoteV1(raw){
 const v=exact(raw,['profile','descriptor','quote']);need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_V1);
 v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);v.quote=normalizeDeviceReservationQuoteV1(v.quote);
 for(const k of ['origin','pairingId','devicePublicKey'])need(v.quote[k]===v.descriptor[k]);
 const d=v.descriptor.poolTerms;for(const [k,j]of [['scope','scope'],['policy','policy'],['codeHash','poolCodeHash'],['assetIdentity','assetIdentity'],['domainCommitment','domainCommitment']])need(v.quote.poolTerms[k]===d[j]);
 return freeze(v);
}
export function normalizeExternalFlatGraphDraftV1(raw){
 const v=exact(raw,['action','depositJobId','rootId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256']);
 need(EXTERNAL_FLAT_GRAPH_ACTIONS_V1.includes(v.action));['depositJobId','rootId','quoteId','jobId','witnessSHA256'].forEach(k=>nonzero(v[k]));
 v.custody=normalizeDeviceReservationCustodyV1(v.custody);v.statement=normalizeDeviceReservationStatementV1(v.statement);
 need(v.rootId===v.custody.rootId&&v.statement.inputCommitment===v.custody.sourceCommitment&&v.statement.inputNullifier===v.custody.sourceNullifier
  &&v.statement.changeCommitment===v.custody.changeCommitment&&v.statement.recoveryCommitment===v.custody.recoveryCommitment);
 need((v.proofSHA256===null)===(v.publicInputsSHA256===null));
 if(v.action==='PROVE_U')need(v.proofSHA256===null);else if(v.action==='CANCEL_GRAPH'){if(v.proofSHA256!==null){nonzero(v.proofSHA256);nonzero(v.publicInputsSHA256);}}else{nonzero(v.proofSHA256);nonzero(v.publicInputsSHA256);}
 return freeze(v);
}
export function normalizeExternalFlatGraphConsentV1(raw){
 const privateField=raw&&typeof raw==='object'?Object.getOwnPropertyDescriptor(raw,'privateProof'):null;need(!privateField||Object.hasOwn(privateField,'value'));
 const v=exact(raw,['profile','descriptor','challengeId','nonce','expiresAt','draft','observed','openingDisclosure',...(privateField?['privateProof']:[])]);
 need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_V1);v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);
 nonzero(v.challengeId);nonzero(v.nonce);need(v.challengeId!==v.nonce);integer(v.expiresAt);
 v.draft=normalizeExternalFlatGraphDraftV1(v.draft);v.observed=normalizeExternalFlatObservedV1(v.observed);
 need(v.draft.statement.scope===v.descriptor.poolTerms.scope&&v.draft.statement.policy===v.descriptor.poolTerms.policy&&v.draft.statement.asset===v.descriptor.poolTerms.assetIdentity);
 if(privateField){need(v.draft.action==='PROVE_U');v.privateProof=normalizeExternalFlatGraphPrivateProofV2(v.privateProof);for(const [k,d]of [['scope','scope'],['policy','policy'],['asset','assetIdentity'],['hubDomain','hubDomain'],['ledgerNamespace','ledgerNamespace']])need(v.privateProof.context.domain[k]===v.descriptor.poolTerms[d]);}
 need(v.openingDisclosure===(v.draft.action==='PROVE_U'?DEVICE_RESERVATION_DISCLOSURE_V1:null));return freeze(v);
}
export function validateExternalFlatGraphFreshV1(raw,now=Date.now()){
 const v=normalizeExternalFlatGraphConsentV1(raw);integer(now);need(v.expiresAt>now&&v.expiresAt<=now+15000);return v;
}
/** Fixed domain V2 binds every normalized field through portable SHA256.
 * Recursive DATA canonicalization keeps object order independent of AEAD JSON;
 * array order remains significant. The protected signer keeps its 4096 cap. */
/** Portable SHA256 over the already bounded canonical permission bytes.
 * Fixed FIPS 180-4 schedule; no platform crypto, dependency or caller hash. */
function sha256(bytes){
 const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),W=new Uint32Array(64),padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64),view=new DataView(padded.buffer),rot=(v,n)=>(v>>>n)|(v<<(32-n));
 need(bytes instanceof Uint8Array&&bytes.length<=8192);padded.set(bytes);padded[bytes.length]=128;view.setUint32(padded.length-4,bytes.length*8,false);
 try{for(let offset=0;offset<padded.length;offset+=64){for(let i=0;i<16;i++)W[i]=view.getUint32(offset+4*i,false);for(let i=16;i<64;i++){const x=W[i-15],y=W[i-2];W[i]=(W[i-16]+(rot(x,7)^rot(x,18)^(x>>>3))+W[i-7]+(rot(y,17)^rot(y,19)^(y>>>10)))>>>0;}
  let [a,b,c,d,e,f,g,h]=H;for(let i=0;i<64;i++){const t1=(h+(rot(e,6)^rot(e,11)^rot(e,25))+((e&f)^(~e&g))+K[i]+W[i])>>>0,t2=((rot(a,2)^rot(a,13)^rot(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}[a,b,c,d,e,f,g,h].forEach((x,i)=>H[i]=(H[i]+x)>>>0);
 }const result=new Uint8Array(32),out=new DataView(result.buffer);H.forEach((x,i)=>out.setUint32(i*4,x,false));return result;}finally{padded.fill(0);W.fill(0);H.fill(0);}
}
function permissionCanonicalV1(value){if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(permissionCanonicalV1).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+permissionCanonicalV1(value[k])).join(',')+'}';}
export function externalFlatGraphPermissionMessageV1(raw){
 const v=normalizeExternalFlatGraphConsentV1(raw),tag=new TextEncoder().encode(v.privateProof?'LIANUM/device-external-flat-graph/3/private-recipient-full-consent-sha256':'LIANUM/device-external-flat-graph/2/full-consent-sha256'),body=new TextEncoder().encode(permissionCanonicalV1(v));
 need(body.length<=8192);let digest;try{digest=sha256(body);const bytes=new Uint8Array(8+tag.length+digest.length),view=new DataView(bytes.buffer);view.setUint32(0,tag.length,false);bytes.set(tag,4);view.setUint32(4+tag.length,digest.length,false);bytes.set(digest,8+tag.length);return bytes;}finally{body.fill(0);digest?.fill(0);}
}

function output(raw,row,index){const n=exact(raw,['noteRole','amount','commitment','nullifier','state','available','backing']);
 need(n.noteRole===(index===0?'change':'recovery'));uint(n.amount);nonzero(n.commitment);need(n.commitment===row.reservation.statement[n.noteRole+'Commitment']);
 need(['EMPTY','UNISSUED','UNSPENT','LOCKED','SPENT','UNKNOWN'].includes(n.state));
 if(n.amount==='0')need(n.noteRole==='change'&&n.state==='EMPTY'&&n.nullifier===null&&n.available===null&&n.backing===null);
 else{nonzero(n.nullifier);need(n.state!=='EMPTY'&&n.nullifier!==row.reservation.statement.inputNullifier&&n.nullifier!==row.reservation.statement.reserveNullifier);}
 if(n.available!==null){uint(n.available);need(n.state==='UNSPENT'&&n.available===n.amount&&n.amount!=='0');
  const b=n.backing=exact(n.backing,['held','liabilities','surplus','deficit']);Object.values(b).forEach(uint);need(b.deficit==='0'&&BigInt(b.held)>=BigInt(b.liabilities)&&BigInt(b.surplus)===BigInt(b.held)-BigInt(b.liabilities)&&BigInt(n.available)<=BigInt(b.held));
 }else need(n.backing===null&&n.state!=='UNSPENT');
 if(['EXECUTION_UNKNOWN','RECOVERY_UNKNOWN'].includes(row.graph.stage))need(n.available===null&&(n.state==='UNKNOWN'||n.state==='EMPTY'));
 if(n.noteRole==='recovery'){if(n.state==='UNSPENT'||n.state==='SPENT')need(row.graph.outcome==='RECOVERED');if(n.state==='UNISSUED')need(row.graph.outcome==='FULFILLED');if(n.state==='LOCKED')need(row.graph.outcome===null);}
 return n;
}
export function normalizeExternalFlatGraphRowV1(raw){
 const v=exact(raw,['profile','descriptor','reservation','graph','outputs']);need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_V1);
 v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);v.reservation=normalizeDeviceReservationStatusV1(v.reservation);
 need(v.reservation.statement.scope===v.descriptor.poolTerms.scope&&v.reservation.statement.policy===v.descriptor.poolTerms.policy&&v.reservation.statement.asset===v.descriptor.poolTerms.assetIdentity);
 v.graph=exact(v.graph,['stage','outcome','terminal']);need(['PREPARED','EXECUTION_UNKNOWN','RECOVERY_UNKNOWN','FULFILLED','RECOVERED','SOURCE_CANCELLED'].includes(v.graph.stage));
 need([null,'FULFILLED','RECOVERED'].includes(v.graph.outcome));need((v.graph.outcome===null)===(v.graph.terminal===null));
 if(v.graph.terminal!==null){const t=v.graph.terminal=exact(v.graph.terminal,['outcome','transactionHash','calldataSHA256','blockHash','blockNumber']);
  need(t.outcome===v.graph.outcome&&v.graph.stage===v.graph.outcome);['transactionHash','calldataSHA256','blockHash'].forEach(k=>nonzero(t[k]));
  need(typeof t.blockNumber==='string'&&/^(0|[1-9][0-9]*)$/.exec(t.blockNumber)?.[0]===t.blockNumber&&BigInt(t.blockNumber)<(1n<<64n));}
 need(Array.isArray(v.outputs)&&Object.getPrototypeOf(v.outputs)===Array.prototype&&[0,2].includes(v.outputs.length)&&Reflect.ownKeys(v.outputs).length===v.outputs.length+1);
 v.outputs=Array.from({length:v.outputs.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v.outputs,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));return output(d.value,v,i);});
 if(v.outputs.length){need(v.reservation.stage==='RESERVED'&&v.reservation.observation!==null);need(v.outputs[0].commitment!==v.outputs[1].commitment&&(v.outputs[0].nullifier===null||v.outputs[0].nullifier!==v.outputs[1].nullifier));}
 return freeze(v);
}
export function normalizeExternalFlatGraphStatusV1(raw){
 const hasWithdrawals=Object.hasOwn(raw,'withdrawals');const v=exact(raw,['profile','descriptor','jobs','observed','observedAt','expiresAt',...(hasWithdrawals?['withdrawals']:[])]);need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_V1);
 v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);v.observed=normalizeExternalFlatObservedV1(v.observed);integer(v.observedAt);integer(v.expiresAt);need(v.expiresAt===v.observedAt+15000);
 need(Array.isArray(v.jobs)&&Object.getPrototypeOf(v.jobs)===Array.prototype&&v.jobs.length<=1&&Reflect.ownKeys(v.jobs).length===v.jobs.length+1);
 v.jobs=Array.from({length:v.jobs.length},(_,i)=>{const p=Object.getOwnPropertyDescriptor(v.jobs,String(i));need(p?.enumerable&&Object.hasOwn(p,'value'));
  const r=normalizeExternalFlatGraphRowV1(p.value);need(same(r.descriptor,v.descriptor));return r;});v.withdrawals=hasWithdrawals?normalizeOutputRows(v.withdrawals,v):[];return freeze(v);
}
export {normalizeExternalFlatAccessV1,normalizeExternalFlatSignatureV1,normalizeDeviceReservationWitnessV1,
 deviceReservationWitnessBytesV1,wipeDeviceReservationWitnessV1};

export const DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_V1='DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_W39_V1';
const outputRole=v=>{need(v==='change'||v==='recovery');return v;};
export function normalizeExternalFlatGraphOutputDraftV1(raw){
 const v=exact(raw,['profile','noteRole','draft']);need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_V1);outputRole(v.noteRole);
 const d=v.draft=exact(v.draft,['action','jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256']);
 need(['PROVE_W39','WITHDRAW_W39','OBSERVE_W39'].includes(d.action));['jobId','rootId','witnessSHA256'].forEach(k=>nonzero(d[k]));need(d.noteRevision===1);hex(d.recipient,40);need(d.recipient!=='0'.repeat(40));
 d.statement=normalizeDeviceExitStatementV1(d.statement);d.path=Note.normalizeExternalFlatPathV1(d.path);need(d.statement.recipient===d.recipient&&d.path.root===d.statement.root&&d.path.leaf===d.statement.commitment);return freeze(v);
}
export function normalizeExternalFlatGraphOutputConsentV1(raw){const v=exact(raw,['profile','noteRole','consent']);need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_V1);outputRole(v.noteRole);v.consent=Note.normalizeExternalFlatConsentV1(v.consent);need(v.consent.descriptor.profile===Note.DEVICE_EXTERNAL_FLAT_NOTE_V1&&['QUOTE_W39','PROVE_W39','WITHDRAW_W39','OBSERVE_W39'].includes(v.consent.action)&&v.consent.noteRevision===1);return freeze(v);}
export function validateExternalFlatGraphOutputFreshV1(raw,now=Date.now()){const v=normalizeExternalFlatGraphOutputConsentV1(raw);Note.validateExternalFlatFreshV1(v.consent,now);return v;}
export function externalFlatGraphOutputPermissionMessageV1(raw){const v=normalizeExternalFlatGraphOutputConsentV1(raw),tag=new TextEncoder().encode('LIANUM/device-external-flat-graph-output/1/full-consent-sha256'),body=new TextEncoder().encode(permissionCanonicalV1(v));need(body.length<=8192);let digest;try{digest=sha256(body);const bytes=new Uint8Array(8+tag.length+32),view=new DataView(bytes.buffer);view.setUint32(0,tag.length,false);bytes.set(tag,4);view.setUint32(4+tag.length,32,false);bytes.set(digest,8+tag.length);return bytes;}finally{body.fill(0);digest?.fill(0);}}
export function normalizeExternalFlatGraphOutputRowV1(raw){const v=exact(raw,['profile','noteRole','row']);need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_V1);outputRole(v.noteRole);v.row=Note.normalizeExternalFlatRowV1(v.row);need(v.row.mode==='withdraw_balance'&&v.row.profile===Note.DEVICE_EXTERNAL_FLAT_NOTE_V1&&v.row.consentFields.noteRevision===1);return freeze(v);}
function normalizeOutputRows(raw,status){need(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length<=2&&Reflect.ownKeys(raw).length===raw.length+1);const out=Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));const v=normalizeExternalFlatGraphOutputRowV1(d.value),g=status.jobs[0];need(g&&same(v.row.descriptor,status.descriptor)&&v.row.consentFields.depositJobId===g.reservation.jobId&&v.row.consentFields.rootId===g.reservation.consentFields.custody.rootId&&v.row.consentFields.statement.commitment===g.reservation.statement[v.noteRole+'Commitment']);return v;});need(new Set(out.map(v=>v.noteRole)).size===out.length&&new Set(out.map(v=>v.row.jobId)).size===out.length);return out;}

/** Fixed V2 recipient and public context. Hashes bind the original preparation
 * without publishing receipt spend secrets or note openings in consent. */
export function normalizeExternalFlatGraphPrivateProofV2(raw){
 const p=exact(raw,['profile','recipient','resultRecipient','context','transcriptSHA256']);need(p.profile===DEVICE_EXTERNAL_FLAT_PRIVATE_U_V2);nonzero(p.transcriptSHA256);
 const r=p.recipient=exact(p.recipient,['type','profile','relation','role','jobId','recipientPublicKey']);
 need(r.type==='flat-private-proof-input-ready'&&r.profile==='ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1'&&r.relation==='authorization'&&r.role==='owner');
 need(typeof r.jobId==='string'&&/^[a-z0-9-]{8,100}$/.exec(r.jobId)?.[0]===r.jobId);
 need(typeof r.recipientPublicKey==='string'&&/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/.exec(r.recipientPublicKey)?.[0]===r.recipientPublicKey);
 const t=p.resultRecipient=exact(p.resultRecipient,['type','profile','relation','role','jobId','recipientPublicKey']);for(const k of ['type','profile','relation','role','jobId'])need(t[k]===r[k]);need(typeof t.recipientPublicKey==='string'&&/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/.exec(t.recipientPublicKey)?.[0]===t.recipientPublicKey&&t.recipientPublicKey!==r.recipientPublicKey);
 const c=p.context=exact(p.context,['domain','proposalSHA256','capsuleOptionsSHA256','invoiceSignaturesSHA256','sourceAmount']);
 c.domain=exact(c.domain,['scope','policy','asset','hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace']);Object.values(c.domain).forEach(nonzero);need(c.domain.ledgerNamespace===c.domain.hubDomain);
 ['proposalSHA256','capsuleOptionsSHA256','invoiceSignaturesSHA256'].forEach(k=>nonzero(c[k]));uint(c.sourceAmount);need(c.sourceAmount!=='0');return freeze(p);
}
export function externalFlatGraphPrivateTranscriptBytesV2(raw){
 const c=normalizeExternalFlatGraphConsentV1(raw);need(c.privateProof);const p=c.privateProof;
 return new TextEncoder().encode(permissionCanonicalV1({profile:p.profile,recipient:p.recipient,resultRecipient:p.resultRecipient,context:p.context,descriptor:c.descriptor,
  draft:c.draft,observed:c.observed,challengeId:c.challengeId,nonce:c.nonce,expiresAt:c.expiresAt}));
}
export function externalFlatGraphPrivateDigestV2(raw){const body=new TextEncoder().encode(permissionCanonicalV1(raw));let digest;try{need(body.length<=8192);digest=sha256(body);return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');}finally{body.fill(0);digest?.fill(0);}}
export function validateExternalFlatGraphPrivateWitnessV2(rawConsent,rawWitness){
 const c=validateExternalFlatGraphFreshV1(rawConsent);need(c.privateProof);const p=c.privateProof;
 const transcript=externalFlatGraphPrivateTranscriptBytesV2(c);let digest,w;
 try{digest=sha256(transcript);need(Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')===p.transcriptSHA256);
  w=normalizeDeviceReservationWitnessV1(rawWitness);const proposal=Object.fromEntries(['scope','policy','asset','operationId','budget','fundingNotBefore','fundingValidUntil','settleBefore','nodes'].map(k=>[k,w.input[k]]));
  need(externalFlatGraphPrivateDigestV2(proposal)===p.context.proposalSHA256&&externalFlatGraphPrivateDigestV2(w.envelopePreparation.capsuleOptions)===p.context.capsuleOptionsSHA256&&externalFlatGraphPrivateDigestV2(w.invoiceSignatures)===p.context.invoiceSignaturesSHA256);
  need(w.input.inputNote.value===p.context.sourceAmount);return c;
 }finally{transcript.fill(0);digest?.fill(0);wipeDeviceReservationWitnessV1(w);}
}
