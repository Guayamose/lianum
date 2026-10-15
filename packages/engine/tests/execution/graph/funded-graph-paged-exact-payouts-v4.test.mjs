/** Synthetic security regression. No proof, chain, grant or payment is issued. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {projectRoot,legacyDataRoot} from '@lianum/environment';
import {verifyToolchain} from '@lianum/components/resources/wallet-resources';
import * as Graph from '../../../src/execution/graph/funded-graph-paged-v3.mjs';
import {freshKey,signature,uintBE} from '../../../src/notes/private-note-encoding.mjs';
import {nativeReceiptKeyCommitment,nativeReceiptCommitment} from '../../../src/execution/native/state/native-receipt.mjs';
import {walletNoteCommitment} from '../../../src/wallet/notes/private-wallet-note-encoding.mjs';
import {wipePrivateProofInputsV1} from '../../../src/crypto/private-proof-transit-v1.mjs';

const h=v=>createHash('sha256').update('PAEG exact payout synthetic '+v).digest('hex');
const bytes=v=>Buffer.from(v,'hex'),encoded=v=>[...bytes(v)],hex=v=>Buffer.from(v).toString('hex');
const words=v=>Array.from({length:8},(_,i)=>String(bytes(v).readUInt32BE(i*4)));
const roots=['pageChain','nodeChain','outputChain','spentRoot','effectRoot','receiptFrontier','edgeChain','activeNodeDigest','activeDependencyRoot'];
const scalars=['nextPage','nextNode','payoutSum','nextEdge','lastDependency','activeDependencyCount','revocationSequence','minReceiptUntil','maxReceiptFrom'];
const scoped=s=>['scope','policy','asset','hubDomain','registryCommitment'].map(k=>bytes(s[k]));
const domain=s=>Graph.pagedGraphHashV3('domain',scoped(s));
function authorization(s){return Graph.pagedGraphHashV3('authorization',[...scoped(s),...['operationId','context','pagesRoot','nodesRoot','outputsRoot','pagesCommitment','nodesCommitment','outputsCommitment','inputCommitment','inputNullifier','changeCommitment','recoveryCommitment','reserveCommitment','reserveNullifier'].map(k=>bytes(s[k])),...['pages','nodes','budget','fundingNotBefore','fundingValidUntil','settleBefore'].map(k=>uintBE(s[k],8))]);}
function commitments(s,p,blinding,readyBlinding,exact=true){
 const accumulator=Graph.pagedGraphHashV3('accumulator',[bytes(domain(s)),bytes(s.authorizationRoot),bytes(s.reserveNullifier),...scalars.map(k=>uintBE(p[k],8)),...[...roots,...(exact?['outputSparseRoot']:[])].map(k=>bytes(p[k]))]);
 const commitment=Graph.pagedGraphHashV3('private-progress',[bytes(domain(s)),bytes(s.authorizationRoot),bytes(s.reserveNullifier),bytes(accumulator),Buffer.from(blinding)]);
 return{commitment,readyCommitment:Graph.pagedGraphHashV3('private-ready',[bytes(domain(s)),bytes(s.authorizationRoot),bytes(s.reserveNullifier),bytes(commitment),Buffer.from(readyBlinding)])};
}
function fixture(){
 const owner=freshKey(),change=freshKey(),recovery=freshKey(),payout=freshKey(),note=(key,label,value)=>({type:4,rho:h(label+' rho'),x:key.x.toString('hex'),y:key.y.toString('hex'),value:String(value),secret:h(label+' secret')});
 const input={scope:h('scope'),policy:h('policy'),asset:h('asset'),hubDomain:h('hub'),registryCommitment:h('registry'),operationId:h('operation'),budget:'1',fundingNotBefore:'1',fundingValidUntil:'2',settleBefore:'9',reservationNonce:h('nonce'),reserveSecret:h('reserve'),graphSalt:h('salt'),inputNote:note(owner,'input',2),changeNote:note(change,'change',1),recoveryNote:note(recovery,'recovery',1)};
 const builder=Graph.createFundedPagedGraphBuilderV3(input),spendSecret=h('receipt secret');
 Graph.appendFundedPagedGraphPageV3(builder,{pageIndex:'0',firstNode:'0',salt:h('page'),nodes:[{idDigest:h('node'),chainDomain:h('chain'),evidencePolicy:h('evidence'),actionCommitment:h('action'),localCommitment:h('local'),dispatchId:h('dispatch'),receiptKeyCommitment:nativeReceiptKeyCommitment(input.hubDomain,spendSecret),receiptRho:h('receipt rho'),dependsOn:[],payout:{x:payout.x.toString('hex'),y:payout.y.toString('hex'),value:'1',secret:h('payout secret'),randomness:h('payout randomness')}}]});
 const compiled=Graph.sealFundedPagedGraphV3(builder);
 Graph.attachFundedPagedGraphOwnerSignatureV3(compiled,signature(owner,Graph.fundedPagedGraphSigningRequestV3(compiled).message).toString('hex'));
 for(const request of Graph.fundedPagedGraphPageInvoiceRequestsV3(compiled,'0'))Graph.attachFundedPagedGraphInvoiceSignatureV3(compiled,request.ordinal,signature(payout,request.message).toString('hex'));
 const initial=Graph.createFundedPagedGraphInitialProgressV3(compiled,'0'),emptyFrontier=Graph.pagedGraphSparseWitnessV3('frontier',[],'0'),emptyNative=Graph.pagedGraphSparseWitnessV3('admitted',[],'0');
 const edge=Graph.createFundedPagedGraphEdgeJobV3(compiled,{previous:initial,predecessorReceipt:'0'.repeat(64),predecessorFrontier:emptyFrontier.siblings,nativeEvidence:h('evidence head'),nativeReceiptRoot:emptyNative.root,validFrom:'2',validUntil:'8'});
 const ready=Graph.readOriginalFundedPagedGraphNextProgressV3(compiled,edge),packet=Graph.readFundedPagedGraphRolePacketV3(compiled,'0');
 const opening={...Object.fromEntries(['hubDomain','registryCommitment','scope','policy'].map(k=>[k,input[k]])),globalEffectId:h('effect'),...Object.fromEntries(['localCommitment','dispatchId','chainDomain','evidencePolicy','actionCommitment','payoutCommitment','receiptKeyCommitment','receiptRho'].map(k=>[k,packet.node[k]])),validFrom:'1',validUntil:'9'};
 const receipt=nativeReceiptCommitment(opening),index=BigInt('0x'+receipt.slice(48)).toString(),admitted=Graph.pagedGraphHashV3('admitted-receipt',[bytes(compiled.statement.authorizationRoot),bytes(receipt),bytes(opening.globalEffectId),uintBE(1,8),uintBE(9,8)]),native=Graph.pagedGraphSparseWitnessV3('admitted',[{index,digest:admitted}],index);
 const node=Graph.createFundedPagedGraphNodeJobV3(compiled,{previous:ready,opening,spendSecret,frontierSiblings:emptyFrontier.siblings,nativeEvidence:h('evidence head'),nativeReceiptRoot:native.root,nativeReceiptSiblings:native.siblings,validFrom:'2',validUntil:'8'}),final=Graph.readOriginalFundedPagedGraphNextProgressV3(compiled,node);
 const terminal=Graph.createFundedPagedGraphTerminalJobV3(compiled,{progress:final,nativeEvidence:h('evidence head'),validFrom:'2',validUntil:'8'});
 const extraNote=note(payout,'additional unexecuted payout',1),extraCommitment=walletNoteCommitment(input.scope,input.policy,extraNote).toString('hex');
 const extra=Graph.pagedGraphSparseWitnessV3('outputs',[{index:'0',digest:packet.node.payoutCommitment},{index:'1',digest:extraCommitment}],'1');
 return{builder,compiled,owner,initial,ready,final,node,terminal,extra,close(){Graph.closeFundedPagedGraphPreparationV3(builder);for(const key of [owner,change,recovery,payout])key.privateKey?.fill?.(0);}};
}

test('executed payout root begins empty, inserts the actual payout and rejects an extra retained leaf',()=>{
 const f=fixture();let retained;
 try{
  const initial=Graph.readFundedPagedGraphProgressWitnessV3(f.compiled,f.initial),next=Graph.readFundedPagedGraphProgressWitnessV3(f.compiled,f.final),job=Graph.readOriginalFundedPagedGraphProofJobV3(f.compiled,f.node);
  assert.equal(initial.progress.outputSparseRoot,Graph.pagedGraphSparseWitnessV3('outputs',[],'0').root);
  assert.equal(next.progress.outputSparseRoot,f.compiled.statement.outputsCommitment);
  assert.notEqual(next.progress.outputSparseRoot,f.extra.root);
  const siblings=job.inputs.accumulated_output_siblings.map(hex),payout=hex(job.inputs.node.payout_commitment);
  assert.equal(Graph.pagedGraphSparseEmptyRootV3('outputs','0',siblings),initial.progress.outputSparseRoot);
  assert.equal(Graph.pagedGraphSparseRootV3('outputs',payout,'0',siblings),next.progress.outputSparseRoot);
  retained=Graph.retainFundedPagedGraphPreparationV3(f.builder,f.compiled,[f.final]);
  const genuine=Graph.reopenFundedPagedGraphPreparationV3(retained);Graph.closeFundedPagedGraphPreparationV3(genuine.builder);
  const forged=structuredClone(retained),row=forged.progress[0];row.progress.outputSparseRoot=f.extra.root;
  Object.assign(row,commitments(f.compiled.statement,row.progress,row.blinding,row.readyBlinding));
  assert.throws(()=>Graph.reopenFundedPagedGraphPreparationV3(forged),/PAEG_PAGED_RETENTION_OUTPUTS_NOT_EXACT/);
  const legacy=structuredClone(retained);delete legacy.progress[0].progress.outputSparseRoot;
  assert.throws(()=>Graph.reopenFundedPagedGraphPreparationV3(legacy),/PAEG_PAGED_FIELDS/);
  wipePrivateProofInputsV1(job.inputs);wipePrivateProofInputsV1(forged);wipePrivateProofInputsV1(legacy);wipePrivateProofInputsV1(initial);wipePrivateProofInputsV1(next);
 }finally{wipePrivateProofInputsV1(retained);f.close();}
});

const sourceRoot=join(projectRoot,'packages/proofs/programs/funded-graph-paged-v3');
const newProgram=join(sourceRoot,'.local/exact-payouts-v4/compiled/terminal.json');
test('original Noir terminal accepted a coherent extra-note tree; exact payout terminal rejects it',{skip:!existsSync(newProgram)},async()=>{
 verifyToolchain();const requireOriginal=createRequire(join(legacyDataRoot('engine'),'experiments/private-core-proof/package.json'));
 const {Noir}=await import(pathToFileURL(requireOriginal.resolve('@noir-lang/noir_js')));
 const oldProgram=join(sourceRoot,'.local/poseidon-sparse-v3-consumer-fix-v1/prepared/terminal.json');
 const oldManifestBytes=readFileSync(join(sourceRoot,'.local/poseidon-sparse-v3-consumer-fix-v1/manifest.json'));
 assert.equal(createHash('sha256').update(oldManifestBytes).digest('hex'),'a3cfb7d05246a5876590f1c5c0a50ab8313c7d1e863dfe7636f18aa8199fe8aa');
 const oldBytes=readFileSync(oldProgram);assert.equal(createHash('sha256').update(oldBytes).digest('hex'),JSON.parse(oldManifestBytes).roles.terminal.programSHA256);
 const newBytes=readFileSync(newProgram),record=JSON.parse(readFileSync(newProgram+'.manifest.json','utf8'));
 assert.equal(record.securityGeneration,'EXACT_PAYOUT_SET_V4');
 assert.equal(createHash('sha256').update(newBytes).digest('hex'),record.programSHA256);
 for(const path of ['lib/src/progress.nr','lib/src/framing.nr','circuits/terminal/src/main.nr']){
  const pinned=record.sources.find(row=>row.path===join('packages/proofs/programs/funded-graph-paged-v3',path));assert.ok(pinned);
  assert.equal(createHash('sha256').update(readFileSync(join(sourceRoot,path))).digest('hex'),pinned.sha256);
 }
 const f=fixture();let honest,attack,legacy;
 try{
  honest=Graph.readOriginalFundedPagedGraphProofJobV3(f.compiled,f.terminal).inputs;
  await new Noir(JSON.parse(newBytes)).execute(honest);
  attack=structuredClone(honest);const s={...f.compiled.statement,outputsCommitment:f.extra.root};s.authorizationRoot=authorization(s);
  // Original owner can sign these terms; a signature must not turn an extra
  // sparse leaf into an executed payout. No signature is submitted anywhere.
  assert.equal(signature(f.owner,Graph.pagedGraphFrameV3('owner',[bytes(s.authorizationRoot)])).length,64);
  attack.statement.outputs_commitment=encoded(s.outputsCommitment);attack.statement.authorization_root=encoded(s.authorizationRoot);
  attack.public_inputs.splice(8,8,...words(s.authorizationRoot));
  const p=Graph.readFundedPagedGraphProgressWitnessV3(f.compiled,f.final).progress;
  const exactCommitment=commitments(s,p,attack.final_blinding,Array(32).fill(1)).commitment;
  attack.public_inputs.splice(24,8,...words(exactCommitment));
  legacy=structuredClone(attack);delete legacy.final_progress.output_sparse_root;
  legacy.public_inputs.splice(24,8,...words(commitments(s,p,legacy.final_blinding,Array(32).fill(1),false).commitment));
  await new Noir(JSON.parse(oldBytes)).execute(legacy);
  let rejected=false;try{await new Noir(JSON.parse(newBytes)).execute(attack);}catch{rejected=true;}
  assert.equal(rejected,true,'NOIR_EXTRA_PAYOUT_TREE_MUST_BE_REJECTED');
 }finally{wipePrivateProofInputsV1(honest);wipePrivateProofInputsV1(attack);wipePrivateProofInputsV1(legacy);f.close();}
});

test('compiled exact fold accepts the original NODE and rejects a forged accumulated payout path',async()=>{
 verifyToolchain();const requireOriginal=createRequire(join(legacyDataRoot('engine'),'experiments/private-core-proof/package.json'));
 const {Noir}=await import(pathToFileURL(requireOriginal.resolve('@noir-lang/noir_js')));
 const path=join(sourceRoot,'.local/exact-payouts-v4/compiled/fold.json'),program=readFileSync(path),record=JSON.parse(readFileSync(path+'.manifest.json','utf8'));
 assert.equal(record.securityGeneration,'EXACT_PAYOUT_SET_V4');assert.equal(createHash('sha256').update(program).digest('hex'),record.programSHA256);
 const f=fixture();let honest,attack;
 try{honest=Graph.readOriginalFundedPagedGraphProofJobV3(f.compiled,f.node).inputs;await new Noir(JSON.parse(program)).execute(honest);
  attack=structuredClone(honest);attack.accumulated_output_siblings[0]=Array(32).fill(0);
  let rejected=false;try{await new Noir(JSON.parse(program)).execute(attack);}catch{rejected=true;}
  assert.equal(rejected,true,'FOLD_MUST_INSERT_IN_THE_ORIGINAL_ACCUMULATED_TREE');
 }finally{wipePrivateProofInputsV1(honest);wipePrivateProofInputsV1(attack);f.close();}
});
