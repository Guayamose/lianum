/** HOST ONLY: authentic encrypted custody/signatures, mocked pool verifier and
 * operation host. No proof generation, native nodes or acceptance claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {PrivateNoteTree,privateSpentDigest} from '../src/private-note-tree.mjs';
import {freshKey,createGraph,reserveInput} from '../src/private-note-encoding.mjs';
import {decodeWalletProofCalldata,walletCustodySnapshot} from '../src/private-wallet-authority.mjs';
import {privateVerifierCalldata} from '../src/private-wallet-runtime.mjs';
import {createPrivateWalletAuthority} from '../src/private-wallet-engine.mjs';
import {recoverPrivateWalletCustody} from '../src/private-wallet-custody.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0'),w=n=>BigInt(n).toString(16).padStart(64,'0');

test('HOST: pair admission authenticates only the parked pre-prepare original; cancellation during final funding ACK prevents send',{timeout:30000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pc26-engine-admission-'));await chmod(directory,0o700);let release,entered,hold=false,balance=0n,height=0;const enter=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
 const policies={minimumBtcConfirmations:6};for(const role of ['sol','btc']){const k=freshKey();policies[role]={policyId:randomBytes(32).toString('hex'),identityNamespace:randomBytes(32).toString('hex'),genesis:randomBytes(32).toString('hex'),x:k.x.toString('hex'),y:k.y.toString('hex')};}
 const terms={budget:'10',solCompensation:'5',amountSol:'30',numerator:'1',denominator:'30'},scope=h(21),graph=createGraph({scope:scope.slice(2),policy:policies,epoch:'10',claimEpoch:'22',sourceSol:h(30).slice(2),recipientSol:h(31).slice(2),recipientBtc:h(32).slice(2),...terms}),policy='0x'+graph.policy.toString('hex'),poolAddress='0x'+'3'.repeat(40),blocks=new Map(),snapshots=new Map(),receipts=new Map();let leaves=[],spent=[];
 const snapshot=()=>({scope,policy,root:new PrivateNoteTree(leaves).root,stateSequence:String(height),sequence:String(height),epoch:'10',blockNumber:'0x'+height.toString(16),blockHash:h(100+height),blockTimestamp:'6000',leafCount:leaves.length,spentCount:spent.length,liveReservations:0,liveOutputNotes:leaves.length-spent.length,leaves:[...leaves],nullifiers:[...spent]});snapshots.set('0x0',snapshot());blocks.set('0x0',{number:'0x0',hash:h(100),timestamp:'0x1770',transactions:[]});
 const pool={address:poolAddress,scope,policy,selectors:{'depositBalance(bytes,bytes32[])':'12345678','reserveFromNoteGuarded(bytes,bytes32[])':'12345679'},receipts:[],snapshot:async(b='latest')=>structuredClone(b==='latest'?snapshot():snapshots.get(b)),proofData:(mode,proof,inputs)=>privateVerifierCalldata(mode==='deposit_balance'?'12345678':'12345679',proof,inputs),verify:async()=>true,call:async(method,args)=>leaves.includes(args[0])?h(1):h(0),send:async(label,tx)=>{const decoded=decodeWalletProofCalldata(tx.data,'deposit_balance','12345678');leaves.push(decoded.statement.output);balance+=BigInt(tx.value);height++;const blockNumber='0x'+height.toString(16),hash=h(200+height),transaction={hash,to:poolAddress,value:tx.value,input:tx.data,blockNumber,blockHash:h(100+height)},receipt={status:'0x1',transactionHash:hash,to:poolAddress,blockNumber,blockHash:h(100+height),logs:[{address:poolAddress,topics:['0x3d5d716b1a3d4959e2b29a1d38e0735b523cf62b1a1292d2a2870d669706653c',h(height)],data:'0x'+snapshot().root.slice(2)+privateSpentDigest(scope,spent,spent.length).slice(2)+w(leaves.length)+w(spent.length)}]};blocks.set(blockNumber,{number:blockNumber,hash:h(100+height),timestamp:'0x1770',transactions:[transaction]});snapshots.set(blockNumber,snapshot());receipts.set(hash,receipt);return receipt;}};
 const runtime={accounts:['0x'+'4'.repeat(40),'0x'+'5'.repeat(40),'0x'+'6'.repeat(40)],balance:async()=>balance,evm:async(method,args)=>{if(method==='eth_getTransactionReceipt')return receipts.get(args[0]);if(method==='eth_getBlockByNumber'){const b=structuredClone(blocks.get(args[0]));if(!args[1])b.transactions=b.transactions.map(t=>t.hash);return b;}throw Error(method);}};
 const identity={walletId:'a'.repeat(32),pool:poolAddress.slice(2),scope:scope.slice(2),policy:policy.slice(2),chainId:'31337',evmGenesis:h(1).slice(2),bitcoinGenesis:h(2).slice(2),solanaGenesis:h(3).slice(2),issuerLifetime:h(4).slice(2),deploymentHash:h(5).slice(2),verifierSetHash:h(6).slice(2)};
 const shared={pool,runtime,identity,local:directory,heavy:async(l,f)=>f(),mutate:async(l,f)=>f(),tick:async()=>6000,refreshClock:async()=>6000,prepareEpochWindow:async()=>6000,audit:async()=>{},archiveReceipts:async()=>{},privateState:async()=>({snapshot:snapshot()}),close:async()=>{}};

 let waiting=false,allowExposure=true,reserveSends=0,guardCalls=0,ackEnter,ackRelease,custodyConfig,operationHost;
 const atAck=new Promise(r=>ackEnter=r),ackGate=new Promise(r=>ackRelease=r),paymentIntent='9'.repeat(32),paymentOperation='8'.repeat(32);
 shared.isPaymentAdmissionSafe=operationId=>waiting&&operationId===paymentOperation;
 shared.assertPaymentExposure=operationId=>{guardCalls++;assert.equal(operationId,paymentOperation);assert.equal(allowExposure,true,'TEST_COHORT_CANCELLED_DURING_ACK');};
 const originalSend=pool.send;pool.send=async(label,tx)=>{if(label==='exact wallet reserve_from_note'){reserveSends++;throw Error('UNEXPECTED_RESERVATION_SEND');}return originalSend(label,tx);};
 const authority=createPrivateWalletAuthority({walletId:identity.walletId,profile:'PC23_SHARED_LOCAL_V1',onCheckpoint:async summary=>{if(summary.activeOperationId===paymentOperation&&summary.progressCode==='EXACT_SUBMISSION_PENDING'){ackEnter();await ackGate;}}},{
  createRuntime:async()=>shared,
  runSigner:async input=>{const c=await recoverPrivateWalletCustody(input.custody);const preparation=await c.prepareTopUp(input.request);await c.depositInput({requestId:input.request.requestId});const checkpoint=c.checkpoint();c.close();return{preparation,checkpoint,proof:{version:1,mode:'deposit_balance',target:'evm',proofBase64:'AQ==',publicInputs:preparation.publicInputs}};},
  createOperationHost:async(context,_shared,cfg)=>{
   custodyConfig=cfg;let preparation,proof;
   operationHost={
    async prepare(){waiting=true;const a=await authority.privatePaymentAdmission({intentId:paymentIntent,operationId:paymentOperation});assert.equal(a.state,'EXECUTING');assert.equal(a.inputValue,'30');assert.equal(a.inputCommitment,context.inputCommitment);waiting=false;},
    async prepareReserve(){
     assert.throws(()=>authority.privatePaymentAdmission({intentId:paymentIntent,operationId:paymentOperation}),/ADMISSION_DURING_WRITE/);
     const c=await recoverPrivateWalletCustody(cfg),s=await pool.snapshot();
     const p=await c.prepareSpend({requestId:paymentOperation,operationId:paymentOperation,inputCommitment:context.inputCommitment,approvedGraph:reserveInput(graph,'10'),snapshot:walletCustodySnapshot(s),terms});
     await c.reserveInput({requestId:paymentOperation,graph,epoch:'10',path:p.inputPath,expectedBaseRoot:p.expectedBaseRoot,expectedSequence:p.expectedSequence,expectedPostRoot:p.expectedPostRoot});
     const checkpoint=c.checkpoint();c.close();await context.custodyCheckpoint(checkpoint);
     preparation={...p,snapshot:s};proof={version:1,mode:'reserve_from_note',target:'evm',proofBase64:'AQ==',publicInputs:p.publicInputs};
    },
    async authorize(){},async releaseOwner(){},async assertOwnerExited(){},
    async reserve(){await context.submitSpend({reserve:proof,projection:preparation});},
    async cleanup(){},
   };return operationHost;
  },
 });
 try{
  await authority.action('open');await authority.action('prepareIntent',{intentId:'b'.repeat(32),kind:'topup',terms:{amount:'30'}});await authority.action('execute',{intentId:'b'.repeat(32),operationId:'c'.repeat(32)});
  await authority.action('prepareIntent',{intentId:paymentIntent,kind:'payment',terms});
  const running=authority.action('execute',{intentId:paymentIntent,operationId:paymentOperation});const outcome=assert.rejects(running,/TEST_COHORT_CANCELLED_DURING_ACK/);
  await atAck;assert.equal(guardCalls,0);assert.equal(reserveSends,0);allowExposure=false;ackRelease();await outcome;
  assert.equal(guardCalls,1);assert.equal(reserveSends,0);const current=await authority.privateStatus();assert.equal(current.intents.find(i=>i.intentId===paymentIntent).state,'UNKNOWN');assert.equal(current.availableWei,'0');assert.equal(current.pendingWei,'30');
  assert.equal(authority.status().authorityState,'LIVE');assert.equal(typeof operationHost.cleanup,'function');assert.ok(custodyConfig.path.endsWith('balance.vault'));
 }finally{ackRelease();await authority.abort();await rm(directory,{recursive:true,force:true});}
});
