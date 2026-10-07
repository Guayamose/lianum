/** Surviving PC23 owned-local runtime. One pool, issuer, clock and heavy lease.
 * No idle timer and no node/keeper restart claim. All constructor configuration
 * is trusted module code, never a user-supplied endpoint/key/source override. */
import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createOwnedNativeRuntime,createOwnedNativeCohortRuntime} from '../../chains/shared/native-runtime.mjs';
import {createOwnedSolanaRuntime,createOwnedSolanaCohortRuntime,base58Decode,SOLANA_BOUNDED_LEDGER_PROFILE} from '../../chains/solana/solana-runtime.mjs';
import {projectRoot} from '../../chains/shared/runtime-harness.mjs';
import {createPrivateWalletResourceTelemetry} from '../resources/private-wallet-resource-telemetry.mjs';
import {checkPrivateWalletSourcePrerequisites} from '../notes/private-wallet-prerequisites.mjs';
import {createDisposableNativeIssuerLifetime} from '../../notes/private-native-certificate.mjs';
import {policyCommitment} from '../../notes/private-note-encoding.mjs';
import {deployPrivateWalletNativePool,PRIVATE_WALLET_POOL_METHODS} from '../runtime/private-wallet-runtime.mjs';
import {checkPrivatePaymentPrerequisites,resourceGuard,durablePrivateFile,verifyPrivatePaymentFileIntegrity} from '../../payments/private-payment-engine.mjs';
import {assertPrivateSnapshotCanonical} from '../../assembly/private-assembly-runtime.mjs';
import {WALLET_PUBLIC_WORDS,decodeWalletPoolInputs} from '../notes/private-wallet-note-encoding.mjs';
import {PrivateNoteTree,privateSpentDigest} from '../../notes/private-note-tree.mjs';
import {applyPrivateWalletCapacityTransition} from '../resources/private-wallet-capacity.mjs';
import {captureAssemblyEvmReceipt} from '../../assembly/private-assembly-evm-audit.mjs';
import {createPrivateCohortParticipantBindings,PRIVATE_COHORT_PROFILE} from '../../cohorts/private-cohort-runtime.mjs';
import {createPrivateCohortCapture} from '../../cohorts/private-cohort-capture.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const pref=value=>'0x'+Buffer.from(value).toString('hex');
const raw=value=>value.replace(/^0x/,'');
const TRUE='0x'+'0'.repeat(63)+'1',FALSE='0x'+'0'.repeat(64);
const policyFor=bridge=>{const p=bridge.policy;return{policyId:p.policyId,identityNamespace:p.identityNamespace,genesis:p.chainDomain.genesis,x:p.issuerPublicKey.x,y:p.issuerPublicKey.y};};
export function walletCustodySnapshot(s){return{root:raw(s.root),sequence:s.stateSequence,epoch:s.epoch,blockHash:raw(s.blockHash),leaves:s.leaves.slice(0,s.leafCount).map(raw),spentNullifiers:s.nullifiers.slice(0,s.spentCount).map(raw)};}
export function decodeWalletProofCalldata(data,mode,selector){
 assert.match(data,/^0x[0-9a-f]+$/i,'PC23_CALLDATA');assert.ok(data.length<600000,'PC23_CALLDATA_SIZE');
 assert.equal(data.slice(2,10).toLowerCase(),selector.toLowerCase(),'PC23_CALLDATA_METHOD');const body=data.slice(10).toLowerCase();
 const at=offset=>{const w=body.slice(offset*2,offset*2+64);assert.equal(w.length,64,'PC23_CALLDATA_BOUNDS');return BigInt('0x'+w);};
 assert.equal(at(0),64n,'PC23_CALLDATA_OFFSET');const n=at(64);assert.ok(n>0n&&n<=262144n,'PC23_CALLDATA_PROOF');
 const padded=Math.ceil(Number(n)/32)*32,offset=96+padded;assert.equal(at(32),BigInt(offset),'PC23_CALLDATA_OFFSET');
 const count=WALLET_PUBLIC_WORDS[mode];assert.equal(at(offset),BigInt(count),'PC23_CALLDATA_WORDS');assert.equal(body.length,(offset+32+count*32)*2,'PC23_CALLDATA_SIZE');
 assert.equal(body.slice((96+Number(n))*2,offset*2),'0'.repeat((padded-Number(n))*2),'PC23_CALLDATA_PADDING');
 const publicInputs=Array.from({length:count},(_,i)=>at(offset+32+i*32).toString());return{publicInputs,statement:decodeWalletPoolInputs(mode,publicInputs),proofSHA256:sha(Buffer.from(body.slice(192,192+Number(n)*2),'hex'))};
}
/** Public fields, canonical successful receipt and exact final state bind an S.
 * Sender, transaction hash and proof bytes are deliberately NOT identity: a
 * copied valid S may win at its signed exact prestate. A later local status-0
 * does not make its consumed input available. */
