/** Review DATA only: derive the exact existing Paged V3 statement from the
 * encrypted mobile seed/pages. Never reads OWNER roots or issues a permission.
 * Parity tests use the original create/append/seal/readPreparedNode builders;
 * the original circuit, frame domains and sparse encoding stay unchanged. */
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from './signing.mjs';
import {localNoteHexBytesV1,localNoteUintBytesV1,localBalanceCommitmentMessageV1} from './balance-note-codec-v1.mjs';
import {portablePoseidon2HashV1,PORTABLE_POSEIDON2_MODULUS_V1} from '@lianum/crypto/portable-poseidon2';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {DEVICE_PAGED_PAYMENT_LIMIT_V3} from '../../../../packages/mobile-protocol/src/device-paged-payment-list-v3.mjs';
const need=(v,code='MOBILE_PAGED_REVIEW_GRAPH_MISMATCH')=>{if(!v)throw Error(code);};
const digest=b=>bytesToHex(sha256(b)),hb=localNoteHexBytesV1,ub=v=>localNoteUintBytesV1(String(v),8),Z='0'.repeat(64);
export const devicePagedReviewedGraphFrameV4=(tag,parts)=>{const rows=[new TextEncoder().encode('LIANUM/PAEG/paged/'+tag+'/3'),new TextEncoder().encode('LIANUM_PAEG_FUNDED_PAGED_V3'),...parts],out=new Uint8Array(rows.reduce((a,b)=>a+4+b.length,0));let off=0;for(const b of rows){need(b.length<=65536);out.set(localNoteUintBytesV1(String(b.length),4),off);off+=4;out.set(b,off);off+=b.length;}return out;};
const graphFrame=devicePagedReviewedGraphFrameV4;
export const devicePagedReviewedGraphHashV4=(tag,parts)=>{const b=graphFrame(tag,parts);try{return digest(b);}finally{b.fill(0);for(const p of parts)p.fill(0);}};
const hashGraph=devicePagedReviewedGraphHashV4;
export function devicePagedReviewedNativeHashV4(tag,parts){const rows=[new TextEncoder().encode(tag),...parts],out=new Uint8Array(rows.reduce((a,b)=>a+4+b.length,0));let off=0;try{for(const b of rows){out.set(localNoteUintBytesV1(String(b.length),4),off);off+=4;out.set(b,off);off+=b.length;}return digest(out);}finally{out.fill(0);for(const b of parts)b.fill(0);}}
const nativeHash=devicePagedReviewedNativeHashV4;
export function devicePagedReviewedActionCommitmentV4(raw){const fields=['chainDomain','signerIdentity','sourceCommitment','destinationCommitment','amount','custodyKind','custodyCommitment','executionFrom','executionUntil','settleBefore','receiptKeyCommitment','receiptRho','deliveryRiskCommitment','actionSalt'],a=P.pagedOwnerExactV3(raw,fields),numeric=['amount','custodyKind','executionFrom','executionUntil','settleBefore'];for(const k of fields)if(!numeric.includes(k)){P.pagedOwnerHexV3(a[k]);need(a[k]!=='0'.repeat(64));}P.pagedOwnerUintV3(a.amount);need(BigInt(a.amount)<(1n<<128n)&&a.custodyKind===1);for(const k of ['executionFrom','executionUntil','settleBefore']){P.pagedOwnerUintV3(a[k],true);need(BigInt(a[k])<(1n<<64n));}need(BigInt(a.executionFrom)<BigInt(a.executionUntil)&&BigInt(a.executionUntil)<=BigInt(a.settleBefore));return nativeHash('LIANUM/PAEG/native-transfer-action/2',[new TextEncoder().encode('LIANUM_PAEG_NATIVE_4_V2'),...fields.map(k=>k==='amount'?localNoteUintBytesV1(a[k],16):k==='custodyKind'?localNoteUintBytesV1('1',1):numeric.includes(k)?ub(a[k]):hb(a[k]))]);}
export function devicePagedReviewedNoteNullifierV4(scope,cm,secret){const tag=new TextEncoder().encode('PC15/note-spend/1'),parts=[tag,...[scope,cm,secret].map(v=>localNoteHexBytesV1(v))],length=parts.reduce((a,b)=>a+4+b.length,0),out=new Uint8Array(length);let offset=0;try{for(let i=0;i<parts.length;i++){const part=parts[i],size=i===0?2:4;const l=localNoteUintBytesV1(String(part.length),size);out.set(l,offset);offset+=size;out.set(part,offset);offset+=part.length;}return digest(out.subarray(0,offset));}finally{out.fill(0);for(const p of parts)p.fill(0);}}
const chain=(tag,previous,index,value)=>hashGraph(tag,[hb(previous),ub(index),hb(value)]);
const scoped=s=>['scope','policy','asset','hubDomain','registryCommitment'].map(k=>hb(s[k]));
const noteCommitment=(s,n)=>{const b=localBalanceCommitmentMessageV1(s.scope,s.policy,n);try{return digest(b);}finally{b.fill(0);}};
const sparseDomain=0x4c49414e554d5f50414745445f545245455f50325f5633n;
const enc=n=>n.toString(16).padStart(64,'0');
function sparseRoot(tag,entries){
 const kind=BigInt(['pages','nodes','outputs'].indexOf(tag));need(kind>=0n);
 const poseidon=fields=>enc(portablePoseidon2HashV1(fields)),leaf=d=>{P.pagedOwnerHexV3(d);const n=BigInt('0x'+d);return poseidon([sparseDomain,3n,2n,3n,kind,n>>128n,n&((1n<<128n)-1n)]);};
 const branch=(level,l,r)=>{need(BigInt('0x'+l)<PORTABLE_POSEIDON2_MODULUS_V1&&BigInt('0x'+r)<PORTABLE_POSEIDON2_MODULUS_V1);return poseidon([sparseDomain,3n,3n,4n,kind,BigInt(level),BigInt('0x'+l),BigInt('0x'+r)]);};
 let empty=poseidon([sparseDomain,3n,1n,1n,kind]),rows=new Map(entries.map((d,i)=>[BigInt(i),leaf(d)]));
 for(let level=1;level<=64;level++){const next=new Map(),keys=new Set([...rows.keys()].map(k=>k>>1n));for(const k of keys)next.set(k,branch(level,rows.get(k*2n)??empty,rows.get(k*2n+1n)??empty));empty=branch(level,empty,empty);rows=next;}
 return rows.get(0n)??empty;
}
/** Both inputs must be the locally retained seed and completed pages; a
 * remote retained statement, reconstructed reply or status is not an input. */
