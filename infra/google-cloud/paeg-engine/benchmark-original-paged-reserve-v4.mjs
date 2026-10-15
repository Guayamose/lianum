/** Offline genuine reserve proof on the installed public motor's own resource
 * graph. All notes are ephemeral benchmark notes. No RPC, wallet configuration,
 * server signing key, Source permission or financial journal is opened. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const original=path=>import(pathToFileURL(join(root,path)).href);
const G=await original('packages/engine/src/execution/graph/funded-graph-paged-v3.mjs');
const {freshKey,signature}=await original('packages/engine/src/notes/private-note-encoding.mjs');
const {createFundedPagedGraphProofClientV3,readOriginalFundedPagedGraphProofResultV3}=await original('packages/proofs/src/toolchain/paged-proof-client-v3.mjs');
const {assertOriginalPagedNativeFinancialSourceV3}=await original('packages/backend/src/operations/local/funded-paged-native-source-v3.mjs');
const {wipePrivateProofInputsV1}=await original('packages/engine/src/crypto/private-proof-transit-v1.mjs');
const h=x=>createHash('sha256').update('Lianum remote actual R benchmark '+x).digest('hex');
const keys=Array.from({length:4},()=>freshKey()),[owner,change,recovery,payout]=keys;
const note=(key,label,value)=>({type:4,rho:h(label+'rho'),x:key.x.toString('hex'),y:key.y.toString('hex'),value:String(value),secret:h(label+'secret')});
const input={scope:h('scope'),policy:h('policy'),asset:h('asset'),hubDomain:h('hub'),registryCommitment:h('registry'),operationId:h('operation'),budget:'3',fundingNotBefore:'1',fundingValidUntil:'2',settleBefore:'9',reservationNonce:h('nonce'),reserveSecret:h('reserve'),graphSalt:h('salt'),inputNote:note(owner,'input',4),changeNote:note(change,'change',1),recoveryNote:note(recovery,'recovery',3)};
let builder,client,proof;const start=performance.now();
try{
 builder=G.createFundedPagedGraphBuilderV3(input);
 const nodes=Array.from({length:3},(_,i)=>({idDigest:h('id'+i),chainDomain:h('chain'),evidencePolicy:h('evidence'),actionCommitment:h('action'+i),localCommitment:h('local'+i),dispatchId:h('dispatch'+i),receiptKeyCommitment:h('receiptkey'+i),receiptRho:h('rho'+i),dependsOn:[],payout:{x:payout.x.toString('hex'),y:payout.y.toString('hex'),value:'1',secret:h('payoutsecret'+i),randomness:h('randomness'+i)}}));
 G.appendFundedPagedGraphPageV3(builder,{pageIndex:'0',firstNode:'0',nodes,salt:h('page')});
 const compiled=G.sealFundedPagedGraphV3(builder);G.attachFundedPagedGraphOwnerSignatureV3(compiled,signature(owner,G.fundedPagedGraphSigningRequestV3(compiled).message).toString('hex'));
 for(const invoice of G.fundedPagedGraphPageInvoiceRequestsV3(compiled,'0'))G.attachFundedPagedGraphInvoiceSignatureV3(compiled,invoice.ordinal,signature(payout,invoice.message).toString('hex'));
 let root=compiled.statement.inputCommitment,empty='0'.repeat(64);const siblings=[];
 for(let i=0;i<8;i++){siblings.push(empty);root=createHash('sha256').update(Buffer.concat([Buffer.from([1]),Buffer.from(root,'hex'),Buffer.from(empty,'hex')])).digest('hex');empty=createHash('sha256').update(Buffer.concat([Buffer.from([1]),Buffer.from(empty,'hex'),Buffer.from(empty,'hex')])).digest('hex');}
 const initial=G.createFundedPagedGraphInitialProgressV3(compiled,'0');const job=G.createFundedPagedGraphReserveJobV3(compiled,{root,siblings,index:'0',progress:initial});
 const selection={manifestSHA256:assertOriginalPagedNativeFinancialSourceV3().pagedManifestSHA256};
 client=createFundedPagedGraphProofClientV3(selection.manifestSHA256);
 const result=await client.provePrepared(compiled,job);proof=readOriginalFundedPagedGraphProofResultV3(client,result,'reserve');
 assert.equal(proof.publicInputs.length,119);
 process.stdout.write(JSON.stringify({profile:'ACTUAL_REMOTE_PAGED_RESERVE_SNARK_BENCHMARK_V4',mode:'reserve',nodes:3,publicWords:proof.publicInputs.length,proofSHA256:createHash('sha256').update(proof.proof).digest('hex'),wallSeconds:Math.round((performance.now()-start)*1000)/1000000,actualProver:true,independentWasmVerification:true,actualProofs:1,publicRPC:false,financialSourceOpened:false,serverSigningKeysOpened:false,transactionsBroadcast:0,androidBiometrics:false})+'\n');
}finally{proof?.proof.fill(0);await client?.close();if(builder)G.closeFundedPagedGraphPreparationV3(builder);wipePrivateProofInputsV1(input);for(const key of keys)wipePrivateProofInputsV1(key);}