const STATE_ADVANCED_TOPIC='0x3d5d716b1a3d4959e2b29a1d38e0735b523cf62b1a1292d2a2870d669706653c';
const WITHDRAWAL_TOPIC='0x8c6afca18616d300c4fb7eff2f714229e89e93825b143dc4ecc04231972aa19f';
export function walletTransitionObservation({pool,mode,transaction,receipt,block,decoded,endSnapshot}){
 if(pool.assetIdentity!==undefined)assert.match(pool.assetIdentity,/^0x[0-9a-f]{64}$/,'PC25_OBSERVATION_ASSET');assert.equal(BigInt(transaction.value),mode==='deposit_balance'&&(pool.assetIdentity===undefined||pool.asset==='0x'+'00'.repeat(20))?BigInt(decoded.statement.amount):0n,'PC25_TRANSITION_VALUE');
 const st=decoded.statement,logs=receipt.logs.filter(l=>l.address?.toLowerCase()===pool.address&&l.topics?.[0]?.toLowerCase()===STATE_ADVANCED_TOPIC);
 assert.equal(logs.length,1,'PC23_STATE_EVENT_COUNT');const log=logs[0];assert.equal(log.removed===true,false,'PC23_REMOVED_EVENT');
 assert.equal(log.topics.length,2,'PC23_STATE_EVENT_TOPICS');assert.match(log.topics[1],/^0x[0-9a-f]{64}$/i);assert.match(log.data,/^0x[0-9a-f]{256}$/i);
 const w=log.data.slice(2).match(/.{64}/g),sequence=BigInt(log.topics[1]).toString(),root='0x'+w[0],spent='0x'+w[1],leaves=Number(BigInt('0x'+w[2])),consumed=Number(BigInt('0x'+w[3]));
 assert.ok(leaves<=endSnapshot.leafCount&&consumed<=endSnapshot.spentCount&&leaves<=64&&consumed<=64,'PC23_EVENT_COUNTERS');
 const snapshot={root:raw(root),sequence,epoch:st.epoch,blockHash:raw(block.hash),leaves:endSnapshot.leaves.slice(0,leaves).map(raw),spentNullifiers:endSnapshot.nullifiers.slice(0,consumed).map(raw)};
 assert.equal(new PrivateNoteTree(snapshot.leaves).root,root,'PC23_EVENT_APPEND_ROOT');assert.equal(privateSpentDigest(pool.scope,endSnapshot.nullifiers.slice(0,consumed),consumed),spent,'PC23_EVENT_SPENT_DIGEST');
 const insertCount=mode==='deposit_balance'?1:mode==='reserve_from_note'?2:0,spendCount=mode==='deposit_balance'?0:1;
 const insertedCommitments=snapshot.leaves.slice(leaves-insertCount),spentNullifiers=snapshot.spentNullifiers.slice(consumed-spendCount);
 if(insertCount===0)insertedCommitments.length=0;if(spendCount===0)spentNullifiers.length=0;
 const preRoot=raw(new PrivateNoteTree(snapshot.leaves.slice(0,leaves-insertCount)).root),preSequence=(BigInt(sequence)-1n).toString();
 assert.ok(BigInt(sequence)>0n,'PC23_EVENT_SEQUENCE');
 if(mode==='reserve_from_note'){
  assert.equal(root,st.expectedPostRoot,'PC23_EVENT_POSTROOT');assert.equal(sequence,(BigInt(st.expectedSequence)+1n).toString(),'PC23_EVENT_SEQUENCE');assert.equal('0x'+preRoot,st.expectedBaseRoot,'PC23_EVENT_PRE_ROOT');
  assert.deepEqual(insertedCommitments,[raw(st.output),raw(st.change)],'PC23_EVENT_APPEND_ORDER');assert.deepEqual(spentNullifiers,[raw(st.nullifier)],'PC23_EVENT_NULLIFIER');
 }else if(mode==='deposit_balance')assert.deepEqual(insertedCommitments,[raw(st.output)],'PC23_EVENT_DEPOSIT');
 else{
  assert.deepEqual(spentNullifiers,[raw(st.nullifier)],'PC23_EVENT_NULLIFIER');
  const events=receipt.logs.filter(l=>l.address?.toLowerCase()===pool.address&&l.topics?.length===2&&l.topics[0]?.toLowerCase()===WITHDRAWAL_TOPIC&&l.topics[1]?.toLowerCase()==='0x'+'0'.repeat(24)+st.recipient.slice(2)&&l.data?.toLowerCase()==='0x'+BigInt(st.amount).toString(16).padStart(64,'0')+st.nullifier.slice(2));assert.equal(events.length,1,'PC23_WITHDRAWAL_EVENT');
 }
 return{...(pool.assetIdentity!==undefined?{assetIdentity:raw(pool.assetIdentity)}:{}),transaction:{hash:raw(transaction.hash),to:raw(pool.address),value:BigInt(transaction.value).toString(),method:PRIVATE_WALLET_POOL_METHODS[mode],calldataSHA256:sha(Buffer.from(transaction.input.slice(2),'hex')),proofSHA256:decoded.proofSHA256,publicInputs:decoded.publicInputs},receipt:{transactionHash:raw(transaction.hash),blockHash:raw(block.hash),status:1},snapshot,canonicalBlockHash:raw(block.hash),canonicalBlockHashAfter:raw(block.hash),transition:{preRoot,preSequence,postRoot:raw(root),postSequence:sequence,insertedCommitments,spentNullifiers,admissionTag:mode==='reserve_from_note'?raw(st.admissionTag):null,recipient:mode==='withdraw_balance'?raw(st.recipient):null,amount:mode==='reserve_from_note'?null:st.amount}};
}
export async function reconcileWalletTransition({pool,runtime,mode,publicInputs,fromBlock,value='0',attempted=true}){
 const expected=publicInputs.map(v=>BigInt(v).toString()),statement=decodeWalletPoolInputs(mode,expected),selector=pool.selectors[`${PRIVATE_WALLET_POOL_METHODS[mode]}(bytes,bytes32[])`];
 assert.equal(statement.scope,pool.scope,'PC23_TRANSITION_SCOPE');assert.equal(statement.policy,pool.policy,'PC23_TRANSITION_POLICY');
 assert.equal(BigInt(value),mode==='deposit_balance'&&(pool.assetIdentity===undefined||pool.asset==='0x'+'00'.repeat(20))?BigInt(statement.amount):0n,'PC25_TRANSITION_VALUE');
 const current=await pool.snapshot(),first=BigInt(fromBlock),last=BigInt(current.blockNumber);assert.ok(last>=first&&last-first<=4096n,'PC23_RECEIPT_SCAN_BOUND');const matches=[];
 for(let n=first;n<=last;n++){
  const block=await runtime.evm('eth_getBlockByNumber',['0x'+n.toString(16),true]);assert.ok(block?.hash&&Array.isArray(block.transactions),'PC23_RECEIPT_BLOCK');assert.ok(block.transactions.length<=256,'PC23_RECEIPT_TRANSACTION_BOUND');
  for(const tx of block.transactions){if(tx.to?.toLowerCase()!==pool.address||tx.input?.slice(2,10).toLowerCase()!==selector.toLowerCase())continue;
   let decoded;try{decoded=decodeWalletProofCalldata(tx.input,mode,selector);}catch{continue;}if(JSON.stringify(decoded.publicInputs)!==JSON.stringify(expected)||BigInt(tx.value)!==BigInt(value))continue;
   const receipt=await runtime.evm('eth_getTransactionReceipt',[tx.hash]);assert.ok(receipt,'PC23_RECEIPT_MISSING');for(const r of [tx,receipt]){assert.equal(r.blockHash,block.hash,'PC23_RECEIPT_BLOCK');assert.equal(r.blockNumber,block.number,'PC23_RECEIPT_HEIGHT');assert.equal(r.to?.toLowerCase(),pool.address,'PC23_RECEIPT_POOL');}assert.equal(receipt.transactionHash,tx.hash,'PC23_RECEIPT_HASH');
   await assertPrivateSnapshotCanonical(runtime,{blockNumber:block.number,blockHash:block.hash});
   // Even exact status-0 is not cancellation of a still-copyable signed proof.
   if(receipt.status==='0x0')continue;assert.equal(receipt.status,'0x1','PC23_RECEIPT_STATUS');assert.equal((BigInt(block.timestamp)/600n).toString(),statement.epoch,'PC23_RECEIPT_EPOCH');
   const post=await pool.snapshot(block.number),truth=async(method,args)=>assert.equal(await pool.call(method,args,block.number),TRUE,'PC23_EXACT_TRANSITION_STATE');
   if(mode==='deposit_balance')await truth('insertedCommitments(bytes32)',[statement.output]);else{await truth('spentNullifiers(bytes32)',[statement.nullifier]);await truth('acceptedRoots(bytes32)',[statement.root]);if(mode==='reserve_from_note'){for(const cm of [statement.output,statement.change])await truth('insertedCommitments(bytes32)',[cm]);await truth('acceptedRoots(bytes32)',[statement.expectedPostRoot]);await truth('admissions(bytes32)',[statement.admissionTag]);}}
   const observation=walletTransitionObservation({pool,mode,transaction:tx,receipt,block,decoded,endSnapshot:post});
   // StateAdvanced is a transaction-specific authenticated root/sequence/count
   // checkpoint. Append-only final arrays reconstruct that exact prefix, so a
   // later transaction in this same block does not invalidate this evidence.
   await assertPrivateSnapshotCanonical(runtime,current);await assertPrivateSnapshotCanonical(runtime,post);matches.push({observation,tx,receipt});
  }
 }
 assert.ok(matches.length<=1,'PC23_DUPLICATE_TRANSITION');if(matches.length)return{state:'CONFIRMED',observation:matches[0].observation};
 await assertPrivateSnapshotCanonical(runtime,current);return{state:'UNKNOWN',observation:null,attempted};
}
export const createOwnedWalletRuntime=options=>createOwnedWalletRuntimeConfigured(options,false);
export const createOwnedCohortWalletRuntime=options=>createOwnedWalletRuntimeConfigured(options,true);
async function createOwnedWalletRuntimeConfigured({walletId,signal,publish,guard:outerGuard},cohort){
 let runtime,solana,pool,issuer,clock,cohortBindings,publicCapture,closed=false,fault,heavyActive=false,mutationActive=false,receiptCursor=0,auditSerial=0,closePromise;
 const local=join(projectRoot,'.local','private-wallets',walletId),auditDir=join(local,'authority-audit');
 const guard=()=>{outerGuard?.();if(signal?.aborted||closed||fault)throw fault??new Error('PC23_AUTHORITY_UNAVAILABLE');resourceGuard();};
 const audit=async(label,value)=>{const name=`${String(++auditSerial).padStart(6,'0')}-${label}.json`;await durablePrivateFile(join(auditDir,name),value);return name;};
 await mkdir(local,{recursive:true,mode:0o700});await mkdir(auditDir,{mode:0o700});
 const telemetry=createPrivateWalletResourceTelemetry({diskPath:projectRoot,write:record=>audit(record.kind==='private-owned-runtime-resource-summary'?'runtime-resource-summary':'runtime-resources',record)});
 await telemetry.sample('STARTUP');
 const heavy=async(label,work)=>{guard();assert.equal(heavyActive,false,'PC23_SHARED_HEAVY_LEASE_BUSY');heavyActive=true;try{await telemetry.sample('BEFORE_HEAVY',label);guard();return await work();}finally{heavyActive=false;await telemetry.sample('AFTER_HEAVY',label);}};
 const mutate=async(label,work)=>{guard();assert.equal(mutationActive,false,'PC23_SHARED_MUTATION_BUSY');mutationActive=true;try{return await work();}finally{mutationActive=false;}};
 const archiveReceipts=async()=>{if(!pool)return;for(const entry of pool.receipts.slice(receiptCursor)){await audit('evm',await captureAssemblyEvmReceipt(runtime,entry));receiptCursor++;}};
 const close=()=>{if(closePromise)return closePromise;closed=true;clearInterval(monitor);closePromise=(async()=>{
  await telemetry.sample('BEFORE_CLOSE');let failure;
  try{if(publicCapture)await (signal?.aborted||fault?publicCapture.abort('PC24_RUNTIME_SHUTDOWN'):publicCapture.finish());}catch(error){failure??=error;}
  try{issuer?.close();}catch(error){failure??=error;}
  try{await solana?.close();}catch(error){failure??=error;}
  try{await runtime?.close();}catch(error){failure??=error;}
  await telemetry.sample('AFTER_CLOSE');await telemetry.finish({faultCode:fault?.code??fault?.message??failure?.code??failure?.message??null});
  if(failure)throw failure;
 })();return closePromise;};
 let monitor;
 try{
  await checkPrivatePaymentPrerequisites();await checkPrivateWalletSourcePrerequisites();guard();
  const{loadWalletVerifierSources,walletVerificationPins}=await import('../../../../../experiments/engine/private-core-proof/wallet-notes/prover.mjs');
  const walletSources=await loadWalletVerifierSources(),walletPins=walletVerificationPins();
  const{assemblyVerificationPins}=await import('../../../../../experiments/engine/private-core-proof/owner-independent/prover.mjs');const pins=assemblyVerificationPins();
  await publish({progressCode:'STARTING_SHARED_OWNED_RUNTIMES'});runtime=await (cohort?createOwnedNativeCohortRuntime:createOwnedNativeRuntime)(async()=>guard());telemetry.trackNative(runtime.metadata);await telemetry.sample('NATIVE_STARTED');solana=cohort?await createOwnedSolanaCohortRuntime(()=>guard()):await createOwnedSolanaRuntime(()=>guard(),{ledgerRetentionShreds:1000000,ticksPerSlot:64,resourceProfile:SOLANA_BOUNDED_LEDGER_PROFILE});if(cohort)cohortBindings=createPrivateCohortParticipantBindings({runtime,solana});telemetry.trackSolana(solana.metadata);await telemetry.sample('ALL_RUNTIMES_STARTED');telemetry.start();
  clock=(Math.floor((await runtime.time())/600)+1)*600+10;await runtime.evm('evm_setNextBlockTimestamp',[clock]);await runtime.evm('evm_mine');
  const issuerLifetime=randomBytes(32).toString('hex');issuer=createDisposableNativeIssuerLifetime({lifetimeId:issuerLifetime,identityNamespace:randomBytes(32).toString('hex'),mode:'DISPOSABLE_LOCAL_ONLY_NO_RESTART'});
  const adapterFor=view=>({genesis:view.genesis,solver:view.solver,recipient:view.recipient,transfer:async(...a)=>{guard();return view.transfer(...a);},observe:async(...a)=>{guard();return view.observe(...a);},balance:(...a)=>{guard();return view.balance(...a);}});const solAdapter=adapterFor(solana);
  const btcAdapter={btc:(...a)=>{guard();return runtime.btc(...a);}};
  const bindAdapter=(adapter,role,callbacks)=>issuer.bind({chain:role.toUpperCase(),genesis:role==='sol'?base58Decode(solana.genesis,32).toString('hex'):runtime.metadata.bitcoinGenesis,minimumConfirmations:role==='sol'?1:6,runtime:role==='sol'?adapter:btcAdapter,policyFamilyId:sha(Buffer.from('PC15/notes/immutable-observation-only/1')),epochSeconds:600,nowSeconds:()=>clock,...callbacks});
  const bind=(role,callbacks)=>bindAdapter(solAdapter,role,callbacks);
  const bindParticipant=(ownerIndex,role,callbacks)=>{assert.ok(cohortBindings,'PC24_COHORT_RUNTIME_REQUIRED');return bindAdapter(adapterFor(cohortBindings.participant(ownerIndex).solana),role,callbacks);};
  const noCall=async()=>{throw Error('PC23_POLICY_BOOTSTRAP_NO_DISPATCH');};
  const policy={...Object.fromEntries(['sol','btc'].map(role=>[role,policyFor(bind(role,{authorizeLocalInvocation:noCall,retainSignedDispatch:noCall,archiveCertificate:noCall}))])),minimumBtcConfirmations:6};
  const sources={...walletSources};for(const mode of ['reserve','withdraw','sol_ready','btc_ready','fulfill','refund']){const base=['reserve','withdraw'].includes(mode)?'native-notes':'owner-independent',content=await readFile(join(projectRoot,'experiments/private-core-proof',base,'.local/prepared',mode+'.sol'),'utf8');sources[mode]={content,sha256:sha(content)};}
  await publish({progressCode:'DEPLOYING_SHARED_PRIVATE_POOL'});
  pool=await heavy('deploy-shared-wallet',()=>deployPrivateWalletNativePool(runtime,{sources,policy:pref(policyCommitment(policy)),deploymentDomain:pref(randomBytes(32)),solAuthority:cohortBindings?.authorities.sol??runtime.accounts[2],btcAuthority:cohortBindings?.authorities.btc??runtime.accounts[1],onDeployment:d=>audit('deployment',d)}));
  await archiveReceipts();clock=await runtime.time();const clockAnchor=clock,anchorAt=performance.now();
  const identity={walletId,pool:raw(pool.address),scope:raw(pool.scope),policy:raw(pool.policy),chainId:String(runtime.metadata.chainId),evmGenesis:raw(runtime.metadata.evmGenesis),bitcoinGenesis:raw(runtime.metadata.bitcoinGenesis),solanaGenesis:base58Decode(solana.genesis,32).toString('hex'),issuerLifetime,deploymentHash:sha(JSON.stringify(pool.deployments)),verifierSetHash:sha(JSON.stringify(walletPins))};
  await audit('identity',{kind:'PC23_SHARED_LOCAL_AUTHORITY',identity,pins,walletPins,runtime:runtime.metadata,solana:solana.metadata});
  if(cohort){await audit('public-deployment-descriptor',{kind:'PC24_PUBLIC_DEPLOYMENT_DESCRIPTOR',pool:pool.address,chainId:runtime.metadata.chainId,sourceSHA256:sha(await readFile(join(projectRoot,'contracts/PrivateWalletNativeNotePool.sol'))),artifact:pool.compilation.output.contracts[pool.compilation.sourceNames.pool].PrivateWalletNativeNotePool,knownDeployments:pool.deployments.filter(d=>d.role!=='funded-note-pool').map(d=>({address:d.address,creationBytecodeSha256:d.linkedCreationBytecodeSHA256,role:d.role}))});publicCapture=createPrivateCohortCapture({runtime,solana,write:audit,guard:()=>resourceGuard()});const firstCapture=await publicCapture.start();assert.equal(firstCapture.classification,'CAPTURING','PC24_INITIAL_PUBLIC_CAPTURE_REQUIRED');assert.equal(firstCapture.coverage.genesisPrefixesComplete,true,'PC24_INITIAL_PUBLIC_CAPTURE_REQUIRED');assert.ok(firstCapture.chunks.length>0,'PC24_INITIAL_PUBLIC_CAPTURE_REQUIRED');}
  monitor=setInterval(()=>{try{guard();}catch(e){fault??=e;void telemetry.sample('GUARD_ABORT');void close().catch(()=>{});}},1000);
  const refreshClock=async()=>{guard();const current=await runtime.time(),justified=clockAnchor+Math.floor((performance.now()-anchorAt)/1000),next=Math.max(clock,current,justified);if(next>current){await runtime.evm('evm_setNextBlockTimestamp',[next]);await runtime.evm('evm_mine');}clock=next;return clock;};
  const prepareEpochWindow=async seconds=>{assert.ok(Number.isSafeInteger(seconds)&&seconds>0&&seconds<=500,'PC23_PROOF_WINDOW');await refreshClock();while(600-clock%600<seconds){const remaining=600-clock%600;await audit('epoch-window-wait',{kind:'real-monotonic-local-proof-window-wait',remainingSeconds:remaining,requiredSeconds:seconds});const end=performance.now()+(remaining+1)*1000;while(performance.now()<end){guard();await new Promise(resolve=>setTimeout(resolve,Math.min(250,end-performance.now())));}await refreshClock();}return clock;};
  return Object.freeze({runtime,solana,pool,pins,policy,identity,local,bind,heavy,mutate,guard,audit,archiveReceipts,prepareEpochWindow,...(cohort?{cohortBindings,bindParticipant,publicCapture}:{}),get clock(){return clock;},
   async tick(){guard();clock=Math.max(clock,await runtime.time(),clockAnchor+Math.floor((performance.now()-anchorAt)/1000))+1;await runtime.evm('evm_setNextBlockTimestamp',[clock]);return clock;},
   refreshClock,
   async privateState(){guard();const snapshot=await pool.snapshot();return{identity:{...identity},snapshot,balance:(await runtime.balance(pool.address)).toString()};},
   close,
  });
 }catch(e){fault=e;await close().catch(()=>{});throw e;}
}