export function deriveDevicePagedReviewedGraphDataV4(descriptor,seed,pages){
 P.pagedOwnerExactV3(seed.command,['operationId','budget','fundingNotBefore','fundingValidUntil','settleBefore','reservationNonce','reserveSecret','graphSalt','inputNote','changeNote','recoveryNote']);
 const raw={scope:descriptor.scope,policy:descriptor.policy,asset:descriptor.assetIdentity,hubDomain:descriptor.hubDomain,registryCommitment:descriptor.registryCommitment,...seed.command};
 for(const k of ['scope','policy','asset','hubDomain','registryCommitment','operationId','reservationNonce','reserveSecret','graphSalt']){P.pagedOwnerHexV3(raw[k]);need(raw[k]!==Z);}
 for(const k of ['budget','fundingNotBefore','fundingValidUntil','settleBefore'])P.pagedOwnerUintV3(raw[k],k!=='budget');
 need(BigInt(raw.fundingNotBefore)<BigInt(raw.fundingValidUntil)&&BigInt(raw.fundingValidUntil)<=BigInt(raw.settleBefore));
 need(Array.isArray(pages)&&pages.length>0&&pages.length<=DEVICE_PAGED_PAYMENT_LIMIT_V3);
 for(const n of [raw.inputNote,raw.changeNote,raw.recoveryNote]){P.pagedOwnerExactV3(n,['type','rho','x','y','value','secret']);need(n.type===4);P.pagedOwnerUintV3(n.value,true);for(const k of ['rho','x','y','secret'])P.pagedOwnerHexV3(n[k],true);if(n.value==='0')need(['rho','x','y','secret'].every(k=>n[k]===Z));}
 need(BigInt(raw.inputNote.value)===BigInt(raw.budget)+BigInt(raw.changeNote.value)&&raw.recoveryNote.value===raw.budget);
 const context=hashGraph('context',[...scoped(raw),hb(raw.operationId),hb(raw.graphSalt)]),ids=new Map(),actions=new Set(),outputs=new Set(),nodes=[],pageDigests=[];
 let pagesRoot=hashGraph('empty-pages',[hb(context)]),nodesRoot=hashGraph('empty-nodes',[hb(context)]),outputsRoot=hashGraph('empty-outputs',[hb(context)]),sum=0n;
 for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
  const page=pages[pageIndex];need(page.type==='page'&&page.pageIndex===String(pageIndex)&&Array.isArray(page.nodes)&&page.nodes.length>0&&page.nodes.length<=64);P.pagedOwnerHexV3(page.salt);need(page.salt!==Z);
  const first=nodes.length,previousNodes=nodesRoot,previousOutputs=outputsRoot;
  for(const own of page.nodes){
   const n=own.command,ordinal=String(nodes.length);need(nodes.length<DEVICE_PAGED_PAYMENT_LIMIT_V3&&own.ordinal===ordinal&&typeof n.id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(n.id)&&!ids.has(n.id));
   for(const k of ['chainDomain','evidencePolicy','actionCommitment','localCommitment','dispatchId','receiptRho','receiptSecret']){P.pagedOwnerHexV3(n[k]);need(n[k]!==Z);}
   need(devicePagedReviewedActionCommitmentV4(n.action)===n.actionCommitment&&n.action.chainDomain===n.chainDomain&&n.action.receiptRho===n.receiptRho&&n.action.settleBefore===raw.settleBefore);
   if(own.intent)need(n.action.amount===(Object.hasOwn(own.intent,'kind')?own.intent.outputAmount:own.intent.amount));
   for(const k of ['localCommitment','dispatchId','receiptRho']){const key=k+':'+n[k];need(!actions.has(key));actions.add(key);}
   need(Array.isArray(n.dependsOn)&&n.dependsOn.length<=ids.size&&new Set(n.dependsOn).size===n.dependsOn.length);
   const deps=n.dependsOn.map(id=>{const d=ids.get(id);need(d);return d;}).sort((a,b)=>BigInt(a.ordinal)<BigInt(b.ordinal)?-1:1);
   const receiptKeyCommitment=nativeHash('LIANUM/PAEG/receipt-key/2',[hb(raw.hubDomain),hb(n.receiptSecret)]);need(receiptKeyCommitment===own.receiptKeyCommitment&&n.action.receiptKeyCommitment===receiptKeyCommitment);
   const rho=hashGraph('payout-origin',[...scoped(raw),hb(raw.operationId),ub(ordinal),hb(n.payout.randomness)]),opening={type:4,rho,x:n.payout.x,y:n.payout.y,value:n.payout.value,secret:n.payout.secret},payoutCommitment=noteCommitment(raw,opening);
   need(own.payout.opening.type===4&&Object.keys(opening).every(k=>own.payout.opening[k]===opening[k])&&own.payout.commitment===payoutCommitment&&own.payoutCommitment===payoutCommitment&&!outputs.has(payoutCommitment));outputs.add(payoutCommitment);sum+=BigInt(n.payout.value);need(sum<=BigInt(raw.budget));
   let dependencies=hashGraph('empty-dependencies',[hb(context),ub(ordinal)]);deps.forEach((d,i)=>dependencies=chain('dependency',dependencies,i,hashGraph('dependency-item',[ub(d.ordinal),hb(d.nodeDigest)])));
   const idDigest=hashGraph('device-symbolic-id',[hb(context),new TextEncoder().encode(n.id)]),node={ordinal,idDigest,...Object.fromEntries(['chainDomain','evidencePolicy','actionCommitment','localCommitment','dispatchId','receiptRho'].map(k=>[k,n[k]])),receiptKeyCommitment,dependencies,dependencyCount:String(deps.length),payoutCommitment};
   const nodeDigest=hashGraph('node',[ub(ordinal),...['idDigest','chainDomain','evidencePolicy','actionCommitment','localCommitment','dispatchId','receiptKeyCommitment','receiptRho','dependencies','payoutCommitment'].map(k=>hb(node[k])),ub(deps.length)]),record={id:n.id,ordinal,nodeDigest,node,pageIndex:String(pageIndex)};
   nodes.push(record);ids.set(n.id,record);nodesRoot=chain('nodes',nodesRoot,ordinal,nodeDigest);outputsRoot=chain('outputs',outputsRoot,ordinal,payoutCommitment);
  }
  const pageDigest=hashGraph('page',[hb(context),ub(pageIndex),ub(first),localNoteUintBytesV1(String(page.nodes.length),1),hb(page.salt),hb(previousNodes),hb(nodesRoot),hb(previousOutputs),hb(outputsRoot)]);pageDigests.push(pageDigest);pagesRoot=chain('pages',pagesRoot,pageIndex,pageDigest);
 }
 need(sum===BigInt(raw.budget));
 const inputCommitment=noteCommitment(raw,raw.inputNote),inputNullifier=devicePagedReviewedNoteNullifierV4(raw.scope,inputCommitment,raw.inputNote.secret),recoveryCommitment=noteCommitment(raw,raw.recoveryNote),changeCommitment=raw.changeNote.value==='0'?hashGraph('empty-change',[...scoped(raw),hb(inputNullifier),hb(raw.operationId),hb(raw.reservationNonce)]):noteCommitment(raw,raw.changeNote);
 const reserveCommitment=hashGraph('reserve',[...scoped(raw),hb(raw.operationId),hb(raw.reservationNonce),hb(pagesRoot),hb(nodesRoot),hb(outputsRoot),ub(raw.budget),hb(recoveryCommitment),hb(raw.reserveSecret)]),reserveNullifier=devicePagedReviewedNoteNullifierV4(raw.scope,reserveCommitment,raw.reserveSecret);
 need(new Set([inputCommitment,changeCommitment,recoveryCommitment,reserveCommitment]).size===4&&inputNullifier!==reserveNullifier);for(const output of outputs)need(![inputCommitment,changeCommitment,recoveryCommitment,reserveCommitment].includes(output));
 const statement={profile:'LIANUM_PAEG_FUNDED_PAGED_V3',...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment','operationId','budget','fundingNotBefore','fundingValidUntil','settleBefore'].map(k=>[k,raw[k]])),context,pages:String(pages.length),nodes:String(nodes.length),pagesRoot,nodesRoot,outputsRoot,pagesCommitment:sparseRoot('pages',pageDigests),nodesCommitment:sparseRoot('nodes',nodes.map(n=>n.nodeDigest)),outputsCommitment:sparseRoot('outputs',nodes.map(n=>n.node.payoutCommitment)),inputCommitment,inputNullifier,changeCommitment,recoveryCommitment,reserveCommitment,reserveNullifier};
 statement.authorizationRoot=hashGraph('authorization',[...scoped(statement),...['operationId','context','pagesRoot','nodesRoot','outputsRoot','pagesCommitment','nodesCommitment','outputsCommitment','inputCommitment','inputNullifier','changeCommitment','recoveryCommitment','reserveCommitment','reserveNullifier'].map(k=>hb(statement[k])),...['pages','nodes','budget','fundingNotBefore','fundingValidUntil','settleBefore'].map(k=>ub(statement[k]))]);
 return {statement,nodes};
}
