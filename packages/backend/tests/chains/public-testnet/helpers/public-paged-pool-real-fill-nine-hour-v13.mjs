/** Test-only external depositors in an owned Sepolia fork. Every slot is filled
 * by a genuine Original D26 proof, a unique note and its actual deposit value.
 * The synthetic funder never receives the wallet's Source financial authority.
 * No storage mutation, mocked capacity, production key or upstream write. */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Transaction} from 'micro-eth-signer';
import {freshKey,signature} from '../../../../../engine/src/notes/private-note-encoding.mjs';
import {walletDepositInput,walletInputPublicWords,walletNoteCommitment} from '../../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import * as Transit from '../../../../../engine/src/crypto/private-proof-transit-v1.mjs';
import {prepareOriginalDevicePagedDurableProofClientV6,readOriginalDevicePagedDurableProofResultV6} from '../../../../../engine/src/execution/local/device-paged-proof-client-v3.mjs';
import * as P from '../../../../../mobile-protocol/src/device-paged-owner-v3.mjs';
import {publicPagedAccountFromKeyV1} from '../../../../src/chains/public-testnet/wire-v1.mjs';
import {assertOriginalFundedPagedGraphSepoliaWalletV4} from '../../../../src/operations/local/funded-graph-paged-public-kernel-v4.mjs';
import {readOriginalFundedPagedGraphDeploymentV3,pagedGraphProofDataV3} from '../../../../src/operations/local/funded-graph-paged-deployment-v3.mjs';
import {readOriginalPagedPublicPoolCapacityV5} from '../../../../src/operations/recovery/paged-public-pool-capacity-v5.mjs';
import {publicSepoliaForkEvidenceV5,readPublicSepoliaForkV5} from '../../../../../../scripts/development/public-sepolia-fork-harness-v5.mjs';

const funders=new WeakMap(),sha=value=>createHash('sha256').update(value).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hex=value=>'0x'+BigInt(value).toString(16);
function own(handle){const s=funders.get(handle);assert.ok(s&&!s.closed,'POOL_FILL_ORIGINAL_EXTERNAL_FUNDER');return s;}

/** Prepare before the harness's one permitted synthetic balance seeding. */
export function prepareOriginalPagedPoolFunderFixtureV5(){
 assert.equal(arguments.length,0);let key,account;
 for(let i=0;i<8&&!account;i++){key?.fill(0);key=randomBytes(32);try{account=publicPagedAccountFromKeyV1('ethereum-sepolia',key);}catch{}}
 assert.ok(account,'POOL_FILL_FRESH_EXTERNAL_KEY');const token=Object.freeze(Object.create(null));
 funders.set(token,{key,account,device:freshKey(),owner:freshKey(),closed:false,started:false});return token;
}
export function readOriginalPagedPoolFunderAddressV5(handle){assert.equal(arguments.length,1);return own(handle).account.address;}
export function closeOriginalPagedPoolFunderFixtureV5(handle){assert.equal(arguments.length,1);const s=funders.get(handle);assert.ok(s,'POOL_FILL_ORIGINAL_EXTERNAL_FUNDER');if(s.closed)return;s.closed=true;s.key.fill(0);s.device=null;s.owner=null;}

/** Standalone fixture depositor permission. Its signed PC23 request proves its
 * own note; it does not create/clone a wallet Source permission or journal. */
function externalDescriptor(template,s){
 return P.normalizeDevicePagedDescriptorV3({...template,origin:'https://127.0.0.1:9443',pairingId:'external-pool-filler-'+randomUUID(),devicePublicKey:'04'+s.device.x.toString('hex')+s.device.y.toString('hex'),deadlineMs:P.devicePagedNowV3()+9*3600000,...(Object.hasOwn(template,'chainDeadlineSeconds')?{chainDeadlineSeconds:String(Math.floor(P.devicePagedNowV3()/1000)+9*3600)}:{})});
}