/** Fixed participant capabilities for the shared local cohort. This grants no
 * alternate RPC, signer key, source profile or arbitrary account choice. The
 * coordinator owns the common runtime lifetime; a participant close never
 * destroys another participant's backed notes or native recovery capability. */
export async function createPrivateCohortParticipantView(base,{ownerIndex,walletId}) {
 assert.equal(base.cohortBindings?.profile,PRIVATE_COHORT_PROFILE,'PC24_COHORT_RUNTIME_REQUIRED');
 assert.match(walletId,/^[0-9a-f]{32}$/,'PC24_OWNER_WALLET_ID');
 const participant=base.cohortBindings.participant(ownerIndex),local=join(base.local,'owners',walletId);
 await mkdir(local,{recursive:true,mode:0o700});
 const identity=Object.freeze({...base.identity,walletId});
 const accountBindings=Object.freeze({profile:PRIVATE_COHORT_PROFILE,ownerIndex,
  deposit:participant.depositAccount,ownerWithdrawal:participant.exitAccount,relayer:participant.relayerAccount,
  payouts:participant.payoutAccounts,authorities:base.cohortBindings.authorities});
 const view=Object.create(null);
 for(const key of Object.keys(base))if(!['clock','local','identity','solana','bind','close','privateState'].includes(key))view[key]=base[key];
 Object.assign(view,{local,identity,accountBindings,solana:participant.solana,
  bind:(role,callbacks)=>base.bindParticipant(ownerIndex,role,callbacks),
  privateState:async()=>{const state=await base.privateState();return {...state,identity:{...identity}};},
  close:async()=>{ /* Shared coordinator retains runtime responsibility. */ }});
 Object.defineProperty(view,'clock',{enumerable:true,get:()=>base.clock});
 return Object.freeze(view);
}
