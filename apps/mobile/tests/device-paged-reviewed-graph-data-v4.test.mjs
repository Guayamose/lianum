/** Portable review DATA parity + actual Vault signing guard. Cryptographic
 * keys/builders/signatures are real; storage and hostile OWNER replies are HOST
 * fixtures. No SDK capability, hardware, SNARK or chain exploit is claimed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import * as Graph from '../../../packages/engine/src/execution/graph/funded-graph-paged-v3.mjs';
import * as P from '../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {createBalanceNote,walletNoteCommitment} from '../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {signature,nullifier,uintBE} from '../../../packages/engine/src/notes/private-note-encoding.mjs';
import {nativeTransferActionCommitment,nativeReceiptKeyCommitment} from '../../../packages/engine/src/execution/native/dispatch/native-capsules.mjs';
import {deriveDevicePagedReviewedGraphDataV4} from '../src/custody/device-paged-reviewed-graph-data-v4.mjs';
const h=v=>createHash('sha256').update(v).digest('hex'),hex=()=>randomBytes(32).toString('hex'),Z='0'.repeat(64),opening=n=>({type:4,rho:n.rho.toString('hex'),x:n.x.toString('hex'),y:n.y.toString('hex'),value:n.value.toString(),secret:n.secret.toString('hex')});
function fixture(count=2,hasChange=true){
 const cfg=Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(k=>[k,hex()]));
 const input=createBalanceNote({...cfg,value:String(count+(hasChange?5:0))}),change=hasChange?createBalanceNote({...cfg,value:'5'}):null,recovery=createBalanceNote({...cfg,value:String(count)});
 Object.assign(cfg,{operationId:hex(),budget:String(count),fundingNotBefore:'10',fundingValidUntil:'100',settleBefore:'200',reservationNonce:hex(),reserveSecret:hex(),graphSalt:hex(),inputNote:opening(input),changeNote:change?opening(change):{type:4,rho:Z,x:Z,y:Z,value:'0',secret:Z},recoveryNote:opening(recovery)});
 const descriptor={...cfg,assetIdentity:cfg.asset},seed={command:Object.fromEntries(Object.entries(cfg).filter(([k])=>!['scope','policy','asset','hubDomain','registryCommitment'].includes(k)))},pages=[],payoutKeys=new Map();
 for(let i=0;i<count;i++){
  const pageIndex=Math.floor(i/64);pages[pageIndex]??={type:'page',pageIndex:String(pageIndex),salt:hex(),nodes:[]};
  const payout=createBalanceNote({...cfg,value:'1'}),ordinal=String(i),randomness=hex(),rho=Graph.pagedGraphHashV3('payout-origin',[...['scope','policy','asset','hubDomain','registryCommitment'].map(k=>Buffer.from(cfg[k],'hex')),Buffer.from(cfg.operationId,'hex'),uintBE(ordinal,8),Buffer.from(randomness,'hex')]);
  payout.rho=Buffer.from(rho,'hex');const payoutOpening=opening(payout),payoutCommitment=walletNoteCommitment(cfg.scope,cfg.policy,payout).toString('hex'),receiptSecret=hex(),receiptRho=hex(),receiptKeyCommitment=nativeReceiptKeyCommitment(cfg.hubDomain,receiptSecret),chainDomain=hex();
  const action={chainDomain,signerIdentity:hex(),sourceCommitment:hex(),destinationCommitment:hex(),amount:'1',custodyKind:1,custodyCommitment:hex(),executionFrom:'10',executionUntil:'100',settleBefore:'200',receiptKeyCommitment,receiptRho,deliveryRiskCommitment:hex(),actionSalt:hex()};
  const id='step-'+i,command={id,chainDomain,evidencePolicy:hex(),action,actionCommitment:nativeTransferActionCommitment(action),localCommitment:hex(),dispatchId:hex(),receiptSecret,receiptRho,dependsOn:i>0?[`step-${i-1}`,...(i>2?[`step-${Math.floor((i-1)/2)}`]:[])]:[],payout:{x:payoutOpening.x,y:payoutOpening.y,value:'1',secret:payoutOpening.secret,randomness}};
  pages[pageIndex].nodes.push({command,ordinal,receiptKeyCommitment,payoutCommitment,payout:{opening:payoutOpening,commitment:payoutCommitment,privateKey:id},intent:{family:'EVM',recipient:'0x'+'a'.repeat(40),amount:'1'}});payoutKeys.set(id,payout);
 }
 return {cfg,descriptor,seed,pages,input,payoutKeys};
}
function original(f,pages=f.pages){
 const builder=Graph.createFundedPagedGraphBuilderV3(f.cfg),ids=new Map(),context=Graph.pagedGraphHashV3('context',[...['scope','policy','asset','hubDomain','registryCommitment'].map(k=>Buffer.from(f.cfg[k],'hex')),Buffer.from(f.cfg.operationId,'hex'),Buffer.from(f.cfg.graphSalt,'hex')]);
 for(const page of pages){const rows=[];for(const own of page.nodes){const n=own.command,deps=n.dependsOn.map(id=>{assert.ok(ids.has(id));return ids.get(id);}).sort((a,b)=>BigInt(a.ordinal)<BigInt(b.ordinal)?-1:1),ordinal=String(ids.size);rows.push({idDigest:Graph.pagedGraphHashV3('device-symbolic-id',[Buffer.from(context,'hex'),Buffer.from(n.id)]),...Object.fromEntries(['chainDomain','evidencePolicy','actionCommitment','localCommitment','dispatchId','receiptRho'].map(k=>[k,n[k]])),receiptKeyCommitment:nativeReceiptKeyCommitment(f.cfg.hubDomain,n.receiptSecret),dependsOn:deps,payout:n.payout});
  // Original append resolves within-page dependencies, so derive prefix node
  // digest through a separate original builder only when needed below.
  const probe=Graph.createFundedPagedGraphBuilderV3(f.cfg);
  try{let first=0;for(const previous of pages.slice(0,Number(page.pageIndex))){Graph.appendFundedPagedGraphPageV3(probe,originalPages.get(previous));first+=previous.nodes.length;}Graph.appendFundedPagedGraphPageV3(probe,{pageIndex:page.pageIndex,firstNode:String(first),salt:page.salt,nodes:rows});const p=Graph.readFundedPagedGraphPreparedNodeV3(probe,ordinal);ids.set(n.id,{ordinal,nodeDigest:p.nodeDigest});}finally{Graph.closeFundedPagedGraphPreparationV3(probe);}
 }
 const command={pageIndex:page.pageIndex,firstNode:page.nodes[0].ordinal,salt:page.salt,nodes:rows};originalPages.set(page,command);Graph.appendFundedPagedGraphPageV3(builder,command);}
 const prepared=[...ids.values()].map(n=>Graph.readFundedPagedGraphPreparedNodeV3(builder,n.ordinal));return {builder,prepared,compiled:Graph.sealFundedPagedGraphV3(builder)};
}
const originalPages=new WeakMap();
const source=await readFile(new URL('../src/custody/device-paged-note-vault-v3.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('vault.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);let arrow;
function visit(n){if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='graphSignatureCommand')arrow=n.initializer;ts.forEachChild(n,visit);}visit(ast);assert.ok(ts.isArrowFunction(arrow));
const emitted=ts.transpileModule('const candidate='+arrow.getText(ast)+'; candidate;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function actualSigning(f,owner,invoice=null){let calls=0;const request=Graph.fundedPagedGraphSigningRequestV3(owner.compiled),ownerReply={type:'owner-signature-request',statement:owner.compiled.statement,request:{...request,message:request.message.toString('hex')}},replies=[{private:ownerReply},...(invoice?[{private:invoice}]:[])],local={seed:f.seed,pages:f.pages,pendingPage:null,events:[],replies},cm=walletNoteCommitment(f.cfg.scope,f.cfg.policy,f.input).toString('hex'),r={value:{graph:{phase:'SIGNING'},note:{opening:opening(f.input),commitment:cm,nullifier:nullifier(f.cfg.scope,cm,f.input.secret).toString('hex'),privateKey:'source'}}};
 const sign=(marker,frame)=>{calls++;try{return signature(marker==='source'?f.input:f.payoutKeys.get(marker),frame).toString('hex');}finally{frame.fill(0);}};
 const fn=vm.runInNewContext(emitted,{serial:fn=>fn(),read:async()=>structuredClone(r),graphLocal:async()=>local,need:(ok,code)=>{if(!ok)throw Error(code??'HOST_GUARD');},P,descriptor:f.descriptor,same:isDeepStrictEqual,walletSessionStatusV1:()=>({managed:false,active:false}),deriveDevicePagedReviewedGraphDataV4,hb:v=>Buffer.from(v,'hex'),ub:v=>uintBE(v,8),graphFrame:Graph.pagedGraphFrameV3,bytesToHex:b=>Buffer.from(b).toString('hex'),signGraphFrame:sign,wipeCustodyCopy:()=>{}});
 return {run:fn,calls:()=>calls};
}
for(const count of [1,65,130])test('portable locally retained review equals original statement and every prepared node: '+count,{timeout:60000},()=>{
 const f=fixture(count,count!==1),built=original(f);try{const review=deriveDevicePagedReviewedGraphDataV4(f.descriptor,f.seed,f.pages);assert.deepEqual(review.statement,built.compiled.statement);for(const n of review.nodes){const original=built.prepared[Number(n.ordinal)];assert.equal(n.nodeDigest,original.nodeDigest);assert.deepEqual(n.node,original.node);}}finally{Graph.closeFundedPagedGraphPreparationV3(built.builder);}
});
test('actual Vault signs the locally derived owner and invoices accepted by original builder',async()=>{
 const f=fixture(),built=original(f);try{let signer=actualSigning(f,built);const owner=await signer.run('0',false);assert.equal(signer.calls(),1);Graph.attachFundedPagedGraphOwnerSignatureV3(built.compiled,owner.ownerSignature);const qs=Graph.fundedPagedGraphPageInvoiceRequestsV3(built.compiled,'0'),requests=qs.map(q=>{const packet=Graph.readFundedPagedGraphRolePacketV3(built.compiled,q.ordinal);return{id:f.pages[0].nodes[Number(q.ordinal)].command.id,...q,nodeDigest:packet.nodeDigest,payoutCommitment:packet.node.payoutCommitment,message:q.message.toString('hex')};});signer=actualSigning(f,built,{type:'invoice-signature-requests',pageIndex:'0',requests});const result=await signer.run(null,true);assert.equal(result.ownerSignature,null);assert.equal(signer.calls(),2);for(const q of result.invoices)Graph.attachFundedPagedGraphInvoiceSignatureV3(built.compiled,f.pages[0].nodes.find(n=>n.command.id===q.id).ordinal,q.signature);}finally{Graph.closeFundedPagedGraphPreparationV3(built.builder);}
});
for(const [name,change] of [
 ['destination/action',p=>{p[0].nodes[0].command.action.destinationCommitment=hex();p[0].nodes[0].command.actionCommitment=nativeTransferActionCommitment(p[0].nodes[0].command.action);}],
 ['dependency',p=>{p[0].nodes[1].command.dependsOn=[];}],
 ['dispatch',p=>{p[0].nodes[0].command.dispatchId=hex();}],
 ['page salt',p=>{p[0].salt=hex();}],
 ['evidence policy',p=>{p[0].nodes[0].command.evidencePolicy=hex();}]
])test('actual Vault rejects coherent OWNER '+name+' substitution before any signature',async()=>{
 const f=fixture(),changed=structuredClone(f.pages);change(changed);const hostile=original(f,changed);try{const signer=actualSigning(f,hostile);await assert.rejects(signer.run('0',false),/MOBILE_PAGED_REVIEW_GRAPH_MISMATCH/);assert.equal(signer.calls(),0);}finally{Graph.closeFundedPagedGraphPreparationV3(hostile.builder);}
});
for(const field of ['nodeDigest','ordinal','payoutCommitment','id'])test('actual Vault rejects invoice '+field+' substitution before any signature',async()=>{
 const f=fixture(),built=original(f);try{const owner=await actualSigning(f,built).run('0',false);Graph.attachFundedPagedGraphOwnerSignatureV3(built.compiled,owner.ownerSignature);const qs=Graph.fundedPagedGraphPageInvoiceRequestsV3(built.compiled,'0'),requests=qs.map(q=>{const packet=Graph.readFundedPagedGraphRolePacketV3(built.compiled,q.ordinal);return{id:f.pages[0].nodes[Number(q.ordinal)].command.id,...q,nodeDigest:packet.nodeDigest,payoutCommitment:packet.node.payoutCommitment,message:q.message.toString('hex')};});if(field==='id')requests[1].id=requests[0].id;else if(field==='ordinal')requests[0].ordinal='1';else requests[0][field]=hex();const signer=actualSigning(f,built,{type:'invoice-signature-requests',pageIndex:'0',requests});await assert.rejects(signer.run(null,true),/MOBILE_PAGED_REVIEW_GRAPH_MISMATCH/);assert.equal(signer.calls(),0);}finally{Graph.closeFundedPagedGraphPreparationV3(built.builder);}
});

for(const field of ['fundingNotBefore','fundingValidUntil','settleBefore'])test('actual Vault rejects coherent original-builder '+field+' change before signing',async()=>{
 const f=fixture(),remote={...f,cfg:structuredClone(f.cfg)};remote.cfg[field]=field==='fundingNotBefore'?'11':field==='fundingValidUntil'?'99':'201';const hostile=original(remote);try{const signer=actualSigning(f,hostile);await assert.rejects(signer.run('0',false),/MOBILE_PAGED_REVIEW_GRAPH_MISMATCH/);assert.equal(signer.calls(),0);}finally{Graph.closeFundedPagedGraphPreparationV3(hostile.builder);}
});
test('actual Vault rejects coherent budget/output/change alteration before signing',async()=>{
 const f=fixture(),remote={...f,cfg:structuredClone(f.cfg)},changed=structuredClone(f.pages);remote.cfg.budget='3';remote.cfg.changeNote.value='4';remote.cfg.recoveryNote.value='3';changed[0].nodes[0].command.payout.value='2';const hostile=original(remote,changed);try{const signer=actualSigning(f,hostile);await assert.rejects(signer.run('0',false),/MOBILE_PAGED_REVIEW_GRAPH_MISMATCH/);assert.equal(signer.calls(),0);}finally{Graph.closeFundedPagedGraphPreparationV3(hostile.builder);}
});