export async function fillOriginalPagedPublicPoolForRolloverV5(options){
 assert.equal(arguments.length,1);const {runtime,system,fork,funder,descriptor,directory,leaveSlots=2,maximumDeposits,onProgress,signal}=options;
 assert.ok(options&&Object.getPrototypeOf(options)===Object.prototype&&Object.keys(options).every(k=>['runtime','system','fork','funder','descriptor','directory','leaveSlots','maximumDeposits','onProgress','signal'].includes(k)),'POOL_FILL_EXACT_OPTIONS');
 assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,system);assert.ok(Number.isSafeInteger(leaveSlots)&&leaveSlots>=0&&leaveSlots<3,'POOL_FILL_REQUIRED_FULL_CAPACITY');
 assert.equal(runtime.metadata.chainId,'11155111');assert.equal(descriptor.pool,system.pool);assert.equal(descriptor.scope,system.scope);assert.equal(descriptor.policy,system.policy);assert.equal(descriptor.manifestSHA256,system.manifestSHA256);assert.equal(descriptor.consumerSHA256,system.consumerSHA256);
 assert.ok(signal===undefined||signal instanceof AbortSignal);assert.ok(onProgress===undefined||typeof onProgress==='function');
 const s=own(funder);assert.equal(s.started,false,'POOL_FILL_SINGLE_ATTEMPT');s.started=true;
 const forkEvidence=publicSepoliaForkEvidenceV5(fork);assert.equal(forkEvidence.publicPayments,0);assert.equal(forkEvidence.upstreamWriteAttempts,0);
 await mkdir(directory,{recursive:true,mode:0o700});const initial=await readOriginalPagedPublicPoolCapacityV5(runtime,system),target=BigInt(initial.capacity)-BigInt(leaveSlots);
 assert.equal(initial.liveReservations,'0','POOL_FILL_NO_LIVE_GRAPH');assert.ok(BigInt(initial.leafCount)<target,'POOL_FILL_ALREADY_FULL');
 const required=Number(target-BigInt(initial.leafCount));assert.ok(required>0&&required<=256);assert.ok(maximumDeposits===undefined||Number.isSafeInteger(maximumDeposits)&&maximumDeposits>0&&maximumDeposits<=256,'POOL_FILL_MEASUREMENT_LIMIT');const count=Math.min(required,maximumDeposits??256);assert.equal(await readPublicSepoliaForkV5(fork,'eth_getCode',[s.account.address,'latest']),'0x','POOL_FILL_EXTERNAL_EOA');assert.equal(BigInt(await readPublicSepoliaForkV5(fork,'eth_getTransactionCount',[s.account.address,'pending'])),0n,'POOL_FILL_UNUSED_EXTERNAL_NONCE');
 const deployment=readOriginalFundedPagedGraphDeploymentV3(runtime,system),d=externalDescriptor(descriptor,s),rows=[];let sequence=0;
 const live=()=>{assert.ok(!s.closed&&!signal?.aborted,'POOL_FILL_ABORTED');assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,system);assert.ok(P.devicePagedNowV3()<d.deadlineMs,'POOL_FILL_EXTERNAL_DESCRIPTOR_EXPIRED');};
 const progress=async(stage,extra={})=>{live();if(onProgress)await onProgress(Object.freeze({stage,completed:rows.length,total:count,...extra}));};
 async function rpc(method,params){
  live();publicSepoliaForkEvidenceV5(fork);assert.ok(['eth_estimateGas','eth_sendRawTransaction'].includes(method),'POOL_FILL_FIXED_LOCAL_METHOD');
  const response=await fetch(fork.rpcURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params}),redirect:'error',signal:AbortSignal.timeout(60000)});assert.equal(response.status,200,'POOL_FILL_OWNED_RPC_HTTP');const body=await response.json();if(body.error)throw Error('POOL_FILL_OWNED_RPC_REJECTED');return body.result;
 }
 async function persist(){await writeFile(join(directory,'fill-public-receipts.json'),JSON.stringify({profile:'ORIGINAL_GENUINE_EXTERNAL_POOL_FILL_V5',pool:system.pool,scope:system.scope,initial,targetLeafCount:target.toString(),rows,publicPayments:0},null,2)+'\n',{mode:0o600});}
 for(let i=0;i<count;i++){
  live();const note={type:4,...s.owner,rho:randomBytes(32),secret:randomBytes(32),value:initial.minimumDepositAtomic},commitment=walletNoteCommitment(system.scope,system.policy,note).toString('hex');let result,client,wire,transactionId;
  try{
   for(let attempt=0;attempt<3&&!result;attempt++){
    live();const head=await runtime.block();await runtime.assertCanonical(head);const epoch=(BigInt(head.timestamp)/600n).toString(),witness=walletDepositInput({scope:system.scope,policy:system.policy,epoch,note}),expected=walletInputPublicWords('deposit_balance',witness),jobId='external-pool-fill-'+String(i)+'-'+String(attempt)+'-'+randomUUID(),retention={path:join(directory,jobId,'private-deposit-proof.vault'),password:randomBytes(32).toString('hex')};
    await mkdir(join(directory,jobId),{recursive:true,mode:0o700});client=await prepareOriginalDevicePagedDurableProofClientV6('deposit',jobId,system.manifestSHA256,d,retention);
    const witnessSHA256=sha(JSON.stringify(P.snapshotDevicePagedWitnessV3(witness))),consent=P.normalizeDevicePagedConsentV3({version:3,profile:P.DEVICE_PAGED_OWNER_V3,descriptor:d,action:'PROVE_D26',mode:'deposit',jobId,challengeId:'external-pool-fill-'+randomUUID(),nonce:randomBytes(32).toString('hex'),rootId:randomBytes(32).toString('hex'),revision:1,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,publicInputs:expected,witnessSHA256,recipient:client.ready(),proofSHA256:null,expiresAt:P.devicePagedWallNowV3()+15000}),authorization={kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:sha(P.devicePagedPermissionMessageV3(consent)),witnessSHA256},cipher=Transit.sealPrivateProofJobV1(consent.recipient,{inputs:{profile:'ORIGINAL_DEVICE_PAGED_PRIVATE_INPUT_V3',consent,signature:signature(s.device,P.devicePagedPermissionMessageV3(consent)).toString('hex'),witness},expectedPublicInputs:expected,authorization});
    try{const intent=await client.prepareProofIntentV6(cipher,consent),proved=await client.continueProofIntentV6(intent,expected),actual=readOriginalDevicePagedDurableProofResultV6(client,proved);assert.deepEqual(actual.publicInputs,expected);assert.equal(actual.source.commitment,commitment);assert.ok(actual.proof.length>1000,'POOL_FILL_GENUINE_D26');const latest=await runtime.block();await runtime.assertCanonical(latest);
     if((BigInt(latest.timestamp)/600n).toString()!==epoch){actual.proof.fill(0);await progress('unused-proof-epoch-expired',{financialPost:false});}else result={proof:Buffer.from(actual.proof),publicInputs:[...actual.publicInputs],proofSHA256:sha(actual.proof)};actual.proof.fill(0);
    }finally{Transit.wipePrivateProofInputsV1(witness);Transit.wipePrivateProofInputsV1(cipher);await client.close();client=null;}
   }
   assert.ok(result,'POOL_FILL_FRESH_EPOCH_PROOF_REQUIRED');live();const calldata=pagedGraphProofDataV3(deployment.entries.pool.artifact,'depositBalance',result.proof,result.publicInputs),nonce=BigInt(await readPublicSepoliaForkV5(fork,'eth_getTransactionCount',[s.account.address,'pending']));assert.equal(nonce,BigInt(i),'POOL_FILL_RETAINED_NONCE');
   const transaction={from:s.account.address,to:system.pool,value:hex(note.value),data:calldata},estimated=BigInt(await rpc('eth_estimateGas',[transaction])),gasLimit=estimated+estimated/10n+10000n;assert.ok(gasLimit>21000n&&gasLimit<=30000000n,'POOL_FILL_GAS_BOUND');const amount=BigInt(note.value),balance=BigInt(await readPublicSepoliaForkV5(fork,'eth_getBalance',[s.account.address,'latest']));assert.ok(balance>=amount+gasLimit*2n,'POOL_FILL_SYNTHETIC_CAPITAL_REQUIRED');
   const signed=Transaction.prepare({type:'eip1559',chainId:11155111n,nonce,to:system.pool,value:amount,data:calldata,gasLimit,maxFeePerGas:2n,maxPriorityFeePerGas:1n,accessList:[]}).signBy(s.key,false);wire=signed.toHex();transactionId=signed.hash;assert.equal(signed.sender.toLowerCase(),s.account.address);assert.ok(signed.verifySignature());
   const row={ordinal:i,commitment,amount:note.value,proofSHA256:result.proofSHA256,transactionId,wireSHA256:sha(Buffer.from(wire.slice(2),'hex')),wire,stage:'SIGNED',receipt:null};rows.push(row);await persist();let postError=null;
   try{assert.equal(await rpc('eth_sendRawTransaction',[wire]),transactionId);}catch(error){postError=error;row.stage='UNKNOWN';await persist();}
   let receipt;for(let tries=0;tries<60&&!receipt;tries++){live();receipt=await readPublicSepoliaForkV5(fork,'eth_getTransactionReceipt',[transactionId]);if(!receipt)await sleep(1000);}
   assert.ok(receipt,'POOL_FILL_ORIGINAL_SEND_STILL_UNKNOWN');assert.equal(receipt.status,'0x1','POOL_FILL_ACTUAL_DEPOSIT_REVERTED');assert.equal(receipt.transactionHash,transactionId);assert.deepEqual(await runtime.receipt(transactionId),receipt);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);const originalTransaction=await readPublicSepoliaForkV5(fork,'eth_getTransactionByHash',[transactionId]);assert.equal(originalTransaction.from.toLowerCase(),s.account.address);assert.equal(originalTransaction.to.toLowerCase(),system.pool);assert.equal(originalTransaction.input,calldata);assert.equal(BigInt(originalTransaction.value),amount);
   const capacity=await readOriginalPagedPublicPoolCapacityV5(runtime,system);assert.equal(capacity.leafCount,(BigInt(initial.leafCount)+BigInt(i)+1n).toString());assert.equal(capacity.liveReservations,'0');assert.equal(capacity.backedAmountAtomic,(BigInt(initial.backedAmountAtomic)+BigInt(i+1)*amount).toString());const leaves=await deployment.ledgerLeaves({number:capacity.blockNumber,hash:capacity.blockHash,timestamp:capacity.blockTimestamp});assert.equal(leaves.leaves[Number(BigInt(initial.leafCount)+BigInt(i))],'0x'+commitment,'POOL_FILL_CANONICAL_INSERTED_NOTE');
   row.stage='CONFIRMED';row.receipt=receipt;row.responseLost=postError!==null;await persist();await progress('genuine-note-inserted',{leafCount:capacity.leafCount,backedAmountAtomic:capacity.backedAmountAtomic});
  }finally{result?.proof.fill(0);await client?.close();note.rho.fill(0);note.secret.fill(0);}
 }
 const capacity=await readOriginalPagedPublicPoolCapacityV5(runtime,system),complete=count===required;assert.equal(capacity.leafCount,(BigInt(initial.leafCount)+BigInt(count)).toString());if(complete){assert.equal(capacity.leafCount,target.toString());assert.equal(capacity.availableSlots,String(leaveSlots));assert.equal(capacity.acceptsDepositAndGraph,false);}assert.equal(rows.length,count);assert.ok(rows.every(r=>r.stage==='CONFIRMED'));const saved=await readFile(join(directory,'fill-public-receipts.json'));const snapshot=Object.freeze({head:Object.freeze({hash:capacity.blockHash,number:capacity.blockNumber,timestamp:capacity.blockTimestamp}),capacity:capacity.capacity,leafCount:capacity.leafCount,liveReservations:capacity.liveReservations,backedAmount:capacity.backedAmountAtomic,currentRoot:capacity.currentRoot,receiptsSHA256:sha(saved),genuineDeposits:rows.length,complete,syntheticCapital:true,publicPayments:0});await progress(complete?'real-pool-full':'genuine-fill-measurement-only',snapshot);return snapshot;
}
