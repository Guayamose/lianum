import {privateWalletAccountBindings} from '@lianum/engine/wallet/notes/private-wallet-account-bindings';
import {privateWalletAssetBinding} from '@lianum/engine/wallet/notes/private-wallet-asset-binding';
/** PC23 reusable owned-local private balance. Explicit intents, one active
 * operation, one surviving authority. Settlement retains notes; exits require
 * a separately prepared explicit action. No idle disposal or recovery claim. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {projectRoot} from '@lianum/engine/chains/shared/runtime-harness';
import {base58Decode} from '@lianum/engine/chains/solana/solana-runtime';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {createOwnedWalletRuntime,walletCustodySnapshot,reconcileWalletTransition} from './private-wallet-authority.mjs';
import {createPrivateWalletCustody,recoverPrivateWalletCustody,validatePrivateWalletTerms} from '@lianum/engine/wallet/custody/private-wallet-custody';
import {applyPrivateWalletCapacityTransition} from '@lianum/engine/wallet/resources/private-wallet-capacity';
import {decodeWalletPoolInputs} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {createPrivateFundingPreparation,resourceGuard,resourceSnapshot,snapshotSources,assertPrivatePaymentSourcesUnchanged,durablePrivateFile,stopAssemblyActor,stopOwnedChild,sideEndpoint,startRecipient,proveRecipientWithdrawal,retainLocalProofAndRetireProducer,assertOriginalRefundProofBinding,PRIVATE_REFUND_RECOVERY_MARGIN_MS,PRIVATE_REFUND_LIFETIME_MAX_MS} from '../../payments/private-payment-engine.mjs';
import { validateAssemblyProofPackage, assemblyPackageDigest } from '@lianum/engine/assembly/private-assembly-actors';
import { launchAssemblyProcess, launchPrivateWalletSignerProcess } from '@lianum/proofs/execution/assembly-workers';
import {createAssemblyNativeDispatch,assemblyEvmProof} from '@lianum/engine/assembly/private-assembly-native-dispatch';
import {createCurrentFinalityAuthority,FINALITY_PROFILE_NAME} from '@lianum/engine/finality/private-finality-authority';
import {assertPrivateSnapshotCanonical} from '@lianum/engine/assembly/private-assembly-runtime';
import {noteWordsToHash} from '@lianum/engine/notes/private-note-tree';
import {importRecipientInvoice} from '@lianum/engine/recipients/private-recipient-custody';
import {createRecipientPayoutRecovery} from '@lianum/engine/recovery/private-payout-recovery';
import {createOwnerRefundWithdrawalRecovery} from '@lianum/engine/recovery/private-owner-refund-recovery';
import {launchOwnerRefundProcess} from '@lianum/engine/recovery/private-owner-refund-process';
import {validateOwnerRefundOpening} from '@lianum/engine/recovery/private-owner-refund-custody';
import {createRetainedWalletRecipient,retirePrivateWalletSettledProcesses} from '../../operations/wallet/private-wallet-retirement.mjs';
import {captureAssemblyEvmReceipt} from '@lianum/engine/assembly/private-assembly-evm-audit';
import {createOwnerRefundSettlementReconciler} from '@lianum/engine/recovery/private-owner-refund-settlement';
export const PRIVATE_WALLET_PROFILE='PC23_SHARED_LOCAL_V1';
const phases=new Set(['OPENING','READY','PREPARING','FUNDING','OWNER_RELEASED','SOL_PENDING','SOL_FINALIZED','BTC_PENDING','BTC_CONFIRMED','SETTLING','SETTLED_IN_POOL','WITHDRAWING','REFUND_NOTE_RETAINED','QUARANTINED','CLOSING','CLOSED','FAILED']);
const id=value=>typeof value==='string'&&/^[0-9a-f]{32}$/.test(value);
const sha=value=>createHash('sha256').update(value).digest('hex'),stamp=()=>process.hrtime.bigint().toString();
const safeCode=e=>/^[A-Z][A-Z0-9_]{1,100}$/.test(e?.code??e?.message??'')?e.code??e.message:'PRIVATE_WALLET_OPERATION_FAILED';
const exact=(value,keys)=>assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)),'PRIVATE_WALLET_FIELDS');
const uint=value=>{assert.ok(typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value)&&BigInt(value)<1n<<64n,'PRIVATE_WALLET_UINT');return BigInt(value);};
export function sanitizePrivateWalletSummary(value){
 exact(value,['profile','walletId','phase','progressCode','engineState','authorityState','activeOperationId','operationCount','notesState','errorCode']);
 assert.equal(value.profile,PRIVATE_WALLET_PROFILE);assert.ok(id(value.walletId));assert.ok(phases.has(value.phase));
 assert.match(value.progressCode,/^[A-Z][A-Z0-9_]{0,79}$/);assert.ok(['RUNNING','IDLE','STOPPED'].includes(value.engineState));assert.ok(['LIVE','UNAVAILABLE','CLOSED'].includes(value.authorityState));
 assert.ok(value.activeOperationId===null||id(value.activeOperationId));assert.ok(Number.isSafeInteger(value.operationCount)&&value.operationCount>=0&&value.operationCount<=64);assert.ok(['EMPTY','RETAINED','PENDING','UNKNOWN'].includes(value.notesState));
 assert.ok(value.errorCode===null||/^[A-Z][A-Z0-9_]{1,100}$/.test(value.errorCode));
 if(value.phase==='CLOSED')assert.ok(value.authorityState==='CLOSED'&&value.engineState==='STOPPED'&&value.notesState==='EMPTY');
 return structuredClone(value);
}
export function validatePrivateWalletIntent(value){
 exact(value,['intentId','kind','terms']);assert.ok(id(value.intentId));const terms=value.terms;
 if(value.kind==='payment'){validatePrivateWalletTerms(terms);assert.ok(uint(terms.amountSol)<=1000000000n,'PRIVATE_WALLET_SOL_LIMIT');assert.ok(uint(terms.amountSol)*uint(terms.numerator)/uint(terms.denominator)<=100000000n,'PRIVATE_WALLET_BTC_LIMIT');assert.ok(uint(terms.budget)<=1000000000000000000n,'PRIVATE_WALLET_BUDGET_LIMIT');}
 else if(value.kind==='refund'){exact(terms,['operationId']);assert.ok(id(terms.operationId),'PRIVATE_WALLET_ORIGINAL_OPERATION_REQUIRED');}
 else if(value.kind==='topup'){exact(terms,['amount']);assert.ok(uint(terms.amount)<=1000000000000000000n,'PRIVATE_WALLET_TOPUP_LIMIT');}
 else if(value.kind==='exit'){if(Object.hasOwn(terms,'noteId')){exact(terms,['noteId']);assert.match(terms.noteId,/^[0-9a-f]{64}$/);}else{exact(terms,['operationId','role']);assert.ok(id(terms.operationId)&&['sol','btc','refund'].includes(terms.role));}}
 else throw new Error('PRIVATE_WALLET_INTENT_KIND');return structuredClone(value);
}
/** During a private signer handoff the keeper's old revision is intentionally
 * stale. Reads neither authenticate that stale view nor await a long proof; all
 * formerly available input value is conservatively unavailable for new use. */
export function pendingPrivateWalletBalance(balance){
 const copy=structuredClone(balance);copy.pending=(BigInt(copy.pending)+BigInt(copy.available)).toString();copy.available='0';copy.currentCanonicalObservation=false;
 for(const note of copy.notes)if(note.status==='AVAILABLE')note.status='LOCKED';return copy;
}

/** A failed retirement must not admit another funded operation and accumulate
 * idle processes. Explicit original-note exits remain separately admissible. */
export function assertPrivateWalletCompletedProcessRetirement(operations){
 for(const op of operations)if(op.settled)assert.equal(op.host.retirementComplete(),true,'PRIVATE_WALLET_PROCESS_RETIREMENT_PENDING');
}

/** Dedicated signer child owns typed note keys and its one proof child. Its
 * output excludes openings/keys. Wait for close and scrub all pipe buffers. */
export async function runPrivateWalletSignerProcess(input,{signal}={}){
 resourceGuard();const child=launchPrivateWalletSignerProcess(),encoded=Buffer.from(JSON.stringify(input));
 assert.ok(encoded.length<=4*1024*1024,'PC23_SIGNER_BOOTSTRAP_LIMIT');
 return new Promise((resolve,reject)=>{const chunks=[];let size=0,logs=0,failure,kill;
  const abort=e=>{failure??=e;child.kill('SIGTERM');kill??=setTimeout(()=>child.kill('SIGKILL'),5000);};
  const onAbort=()=>abort(new Error('PRIVATE_WALLET_ABORTED'));signal?.addEventListener('abort',onAbort,{once:true});
  const onExit=()=>child.kill('SIGKILL');process.once('exit',onExit);
  const timer=setTimeout(()=>abort(new Error('PC23_SIGNER_TIMEOUT')),960000),monitor=setInterval(()=>{try{resourceGuard();}catch(e){abort(e);}},250);
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{logs+=b.length;if(logs>1024*1024)abort(new Error('PC23_SIGNER_LOG_LIMIT'));});
  child.stdio[3].on('data',b=>{size+=b.length;if(size>2*1024*1024)abort(new Error('PC23_SIGNER_RESULT_LIMIT'));else chunks.push(Buffer.from(b));});
  child.stdin.on('error',abort);child.stdio[3].on('error',abort);child.once('error',abort);
  child.once('close',(code,signalCode)=>{clearTimeout(timer);clearTimeout(kill);clearInterval(monitor);signal?.removeEventListener('abort',onAbort);process.removeListener('exit',onExit);encoded.fill(0);
   try{if(failure)throw failure;const bytes=Buffer.concat(chunks),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));bytes.fill(0);assert.ok(value.ok===true&&code===0&&signalCode===null,value.code??'PC23_SIGNER_EXIT');exact(value.result,['preparation','proof','checkpoint']);validateAssemblyProofPackage(value.result.proof,input.mode);resolve(value.result);}catch(e){reject(e);}finally{for(const b of chunks)b.fill(0);for(const stream of child.stdio)stream?.destroy();}});
  child.stdin.end(encoded,()=>encoded.fill(0));
 });
}

/** Factory is inert; first explicit open starts one owned runtime. Test seams
 * are trusted module arguments and are absent from IPC/HTTP. */
export function createPrivateWalletAuthority(options,{createRuntime=createOwnedWalletRuntime,createOperationHost=createOwnedWalletOperationHost,runSigner=runPrivateWalletSignerProcess}={}){
 exact(options,['walletId','profile','onCheckpoint',...(Object.hasOwn(options,'signal')?['signal']:[])]);assert.ok(id(options.walletId));assert.equal(options.profile,PRIVATE_WALLET_PROFILE);assert.equal(typeof options.onCheckpoint,'function');
 const state={profile:PRIVATE_WALLET_PROFILE,walletId:options.walletId,phase:'OPENING',progressCode:'WALLET_OPENING',engineState:'IDLE',authorityState:'LIVE',activeOperationId:null,operationCount:0,notesState:'EMPTY',errorCode:null};
 let shared,assetBinding,custody,custodyConfig,journal,journalRecord,journalPassword,busy=false,fault,opened=false,disposed=false,custodyHandoff=null,ownerBalanceCache=null,ownerViewRead=Promise.resolve();
 const operations=new Map(),pendingTransitions=new Map(),cleanupAttempts=new Map();
 const guard=()=>{if(fault)throw fault;if(options.signal?.aborted||disposed)throw new Error('PRIVATE_WALLET_UNAVAILABLE');};
 const publish=async(patch={})=>{Object.assign(state,patch);guard();try{await options.onCheckpoint(sanitizePrivateWalletSummary(state));}catch(e){fault=new Error('PRIVATE_WALLET_CHECKPOINT_FAILED');throw fault;}guard();};
 const custodyDescriptor=()=>({...custodyConfig,checkpoint:custody.checkpoint()});
 const beginCustodyHandoff=()=>{assert.equal(custodyHandoff,null,'PRIVATE_WALLET_CUSTODY_HANDOFF_BUSY');custodyHandoff=pendingPrivateWalletBalance(custody.privateBalance());};
 const finishCustodyHandoff=()=>{custodyHandoff=null;};
 const adoptCustody=async checkpoint=>{custody?.close();custody=await recoverPrivateWalletCustody({...custodyConfig,checkpoint});ownerBalanceCache=custody.privateBalance();};
 const journalWrite=async transform=>{guard();const current=await journal.read(journalPassword);assert.deepEqual(current,journalRecord,'PRIVATE_WALLET_INTENT_JOURNAL_CHANGED');const next=await journal.update(journalPassword,current.revision,transform);assert.deepEqual(await journal.read(journalPassword),next,'PRIVATE_WALLET_INTENT_READBACK');journalRecord=next;};
 const markIntent=async(intentId,status,operationId)=>journalWrite(data=>({...data,intents:data.intents.map(i=>i.intentId===intentId?{...i,state:status,operationId}:i)}));
 async function reconcileTransition(record){
  const found=await reconcileWalletTransition({pool:shared.pool,runtime:shared.runtime,mode:record.mode,publicInputs:record.proof.publicInputs,fromBlock:record.fromBlock,value:record.value});
  const result=await custody.reconcile({requestId:record.requestId,observation:found.observation??null});
  if(result.stage==='CONFIRMED'){record.confirmed=true;ownerBalanceCache=custody.privateBalance();if(record.mode==='reserve_from_note')operations.get(record.requestId)?.host.confirmReserve();await shared.audit('wallet-transition',{kind:'private-exact-wallet-transition',mode:record.mode,operationId:record.requestId,statement:decodeWalletPoolInputs(record.mode,record.proof.publicInputs),inputCommitment:record.preparation.inputCommitment??null,changeCommitment:record.preparation.changeCommitment??null,evidence:found.observation,canonicalState:await shared.pool.snapshot(),poolBalance:(await assetBinding.backingBalance()).toString()});return found;}
  state.notesState='UNKNOWN';throw new Error(result.stage==='REJECTED'?'PRIVATE_WALLET_TRANSACTION_REVERTED':'PRIVATE_WALLET_SUBMISSION_UNKNOWN');
 }
 async function submitPrepared({requestId,proof,preparation,fromBlock}){
  guard();const mode=proof.mode,p=assemblyEvmProof(proof),statement=decodeWalletPoolInputs(mode,proof.publicInputs),data=shared.pool.proofData(mode,p.proof,p.publicInputs),value=mode==='deposit_balance'?assetBinding.fundingTransactionValue(statement.amount).toString():'0';
  const record={requestId,mode,proof,preparation,fromBlock,value,confirmed:false};pendingTransitions.set(requestId,record);
  // Authentic custody and exact D/S/W proof verification complete before durable
  // one-shot latch. Snapshot/epoch checks are repeated immediately before send.
  await custody.authenticate();assert.equal(await shared.heavy('verify-'+mode,()=>shared.pool.verify(mode,p.proof,p.publicInputs)),true,'PC23_GENUINE_VERIFIER_REJECTED');
  // Approval may mine a block. It follows proof verification and precedes the
  // final canonical epoch/prestate checks and durable one-shot send latch.
  if(mode==='deposit_balance')await assetBinding.beforeDeposit(statement.amount,privateWalletAccountBindings(shared).deposit);
  await shared.refreshClock();const s=await shared.pool.snapshot();assert.equal(s.epoch,statement.epoch,'PC23_SUBMISSION_EPOCH');
  if(mode==='reserve_from_note'){assert.equal(s.root,statement.expectedBaseRoot,'PC23_SUBMISSION_ROOT');assert.equal(s.stateSequence,statement.expectedSequence,'PC23_SUBMISSION_SEQUENCE');}
  await assertPrivateSnapshotCanonical(shared.runtime,s);
  const scheduled=await shared.tick();assert.equal((BigInt(scheduled)/600n).toString(),statement.epoch,'PC23_SCHEDULED_SUBMISSION_EPOCH');
  const latch=await custody.bindSubmission({requestId,proofSHA256:sha(p.proof),calldataSHA256:sha(Buffer.from(data.slice(2),'hex')),publicInputs:proof.publicInputs});assert.equal(latch.dispatchAllowed,true,'PRIVATE_WALLET_NO_REBROADCAST');
  await publish({phase:mode==='withdraw_balance'?'WITHDRAWING':'FUNDING',notesState:'PENDING',progressCode:'EXACT_SUBMISSION_PENDING'});guard();
  // A cohort cancellation/checkpoint failure during verification or the final
  // durable ACK must still prevent funding exposure. Ordinary wallets have no
  // cohort callback; their original checks and submission path are unchanged.
  if(mode==='reserve_from_note')shared.assertPaymentExposure?.(requestId);
  try{await shared.pool.send('exact wallet '+mode,{from:privateWalletAccountBindings(shared)[mode==='deposit_balance'?'deposit':'relayer'],to:shared.pool.address,data,value:'0x'+BigInt(value).toString(16)});}catch{}
  // Search canonical success first, including another sender's copied exact S.
  // Never restore spendability merely because our own attempt has status zero.
  try{return await reconcileTransition(record);}finally{await shared.archiveReceipts();}
 }
 async function executeTopUp(intent,operationId){
  await shared.prepareEpochWindow(100);const snapshot=await shared.pool.snapshot();await publish({phase:'PREPARING',progressCode:'BALANCE_DEPOSIT_PROOF',notesState:'PENDING'});
  beginCustodyHandoff();const result=await shared.heavy('balance-deposit-proof',()=>runSigner({mode:'deposit_balance',custody:custodyDescriptor(),request:{requestId:operationId,amount:intent.terms.amount,epoch:snapshot.epoch}},{signal:options.signal}));
  await adoptCustody(result.checkpoint);finishCustodyHandoff();await submitPrepared({requestId:operationId,proof:result.proof,preparation:result.preparation,fromBlock:snapshot.blockNumber});
 }
 async function executePayment(intent,operationId){
  const privateBalance=custody.privateBalance(),note=privateBalance.notes.find(n=>n.status==='AVAILABLE'&&BigInt(n.value)>BigInt(intent.terms.budget));assert.ok(note,'PRIVATE_WALLET_SUFFICIENT_SINGLE_NOTE_REQUIRED');
  let ownerCheckpoint,host;
  const context={operationId,inputCommitment:note.commitment,signal:options.signal,guard,publish,update(){},async custodyCheckpoint(c){ownerCheckpoint=c;await adoptCustody(c);},
   async beforeEvm(purpose){await publish({progressCode:purpose==='claim'?'CLAIM_SUBMISSION_PENDING':'EVM_SUBMISSION_PENDING'});},evmConfirmed(purpose){if(purpose==='reserve')operations.get(operationId).funded=true;if(purpose==='claim'){const op=operations.get(operationId);op.settled=true;op.payouts={sol:'ISSUED',btc:'ISSUED'};}},
   withdrawalConfirmed(role){operations.get(operationId).payouts[role]='WITHDRAWN';},ownerRefundConfirmed(){operations.get(operationId).refund='WITHDRAWN';},
   async beforeNative(role){await publish({progressCode:role==='sol'?'SOL_SUBMISSION_PENDING':'BTC_SUBMISSION_PENDING'});},async signedRetained(role){await publish({progressCode:role==='sol'?'SOL_SIGNED_RETAINED':'BTC_SIGNED_RETAINED'});},async observed(role){await publish({progressCode:role==='sol'?'SOL_DELIVERY_OBSERVED':'BTC_DELIVERY_OBSERVED'});},
   async submitSpend({reserve,projection}){assert.ok(ownerCheckpoint,'PC23_CHANGE_CUSTODY_AUTHENTICATION');await adoptCustody(ownerCheckpoint);await submitPrepared({requestId:operationId,proof:reserve,preparation:projection,fromBlock:projection.snapshot.blockNumber});},
  };
  host=await createOperationHost(context,shared,custodyDescriptor(),intent.terms);const op={host,terms:intent.terms,inputCommitment:note.commitment,funded:false,settled:false,payouts:{sol:'PENDING',btc:'PENDING'},refund:null};operations.set(operationId,op);
  await publish({phase:'PREPARING',progressCode:'PREPARING_PRIVATE_OPERATION'});beginCustodyHandoff();await host.prepare();await host.prepareReserve();finishCustodyHandoff();await host.authorize();await host.releaseOwner();
  await publish({phase:'OWNER_RELEASED',progressCode:'OWNER_EXIT_CONFIRMED'});await host.assertOwnerExited();await host.reserve();
  await publish({phase:'SOL_PENDING',progressCode:'SOL_READINESS_PROOF'});await host.execute('sol',await host.readiness('sol'));await publish({phase:'SOL_FINALIZED',progressCode:'SOL_LOCAL_PROOF_RETAINED'});
  await host.assertOwnerExited();await host.join();await publish({phase:'BTC_PENDING',progressCode:'BTC_READINESS_PROOF'});await host.execute('btc',await host.readiness('btc'));await publish({phase:'BTC_CONFIRMED',progressCode:'BTC_LOCAL_PROOF_RETAINED'});
  await publish({phase:'SETTLING',progressCode:'TERMINAL_PROOF'});const terminal=await host.terminal();for(const role of ['sol','btc'])await host.permit(role,terminal);await host.claim(terminal);await host.verifyCompletion();await host.retireSettledProcesses();
  op.settled=true;await publish({phase:'SETTLED_IN_POOL',progressCode:'PAYOUT_NOTES_RETAINED',notesState:'RETAINED'});
 }
 async function executeRefund(intent,operationId){
  cleanupAttempts.set(operationId,{kind:'refund',originalOperationId:intent.terms.operationId,role:'refund',confirmed:false});
  const op=operations.get(intent.terms.operationId);assert.ok(op&&op.funded&&!op.settled&&!op.refund,'PRIVATE_WALLET_ORIGINAL_REFUND_REQUIRED');
  await publish({phase:'PREPARING',progressCode:'WAITING_ORIGINAL_REFUND_CUTOFF',notesState:'RETAINED'});
  let status=await op.host.refundStatus();assert.ok(status&&['WAITING','ELIGIBLE','NOTE_ISSUED'].includes(status.state),'PRIVATE_WALLET_REFUND_UNAVAILABLE');
  while(status.state==='WAITING'){guard();await new Promise((resolve,reject)=>{const timer=setTimeout(done,1000),stop=()=>{clearTimeout(timer);reject(new Error('PRIVATE_WALLET_ABORTED'));};function done(){options.signal?.removeEventListener('abort',stop);resolve();}options.signal?.addEventListener('abort',stop,{once:true});});status=await op.host.refundStatus();}
  if(status.state==='ELIGIBLE'){await publish({progressCode:'ORIGINAL_REFUND_PROOF'});await op.host.issueRefund();status=await op.host.refundStatus();}
  assert.equal(status.state,'NOTE_ISSUED','PRIVATE_WALLET_REFUND_ISSUANCE_UNCONFIRMED');op.refund='ISSUED';cleanupAttempts.get(operationId).confirmed=true;await publish({phase:'REFUND_NOTE_RETAINED',progressCode:'ORIGINAL_REFUND_NOTE_RETAINED',notesState:'RETAINED'});
 }
 async function executeExit(intent,operationId){
  await publish({phase:'WITHDRAWING',progressCode:'EXPLICIT_NOTE_EXIT'});
  if(intent.terms.noteId){const note=custody.privateBalance().notes.find(n=>n.noteId===intent.terms.noteId&&n.status==='AVAILABLE');assert.ok(note,'PRIVATE_WALLET_NOTE_UNAVAILABLE');await shared.prepareEpochWindow(100);const snapshot=await shared.pool.snapshot();
   beginCustodyHandoff();const result=await shared.heavy('balance-exit-proof',()=>runSigner({mode:'withdraw_balance',custody:custodyDescriptor(),request:{requestId:operationId,inputCommitment:note.commitment,recipient:privateWalletAccountBindings(shared).ownerWithdrawal.slice(2),epoch:snapshot.epoch,snapshot:walletCustodySnapshot(snapshot)}},{signal:options.signal}));
   await adoptCustody(result.checkpoint);finishCustodyHandoff();await submitPrepared({requestId:operationId,proof:result.proof,preparation:result.preparation,fromBlock:snapshot.blockNumber});
  }else{const op=operations.get(intent.terms.operationId);assert.ok(op,'PRIVATE_WALLET_ORIGINAL_OPERATION_REQUIRED');const role=intent.terms.role;cleanupAttempts.set(operationId,{kind:'exit',originalOperationId:intent.terms.operationId,role,confirmed:false});if(role==='refund'){op.refund='PENDING';try{await op.host.withdrawRefund();op.refund='WITHDRAWN';cleanupAttempts.get(operationId).confirmed=true;}catch(e){op.refund='UNKNOWN';throw e;}}else{assert.ok(op.settled&&op.payouts[role]==='ISSUED','PRIVATE_WALLET_PAYOUT_UNAVAILABLE');op.payouts[role]='PENDING';try{await op.host.withdraw(role);op.payouts[role]='WITHDRAWN';cleanupAttempts.get(operationId).confirmed=true;}catch(e){op.payouts[role]='UNKNOWN';throw e;}}}
 }
 async function validateCurrentIntent(intent){
  if(['payment','topup'].includes(intent.kind))assertPrivateWalletCompletedProcessRetirement(operations.values());
  assert.ok(![...pendingTransitions.values()].some(p=>!p.confirmed)&&![...cleanupAttempts.values()].some(p=>!p.confirmed),'PRIVATE_WALLET_UNRESOLVED_TRANSITION');
  const unresolved=[...operations.entries()].filter(([id,op])=>!op.settled&&!op.refund);assert.ok(unresolved.length===0||(intent.kind==='refund'&&unresolved.length===1&&unresolved[0][0]===intent.terms.operationId),'PRIVATE_WALLET_UNRESOLVED_OPERATION');
  const snapshot=await shared.pool.snapshot();await assertPrivateSnapshotCanonical(shared.runtime,snapshot);
  if(intent.kind==='topup')applyPrivateWalletCapacityTransition(snapshot,'deposit_balance');
  if(intent.kind==='payment'){
   applyPrivateWalletCapacityTransition(snapshot,'reserve_from_note');const balance=await custody.observeBalance({snapshot:walletCustodySnapshot(snapshot)});
   assert.ok(balance.notes.some(n=>n.status==='AVAILABLE'&&BigInt(n.value)>BigInt(intent.terms.budget)),'PRIVATE_WALLET_SUFFICIENT_SINGLE_NOTE_REQUIRED');
  }
  if(intent.kind==='exit'){
   if(intent.terms.noteId){const balance=await custody.observeBalance({snapshot:walletCustodySnapshot(snapshot)});assert.ok(balance.notes.some(n=>n.noteId===intent.terms.noteId&&n.status==='AVAILABLE'),'PRIVATE_WALLET_NOTE_UNAVAILABLE');}
   else{const op=operations.get(intent.terms.operationId);assert.ok(op,'PRIVATE_WALLET_ORIGINAL_OPERATION_REQUIRED');assert.ok(intent.terms.role==='refund'?op.refund==='ISSUED':op.settled&&op.payouts[intent.terms.role]==='ISSUED','PRIVATE_WALLET_ORIGINAL_NOTE_UNAVAILABLE');}
  }
  if(intent.kind==='refund'){const op=operations.get(intent.terms.operationId);assert.ok(op&&op.funded&&!op.settled&&!op.refund,'PRIVATE_WALLET_ORIGINAL_REFUND_REQUIRED');}
 }
 function renderPrivateStatus(balance,assetSafe=false){
  const amountField=assetSafe?'amountBaseUnits':'amountWei';
  const notes=balance.notes.map(n=>({id:n.noteId,type:'OWNER_BALANCE',state:n.status==='UNISSUED'?'PENDING':n.status==='SPENT_INTERNALLY'?'SPENT':n.status,[amountField]:n.value,operationId:null}));
  for(const [operationId,op]of operations){if(op.settled)for(const role of ['sol','btc'])notes.push({id:sha(Buffer.from(operationId+':'+role)),type:role==='sol'?'SOL_PAYOUT':'BTC_PAYOUT',state:op.payouts[role],[amountField]:role==='sol'?op.terms.solCompensation:(BigInt(op.terms.budget)-BigInt(op.terms.solCompensation)).toString(),operationId});if(op.refund)notes.push({id:sha(Buffer.from(operationId+':refund')),type:'OWNER_REFUND',state:op.refund,[amountField]:op.terms.budget,operationId});}
  return{walletId:options.walletId,...(assetSafe?{asset:assetBinding.descriptor,availableBaseUnits:balance.available,pendingBaseUnits:balance.pending,unavailableBaseUnits:balance.unavailable}:{availableWei:balance.available,pendingWei:balance.pending,unavailableWei:balance.unavailable}),notes,intents:journalRecord.data.intents.map(({intentId,kind,terms,state})=>({intentId,kind,terms,state})),observation:'LIVE'};
 }
 function readPrivateStatus(assetSafe){
  guard();assert.ok(shared&&custody&&ownerBalanceCache,'PRIVATE_WALLET_NOT_OPEN');
  assert.ok(assetSafe||assetBinding.descriptor===null,'PRIVATE_WALLET_ASSET_STATUS_REQUIRED');
  // Never enqueue an owner-view read behind a proof-bearing recovery or race a
  // custody CAS. Active actions return an immediate explicitly pending view.
  if(busy)return Promise.resolve(renderPrivateStatus(custodyHandoff??pendingPrivateWalletBalance(ownerBalanceCache),assetSafe));
  const work=async()=>{const chain=await shared.privateState();ownerBalanceCache=await custody.observeBalance({snapshot:walletCustodySnapshot(chain.snapshot)});
   for(const op of operations.values())if(op.settled){const fresh=await op.host.privateOutputs();for(const role of ['sol','btc'])op.payouts[role]=fresh[role].state==='READY'?'ISSUED':fresh[role].state==='WITHDRAWN'?'WITHDRAWN':'UNKNOWN';}
   return renderPrivateStatus(ownerBalanceCache,assetSafe);
  };
  const task=ownerViewRead.then(work);ownerViewRead=task.catch(()=>{});return task;
 }
 // Host-only explicit unit-safe view for account composition; not an IPC action.
 const privateStatus=()=>readPrivateStatus(false),privateAssetStatus=()=>readPrivateStatus(true);
 // Host-only pair admission. A cohort may read during exactly its pre-prepare
 // gate wait, before any owner/prover custody write. No openings or keys leave
 // custody. The same canonical spent-state check used by ordinary admission
 // still determines whether the selected original input is available.
 function privatePaymentAdmission(input){
  exact(input,['intentId','operationId']);assert.ok(id(input.intentId)&&id(input.operationId));
  guard();assert.ok(shared&&custody,'PRIVATE_WALLET_NOT_OPEN');
  const waiting=busy&&shared.isPaymentAdmissionSafe?.(input.operationId)===true;
  assert.ok(!busy||waiting,'PRIVATE_WALLET_ADMISSION_DURING_WRITE');
  const work=async()=>{
   guard();const intent=journalRecord.data.intents.find(i=>i.intentId===input.intentId),op=operations.get(input.operationId);
   assert.ok(intent?.kind==='payment'&&(waiting?intent.state==='EXECUTING'&&intent.operationId===input.operationId&&op: intent.state==='PREPARED'&&!op),'PRIVATE_WALLET_ORIGINAL_ADMISSION_REQUIRED');
   if(waiting)assert.equal(shared.isPaymentAdmissionSafe(input.operationId),true,'PRIVATE_WALLET_ADMISSION_DURING_WRITE');
   const snapshot=await shared.pool.snapshot(),balance=await custody.observeBalance({snapshot:walletCustodySnapshot(snapshot)});
   const note=balance.notes.find(n=>n.status==='AVAILABLE'&&BigInt(n.value)>BigInt(intent.terms.budget)&&(!op||n.commitment===op.inputCommitment));
   assert.ok(note,'PRIVATE_WALLET_SUFFICIENT_SINGLE_NOTE_REQUIRED');await assertPrivateSnapshotCanonical(shared.runtime,snapshot);
   if(waiting)assert.equal(shared.isPaymentAdmissionSafe(input.operationId),true,'PRIVATE_WALLET_ADMISSION_DURING_WRITE');
   return structuredClone({intentId:intent.intentId,operationId:input.operationId,kind:intent.kind,terms:intent.terms,state:intent.state,inputCommitment:note.commitment,inputValue:note.value,identity:shared.identity,snapshot});
  };
  const task=ownerViewRead.then(work);ownerViewRead=task.catch(()=>{});return task;
 }
 async function action(action,input={}){
  guard();if(action==='status')return sanitizePrivateWalletSummary(state);if(action==='privateStatus')return privateStatus();assert.equal(busy,false,'PRIVATE_WALLET_ACTION_IN_PROGRESS');busy=true;
  await ownerViewRead;
  try{
   if(action==='open'){exact(input,[]);assert.equal(opened,false,'PRIVATE_WALLET_ALREADY_OPEN');opened=true;await publish({phase:'OPENING',engineState:'RUNNING',progressCode:'WALLET_OPENING',activeOperationId:null});
    shared=await createRuntime({walletId:options.walletId,signal:options.signal,publish,guard});assetBinding=privateWalletAssetBinding(shared);custodyConfig={path:join(shared.local,'balance.vault'),password:'synthetic-'+randomBytes(32).toString('hex'),identity:shared.identity};custody=await createPrivateWalletCustody(custodyConfig);ownerBalanceCache=custody.privateBalance();
    journalPassword='synthetic-'+randomBytes(32).toString('hex');journal=new Vault(join(shared.local,'intents.vault'));journalRecord=await journal.create({version:1,walletId:options.walletId,intents:[]},journalPassword);assert.deepEqual(await journal.read(journalPassword),journalRecord);
    await publish({phase:'READY',engineState:'IDLE',progressCode:'SHARED_WALLET_READY'});return sanitizePrivateWalletSummary(state);
   }
   assert.ok(shared&&custody,'PRIVATE_WALLET_NOT_OPEN');
   if(action==='prepareIntent'){const intent=validatePrivateWalletIntent(input),old=journalRecord.data.intents.find(i=>i.intentId===intent.intentId);if(old){assert.deepEqual({intentId:old.intentId,kind:old.kind,terms:old.terms},intent,'PRIVATE_WALLET_INTENT_REUSE');return{intentId:intent.intentId,kind:intent.kind};}assert.ok(journalRecord.data.intents.length<64,'PRIVATE_WALLET_INTENT_CAPACITY');await validateCurrentIntent(intent);await journalWrite(data=>({...data,intents:[...data.intents,{...intent,state:'PREPARED',operationId:null}]}));return{intentId:intent.intentId,kind:intent.kind};}
   if(action==='execute'){exact(input,['intentId','operationId']);assert.ok(id(input.intentId)&&id(input.operationId));const intent=journalRecord.data.intents.find(i=>i.intentId===input.intentId);assert.ok(intent&&intent.state==='PREPARED','PRIVATE_WALLET_INTENT_UNAVAILABLE');assert.ok(!pendingTransitions.has(input.operationId)&&!operations.has(input.operationId),'PRIVATE_WALLET_OPERATION_REUSE');
    assert.ok(![...pendingTransitions.values()].some(p=>!p.confirmed),'PRIVATE_WALLET_UNRESOLVED_TRANSITION');const unresolved=[...operations.entries()].filter(([id,op])=>!op.settled&&!op.refund);assert.ok(unresolved.length===0||(intent.kind==='refund'&&unresolved.length===1&&unresolved[0][0]===intent.terms.operationId),'PRIVATE_WALLET_UNRESOLVED_OPERATION');
    await validateCurrentIntent(intent);await markIntent(intent.intentId,'EXECUTING',input.operationId);state.operationCount++;await publish({activeOperationId:input.operationId,engineState:'RUNNING',errorCode:null});
    try{await shared.mutate('wallet-'+intent.kind,()=>intent.kind==='topup'?executeTopUp(intent,input.operationId):intent.kind==='payment'?executePayment(intent,input.operationId):intent.kind==='refund'?executeRefund(intent,input.operationId):executeExit(intent,input.operationId));await markIntent(intent.intentId,'COMPLETED',input.operationId);const s=await shared.pool.snapshot();await shared.audit('wallet-action-completed',{kind:'private-wallet-action-completed',operationId:input.operationId,intentKind:intent.kind,pool:shared.pool.address,scope:shared.pool.scope,policy:shared.pool.policy,identity:shared.identity,canonicalState:s,poolBalance:(await assetBinding.backingBalance()).toString()});await publish({phase:intent.kind==='payment'?'SETTLED_IN_POOL':intent.kind==='refund'?'REFUND_NOTE_RETAINED':'READY',progressCode:intent.kind==='payment'?'PAYOUT_NOTES_RETAINED':intent.kind==='refund'?'ORIGINAL_REFUND_NOTE_RETAINED':'WALLET_ACTION_CONFIRMED',engineState:'IDLE',notesState:s.liveOutputNotes||s.liveReservations?'RETAINED':'EMPTY'});return sanitizePrivateWalletSummary(state);}
    catch(e){await markIntent(intent.intentId,'UNKNOWN',input.operationId).catch(()=>{});await publish({phase:'QUARANTINED',progressCode:'ACTION_REQUIRES_RECONCILIATION',engineState:'IDLE',notesState:'UNKNOWN',errorCode:safeCode(e)}).catch(()=>{});throw e;}
    finally{state.activeOperationId=null;}
   }
   if(action==='reconcile'){
    exact(input,['intentId','operationId']);assert.ok(id(input.operationId));const intent=journalRecord.data.intents.find(i=>i.intentId===input.intentId&&i.operationId===input.operationId);assert.ok(intent,'PRIVATE_WALLET_ORIGINAL_INTENT_REQUIRED');state.activeOperationId=input.operationId;
    try{const transition=pendingTransitions.get(input.operationId),cleanup=cleanupAttempts.get(input.operationId);assert.ok(transition||cleanup,'PRIVATE_WALLET_RECONCILIATION_UNAVAILABLE');
     if(transition)await reconcileTransition(transition);
     else{const op=operations.get(cleanup.originalOperationId);assert.ok(op,'PRIVATE_WALLET_ORIGINAL_OPERATION_REQUIRED');
      if(cleanup.kind==='refund'){const result=await op.host.refundStatus();assert.ok(result&&['NOTE_ISSUED','WITHDRAWN'].includes(result.state),'PRIVATE_WALLET_REFUND_ISSUANCE_UNKNOWN');op.refund=result.state==='WITHDRAWN'?'WITHDRAWN':'ISSUED';}
      else if(cleanup.role==='refund'){let result=await op.host.reconcileRefundWithdrawal();if(result.state==='READY'){await op.host.withdrawRefund();result=await op.host.reconcileRefundWithdrawal();}assert.equal(result.state,'WITHDRAWN','PRIVATE_WALLET_EXIT_UNKNOWN');op.refund='WITHDRAWN';}
      else{let result=(await op.host.reconcilePayouts())[cleanup.role];if(result.state==='READY'){await op.host.recoverWithdraw(cleanup.role);result=(await op.host.reconcilePayouts())[cleanup.role];}assert.equal(result.state,'WITHDRAWN','PRIVATE_WALLET_EXIT_UNKNOWN');op.payouts[cleanup.role]='WITHDRAWN';}
      cleanup.confirmed=true;
     }
     const unresolved=operations.has(input.operationId)&&!operations.get(input.operationId).settled&&!operations.get(input.operationId).refund;
     if(!unresolved)await markIntent(intent.intentId,'COMPLETED',input.operationId);
     await publish({phase:unresolved?'QUARANTINED':cleanup?.kind==='refund'?'REFUND_NOTE_RETAINED':'READY',progressCode:unresolved?'ORIGINAL_RESERVATION_REQUIRES_SETTLEMENT':'CANONICAL_ACTION_RECONCILED',notesState:'RETAINED',engineState:'IDLE',errorCode:null});return sanitizePrivateWalletSummary(state);
    }finally{state.activeOperationId=null;}
   }
   if(action==='close'){exact(input,[]);state.activeOperationId=null;const s=await shared.pool.snapshot();assert.equal(s.liveReservations,0,'PRIVATE_WALLET_LIVE_RESERVATIONS');assert.equal(s.liveOutputNotes,0,'PRIVATE_WALLET_RETAINED_NOTES');assert.equal(await assetBinding.backingBalance(),0n,'PRIVATE_WALLET_BACKING_REMAINS');await publish({phase:'CLOSING',progressCode:'CLOSING_EMPTY_WALLET',engineState:'RUNNING',notesState:'EMPTY'});for(const op of operations.values())await op.host.cleanup();custody.close();await shared.close();await publish({phase:'CLOSED',progressCode:'WALLET_CLOSED',engineState:'STOPPED',authorityState:'CLOSED'});disposed=true;return sanitizePrivateWalletSummary(state);}
   throw new Error('PRIVATE_WALLET_UNKNOWN_ACTION');
  }finally{busy=false;}
 }
 const abort=async()=>{if(disposed)return;fault??=new Error('PRIVATE_WALLET_AUTHORITY_LOST');state.authorityState='UNAVAILABLE';state.engineState='STOPPED';state.notesState=state.notesState==='EMPTY'?'EMPTY':'UNKNOWN';for(const op of operations.values())await op.host.cleanup().catch(()=>{});custody?.close();await shared?.close();disposed=true;};
 async function replaySpendForTest(operationId){
  guard();assert.equal(busy,false,'PRIVATE_WALLET_ACTION_IN_PROGRESS');const record=pendingTransitions.get(operationId);assert.ok(record?.confirmed&&record.mode==='reserve_from_note','PC23_REPLAY_ORIGINAL_SPEND_REQUIRED');
  return shared.mutate('integration-recorded-spend-replay',async()=>{const before=await shared.pool.snapshot(),balance=await assetBinding.backingBalance(),p=assemblyEvmProof(record.proof),data=shared.pool.proofData(record.mode,p.proof,p.publicInputs),cursor=shared.pool.receipts.length;await shared.tick();let failed=false;
   try{await shared.pool.send('integration-only exact old S replay',{from:privateWalletAccountBindings(shared).relayer,to:shared.pool.address,data,value:'0x0'});}catch{failed=true;}
   assert.equal(failed,true,'PC23_REPLAY_NOT_REJECTED');const entries=shared.pool.receipts.slice(cursor),receipt=entries.find(e=>e.request.data===data&&e.receipt.status==='0x0');assert.ok(receipt,'PC23_REPLAY_FAILED_RECEIPT_REQUIRED');
   const after=await shared.pool.snapshot();for(const k of ['root','stateSequence','leafCount','spentCount','liveReservations','liveOutputNotes','solEffectCount','btcEffectCount'])assert.equal(after[k],before[k],'PC23_REPLAY_MUTATED_STATE');assert.equal(await assetBinding.backingBalance(),balance,'PC23_REPLAY_MUTATED_BALANCE');
   const result={kind:'INTEGRATION_ONLY_REPLAY_OF_ORIGINAL_SIGNED_S_NOT_FRESH_GUARD_NULLIFIER_TEST',operationId,failed:true,receipt:await captureAssemblyEvmReceipt(shared.runtime,receipt),before,after,poolBalance:balance.toString()};await shared.audit('old-spend-replay',result);await shared.archiveReceipts();return result;
  });
 }
 return Object.freeze({action,status:()=>sanitizePrivateWalletSummary(state),privateStatus,privateAssetStatus,privatePaymentAdmission,close:()=>action('close'),abort,replaySpendForTest});
}
export async function createOwnedWalletOperationHost(context, shared, custodyConfig, terms) {
  const PRIVATE_PAYMENT_AMOUNTS={reserveBaseUnits:terms.budget,solLamports:terms.amountSol,btcSats:(BigInt(terms.amountSol)*BigInt(terms.numerator)/BigInt(terms.denominator)).toString()};
  const payoutFor=role=>role==='sol'?terms.solCompensation:(BigInt(terms.budget)-BigInt(terms.solCompensation)).toString();
  const {runtime,solana,pool,pins,policy}=shared,accounts=privateWalletAccountBindings(shared),assetBinding=privateWalletAssetBinding(shared);let clock=shared.clock,owner,assembler,startEpoch,claimEpoch,authorizedRoot,reserve,reservedCommitment,projection;
  const fundingPreparation=createPrivateFundingPreparation();
  let reserveAttempted=false,reserveConfirmed=false,reserveReverted=false,settledProcessesRetired=false;
  let refundCustody,refundBinding,refundSettlement,refundWithdrawal,refundSigner,refundAttempted=false;
  let clockAnchor,clockAnchorAt,refundDeadlineAt,refundEligibleAt;
  const refundSigners=[];
  let activeHeavy=false,aborted,monitor,auditCount=0,evmReceiptCount=0,sourceHashes;
  const actors=[],recipients=[],children=[],vaults=[],roles={};
  const local=join(shared.local,'operations',context.operationId),auditDir=join(local,'native-audit');
  let directoryOwned=false;
  const guard=()=>{context.guard();if(aborted)throw aborted;resourceGuard();};
  const abort=()=>{aborted??=new Error('PRIVATE_PAYMENT_ABORTED');for(const a of actors)void a.control.terminate().catch(()=>{});for(const c of children)void stopOwnedChild(c).catch(()=>{});for(const signer of refundSigners)void signer.stop().catch(()=>{});};
  const audit=async(label,item)=>{assert.ok(directoryOwned,'PRIVATE_PAYMENT_AUDIT_DIRECTORY');const file=join(auditDir,String(++auditCount).padStart(5,'0')+'-'+label+'.json');await durablePrivateFile(file,item);return file;};
  const recordResources=async(stage,producer)=>{
    const sample=resourceSnapshot();
    if(producer) {
      sample.producerRSS=0;
      if(!producer.provenance().closed) { const status=readFileSync(`/proc/${producer.pid}/status`,'utf8'),match=/VmRSS:\s+(\d+)/.exec(status);assert.ok(match,'PC18_PRODUCER_RESOURCE_SAMPLE');sample.producerRSS=Number(match[1])*1024; }
    }
    // Only bounded numerical memory/disk samples and fixed stage names. No PID,
    // proof statement, native identifier or receipt enters this record.
    await audit('resources',{kind:'private-numeric-resource-sample',stage,...sample});
  };
  const archiveReceipts=()=>shared.archiveReceipts();
  async function heavy(label,work){guard();return shared.heavy(label,work);}

  function actor(kind,bootstrap) {
    guard();const p=launchAssemblyProcess(kind,bootstrap);actors.push(p);
    return {...p,side:Object.fromEntries(Object.entries(p.channels).map(([channel,stream])=>[channel,sideEndpoint(stream,{channel,pid:p.control.pid,inventory:[],label:kind})]))};
  }
  async function transferPackage(from,operation,to,admit,ownerAck,role) {
    guard();let pkg=await from.request(operation);const ack=await heavy('retain-'+(pkg.mode??pkg.role),()=>to.request(admit,pkg));
    const digest=assemblyPackageDigest(pkg);assert.equal(ack.packageSHA256,digest,'PC18_PACKAGE_ACK_MISMATCH');
    const acknowledged=ownerAck?await ownerAck.request('acknowledgePackage',{packageSHA256:ack.packageSHA256}):undefined;
    if(role)fundingPreparation.roleRetained(role,digest,ack,acknowledged);pkg=undefined;return ack;
  }
  async function submit(label,mode,proof,{value=0n,from=accounts.relayer}={}) {
    // Reserve has its own one-shot guarded path and may never use legacy calldata.
    assert.notEqual(mode,'reserve','PRIVATE_PAYMENT_GUARDED_RESERVE_REQUIRED');
    guard();clock=await shared.tick();
    const purpose=mode==='fulfill'?'claim':mode==='refund'?'refund':'withdraw';
    await context.beforeEvm(purpose);guard();let receipt;
    try {
      receipt=await pool.send(label,{from,to:pool.address,data:pool.proofData(mode,proof.proof,proof.publicInputs),value:'0x'+BigInt(value).toString(16)});
      context.evmConfirmed(purpose); // Preserve confirmed funds/notes if archiving or ACK subsequently fails.
    } finally { await archiveReceipts(); }
    return receipt;
  }
  async function submitAuthority(label,from,method,args) {
    guard();clock=await shared.tick();await context.beforeEvm('authority');guard();let receipt;
    try { receipt=await pool.send(label,{from,to:pool.address,data:pool.data(method,args)});context.evmConfirmed('authority'); }
    finally { await archiveReceipts(); }
    return receipt;
  }
  // The local chain is otherwise idle. Advance only by elapsed monotonic real
  // time during recovery; the explicit integration seam below is separate.
  async function progressRefundClock() {
    guard();const current=await runtime.time(),realElapsed=Math.floor((performance.now()-clockAnchorAt)/1000);
    const justified=clockAnchor+realElapsed;
    if(justified>current) { await runtime.evm('evm_setNextBlockTimestamp',[justified]);await runtime.evm('evm_mine'); }
    clock=Math.max(clock,await runtime.time());
  }
  async function startRefundSigner() {
    guard();if(refundSigner)await refundSigner.stop();
    refundSigner=launchOwnerRefundProcess({path:refundCustody.path,password:refundCustody.password,expectedBinding:refundBinding});refundSigners.push(refundSigner);
    await refundSigner.ready;
    await audit('owner-refund-signer',{kind:'private-owner-refund-signer-started',pid:refundSigner.pid,pool:pool.address,scope:pool.scope,originalOwner:owner.control.provenance()});
    return refundSigner;
  }
  async function ensureRefundWithdrawal() {
    if(refundWithdrawal)return;
    await host.assertOwnerExited();const signer=await startRefundSigner(),opening=await signer.request('opening');
    await signer.stop();
    refundWithdrawal=createOwnerRefundWithdrawalRecovery({pool,runtime,binding:refundBinding,opening,
      authorize:request=>{guard();return refundSigner.request('authorizeWithdrawal',request);},
      prove:input=>heavy('owner-refund-withdrawal-proof',()=>proveRecipientWithdrawal(input,'wallet-owner-refund-withdraw',children)),
      submit:async proof=>{
        const before=await assetBinding.balance('0x'+refundBinding.withdrawalRecipient);
        await submit('exact owner refund withdrawal','withdraw',proof);
        assert.equal(await assetBinding.balance('0x'+refundBinding.withdrawalRecipient)-before,BigInt(PRIVATE_PAYMENT_AMOUNTS.reserveBaseUnits),'PRIVATE_PAYMENT_EXACT_OWNER_REFUND_BALANCE');
      },
      persist:result=>audit('owner-refund-withdrawal',{kind:'private-owner-refund-withdrawal-state',...result}),
      onConfirmed:result=>context.ownerRefundConfirmed(result.amount),
    });
  }
  const policyFor=bridge=>{const p=bridge.policy;return{policyId:p.policyId,identityNamespace:p.identityNamespace,genesis:p.chainDomain.genesis,x:p.issuerPublicKey.x,y:p.issuerPublicKey.y};};
  const host={
    async prepare() {
      shared.guard();guard();
      await mkdir(dirname(local),{recursive:true,mode:0o700});await mkdir(local,{mode:0o700});directoryOwned=true;
      await mkdir(auditDir,{mode:0o700});sourceHashes=await snapshotSources(join(local,'source-at-start'));guard();
      context.signal?.addEventListener('abort',abort,{once:true});
      monitor=setInterval(()=>{try{guard();}catch(error){aborted??=error;abort();}},1000);
      const bind=shared.bind;
      await shared.prepareEpochWindow(330);clock=await shared.refreshClock();startEpoch=BigInt(Math.floor(clock/600));claimEpoch=startEpoch+12n;
      clockAnchor=clock;clockAnchorAt=performance.now();
      const untilCutoff=Number(claimEpoch*600n-BigInt(clock))*1000;
      refundDeadlineAt=clockAnchorAt+untilCutoff+PRIVATE_REFUND_RECOVERY_MARGIN_MS;refundEligibleAt=new Date(Date.now()+untilCutoff).toISOString();
      assert.ok(untilCutoff+PRIVATE_REFUND_RECOVERY_MARGIN_MS<=PRIVATE_REFUND_LIFETIME_MAX_MS,'PRIVATE_PAYMENT_REFUND_RETENTION_BOUND');
      refundCustody={path:join(local,'owner-refund.vault'),password:'synthetic-'+randomBytes(32).toString('hex'),withdrawalRecipient:accounts.ownerWithdrawal.slice(2)};vaults.push(refundCustody.path);
      const tokens={sol:randomBytes(32).toString('hex'),btc:randomBytes(32).toString('hex')};
      const btcAddress=await runtime.btc('getnewaddress',['','bech32'],'m9-recipient'),btcInfo=await runtime.btc('getaddressinfo',[btcAddress],'m9-recipient');
      owner=actor('owner',{plan:{scope:pool.scope.slice(2),policy,epoch:startEpoch.toString(),sourceSol:base58Decode(solana.solver,32).toString('hex'),recipientSol:base58Decode(solana.recipient,32).toString('hex'),recipientBtc:sha(Buffer.from(btcInfo.scriptPubKey,'hex')),claimEpoch:claimEpoch.toString(),amountSol:PRIVATE_PAYMENT_AMOUNTS.solLamports,numerator:terms.numerator,denominator:terms.denominator,budget:PRIVATE_PAYMENT_AMOUNTS.reserveBaseUnits,solCompensation:terms.solCompensation},bridgeTokens:tokens,ownerRefundCustody:refundCustody,walletCustody:{...custodyConfig,terms}});await owner.control.ready;
      assembler=actor('assembler',{kind:'assembler',scope:pool.scope.slice(2),policy:pool.policy.slice(2),pins});await assembler.control.ready;
      for(const role of ['sol','btc']) {
        guard();const terms=await owner.side[role].request('terms');assert.equal(terms.value,payoutFor(role));assert.equal(terms.descriptor.amount,role==='sol'?PRIVATE_PAYMENT_AMOUNTS.solLamports:PRIVATE_PAYMENT_AMOUNTS.btcSats);
        const vaultPath=join(local,role+'.vault');vaults.push(vaultPath);const withdrawalRecipient=accounts.payouts[role].slice(2);
        const custody={path:vaultPath,password:'synthetic-'+randomBytes(32).toString('hex'),expectedTerms:terms,withdrawalRecipient};
        let recipient=await startRecipient(custody,[],children);recipients.push(recipient);
        const {termsDigest,value,paymentCommitment,localCommitment}=recipient.review;
        await recipient.request('acknowledgeCompensation',{termsDigest,value,paymentCommitment,localCommitment},'operator');
        const invoice=await recipient.request('invoice',terms);importRecipientInvoice(terms,invoice);await owner.side[role].request('acceptInvoice',invoice);
        const retainedRecipient=createRetainedWalletRecipient({role,initialRecipient:recipient,custody,expectedReview:{role,acknowledged:true,termsDigest,value,paymentCommitment,localCommitment},guard,startRecipient:async config=>{const restored=await startRecipient(config,[],children);recipients.push(restored);return restored;}});
        const producer=actor('producer',{kind:'producer',role,policy,bridgeToken:tokens[role]});await producer.control.ready;
        const service=createAssemblyNativeDispatch({role,bridgeToken:tokens[role],nativeDestination:role==='sol'?solana.recipient:btcAddress,nowSeconds:()=>shared.clock,recipientAck:input=>retainedRecipient.assertNativeExposureAcknowledged(input),
          archivePrivate:async item=>{
            await audit(role,item); // fsync complete before durable public exposure/ACK.
            if(item.kind==='signed-native-dispatch') { await context.signedRetained(role);guard(); }
          },createBridge:callbacks=>bind(role,callbacks)});
        assert.deepEqual(policyFor(service),policy[role]);service.attachPool(pool,runtime);
        service.attachAuthority(bridge=>createCurrentFinalityAuthority({chain:role.toUpperCase(),bridge,pool,account:accounts.authorities[role],chainId:runtime.metadata.chainId,nowSeconds:()=>shared.clock,submitAuthority,archive:entry=>audit('authority-'+role,entry)}));
        const payoutRecovery=createRecipientPayoutRecovery({pool,runtime,terms,invoice,recipient:withdrawalRecipient,
          authorize:request=>{guard();return retainedRecipient.authorizeWithdrawal(request);},
          prove:input=>heavy(role+'-withdrawal-proof',()=>proveRecipientWithdrawal(input,'wallet-'+role+'-withdraw',children)),
          submit:async proof=>{
            guard();const account='0x'+withdrawalRecipient,before=await assetBinding.balance(account);
            await submit(role+' exact recipient withdrawal','withdraw',proof);
            const delta=await assetBinding.balance(account)-before;assert.equal(delta,BigInt(payoutFor(role)),'PRIVATE_PAYMENT_EXACT_RECIPIENT_BALANCE');
          },
          persist:result=>audit('payout-'+role,{kind:'private-recipient-payout-state',...result}),
          onConfirmed:result=>context.withdrawalConfirmed?.(role,result.amount),
        });
        roles[role]={
          async retain(){await transferPackage(owner.side[role],'ownPackage',producer.side.owner,'retainPackage',owner.side[role],role);let binding=await producer.side.broker.request('bridgeBinding');service.retainBinding(binding);binding=undefined;},
          async execute(readiness){await host.assertOwnerExited();await context.beforeNative(role);guard();await service.dispatch({bridgeToken:tokens[role],readiness});guard();if(role==='btc')await runtime.btc('generatetoaddress',[6,runtime.miningAddress]);let certificate=await service.certify(tokens[role]);await context.observed(role);await heavy(role+'-local-proof',()=>producer.side.broker.request('proveLocal',{certificate}));certificate=undefined;await retainLocalProofAndRetireProducer({role,producer,assembler,transferPackage,recordResources});},
          async permit(pkg){guard();return service.permit(tokens[role],pkg);},
          async withdraw(){
            guard();try{const result=await payoutRecovery.recover();
              assert.equal(result.state,'WITHDRAWN','PRIVATE_PAYMENT_PAYOUT_NOT_VERIFIED');return {role,amount:result.amount};
            }finally{if(settledProcessesRetired)await retainedRecipient.retire();}
          },
          async recoverWithdraw(){
            guard();await retainedRecipient.retire();
            // The SAME exact payoutRecovery object decides READY/UNKNOWN first.
            // Only its existing authorize callback may lazily restore a signer.
            return roles[role].withdraw();
          },
          retainedRecipient,
          reconcile:()=>payoutRecovery.reconcile(),
          audit:()=>service.audit(),
        };
      }
    },
    async prepareReserve(){
      guard();assert.equal(reserve,undefined,'PRIVATE_PAYMENT_RESERVE_ALREADY_PREPARED');
      const before=await pool.snapshot();await assertPrivateSnapshotCanonical(runtime,before);
      const result=await owner.side.wallet.request('prepareWalletReserve',{requestId:context.operationId,operationId:context.operationId,inputCommitment:context.inputCommitment,snapshot:walletCustodySnapshot(before)});
      await context.custodyCheckpoint(result.checkpoint);projection=result.preparation;
      const proved=await heavy('wallet-reserve-proof',()=>owner.side.wallet.request('proveWalletReserve'));await context.custodyCheckpoint(proved.checkpoint);reserve=validateAssemblyProofPackage(proved.proof,'reserve_from_note');
      const s=decodeWalletPoolInputs('reserve_from_note',reserve.publicInputs);assert.equal(s.scope,pool.scope);assert.equal(s.policy,pool.policy);
      reservedCommitment=s.output;authorizedRoot=s.expectedPostRoot;
      projection={...projection,snapshot:before,statement:s,path:projection.reservationPath,guards:{expectedRoot:s.expectedBaseRoot,expectedSequence:s.expectedSequence,expectedPostRoot:s.expectedPostRoot},epoch:s.epoch,reservePackageSHA256:assemblyPackageDigest(reserve)};
      fundingPreparation.reservePrepared(projection);
      await audit('reserve-projection',{kind:'private-unfunded-wallet-reservation',epoch:s.epoch,guards:projection.guards,reservedCommitment,reservePackageSHA256:projection.reservePackageSHA256});
    },
    async authorize(){
      guard();assert.ok(projection&&reserve,'PRIVATE_PAYMENT_RESERVE_PREPARATION_REQUIRED');
      await heavy('owner-authorization',()=>owner.control.request('proveAuthorization',{path:projection.path}));
      let originalAuthorization=validateAssemblyProofPackage(await owner.side.assembler.request('authorization'),'authorization');
      const a=originalAuthorization.publicInputs;
      refundBinding={scope:pool.scope.slice(2),policy:pool.policy.slice(2),budget:PRIVATE_PAYMENT_AMOUNTS.reserveBaseUnits,withdrawalRecipient:refundCustody.withdrawalRecipient,cutoff:claimEpoch.toString(),reservedCommitment:reservedCommitment.slice(2),reserveNullifier:noteWordsToHash(a.slice(32,40)).slice(2),paymentCommitment:noteWordsToHash(a.slice(72,80)).slice(2)};
      assert.equal(a[80],refundBinding.cutoff,'PRIVATE_PAYMENT_ORIGINAL_REFUND_CUTOFF');assert.equal(noteWordsToHash(a.slice(24,32)),authorizedRoot,'PRIVATE_PAYMENT_ORIGINAL_REFUND_ROOT');
      const ack=await heavy('retain-authorization',()=>assembler.side.owner.request('retainAuthorization',originalAuthorization));
      const ownerAck=await owner.side.assembler.request('acknowledgePackage',{packageSHA256:ack.packageSHA256});
      fundingPreparation.authorizationRetained(originalAuthorization,ack,ownerAck);
      // Installed before ANY funding attempt; this retains the exact original A
      // and still requires its root to be accepted by the real canonical pool.
      refundSettlement=createOwnerRefundSettlementReconciler({pool,runtime,authorizationInputs:a,reservedCommitment});originalAuthorization=undefined;
      for(const role of ['sol','btc'])await roles[role].retain();
      // Authenticate the actual encrypted original backup against verified A.
      // This temporary recovery-only signer cannot create or substitute a key.
      const signer=await startRefundSigner();
      try { validateOwnerRefundOpening(await signer.request('opening'),refundBinding); }
      finally { const exit=await signer.stop();assert.equal(exit.code,0,'PRIVATE_PAYMENT_CUSTODY_AUTHENTICATION_EXIT'); }
      fundingPreparation.custodyAuthenticated();
      const complete=await owner.control.request('completePackages');fundingPreparation.packagesCompleted(complete);
      await audit('preauthorized-packages',{kind:'private-original-authorization-retained-before-funding',atNs:stamp(),authorizationSHA256:complete.authorizationSHA256,delivered:complete.delivered,custodyAuthenticated:true,refundReconcilerInstalled:true,guards:projection.guards});
    },
    async releaseOwner(){
      guard();const exit=await stopAssemblyActor(owner.control);assert.equal(exit.code,0,'PC18_OWNER_CLEAN_EXIT');await host.assertOwnerExited();
      fundingPreparation.ownerExited(owner.control.provenance());await audit('owner-exit',owner.control.provenance());
    },
    async reserve(){
      guard();await host.assertOwnerExited();assert.ok(refundSettlement,'PRIVATE_PAYMENT_ORIGINAL_AUTHORIZATION_REQUIRED');
      const preparation=fundingPreparation.beforeSend(reserve);await audit('funding-preparation-complete',preparation);
      const s=projection.statement,current=await pool.snapshot();
      assert.equal(current.root,s.expectedBaseRoot,'PC23_RESERVE_STALE_ROOT');assert.equal(current.stateSequence,s.expectedSequence,'PC23_RESERVE_STALE_SEQUENCE');
      assert.equal(current.epoch,s.epoch,'PC23_RESERVE_STALE_EPOCH');await assertPrivateSnapshotCanonical(runtime,current);
      reserveAttempted=true;await context.submitSpend({reserve,projection});host.confirmReserve();clock=await shared.refreshClock();
      await context.publish({progressCode:'PRIVATE_RESERVATION_CONFIRMED'});
    },
    confirmReserve(){const p=owner.control.provenance();assert.ok(p.closed&&p.channelsClosed&&p.writesAfterExit===0,'PC23_ORIGINAL_OWNER_EXIT_REQUIRED');reserveAttempted=true;reserveConfirmed=true;context.evmConfirmed('reserve');},
    async assertOwnerExited(){guard();const p=owner.control.provenance();assert.equal(p.closed,true,'PC18_OWNER_MUST_EXIT');assert.equal(p.channelsClosed,true,'PC18_OWNER_CHANNELS_MUST_CLOSE');assert.equal(p.writesAfterExit,0,'PC18_OWNER_POST_EXIT_WRITE');},
    async readiness(role){guard();assert.equal(reserveConfirmed,true,'PRIVATE_PAYMENT_CONFIRMED_FUNDING_REQUIRED');await host.assertOwnerExited();await shared.prepareEpochWindow(330);const snapshot=await pool.snapshot(),start=performance.now();await heavy(role+'-readiness',()=>assembler.control.request('proveReadiness',{role,snapshot,epoch:snapshot.epoch}));assert.ok(performance.now()-start<600000,'PC18_READINESS_TIMING_REDESIGN_REQUIRED');await shared.refreshClock();assert.equal((await pool.snapshot()).epoch,snapshot.epoch,'PC23_READINESS_EPOCH_EXPIRED');return assembler.side[role].request('readiness');},
    async execute(role,ready){return roles[role].execute(ready);},
    async join(){await heavy('joined-authorization-sol',()=>assembler.control.request('proveJoin'));},
    async terminal(){await shared.prepareEpochWindow(330);await recordResources('BEFORE_TERMINAL_FULFILLMENT');await heavy('terminal-fulfillment',async()=>assembler.control.request('proveFulfillment',{epoch:(await pool.snapshot()).epoch}));await shared.refreshClock();const pkg=await assembler.control.request('terminalProof');assert.equal(BigInt(pkg.publicInputs[16]).toString(),(await pool.snapshot()).epoch,'PC23_TERMINAL_EPOCH_EXPIRED');assert.equal(noteWordsToHash(assemblyEvmProof(pkg).publicInputs.slice(17,25)),authorizedRoot,'PC18_ORIGINAL_AUTHORIZATION_ROOT');return pkg;},
    async permit(role,pkg){await roles[role].permit(pkg);},
    async claim(pkg){await submit('recursive terminal and fresh permits issue payouts','fulfill',assemblyEvmProof(pkg));},
    async withdraw(role){await shared.prepareEpochWindow(100);return roles[role].withdraw();},
    async recoverWithdraw(role){await shared.prepareEpochWindow(100);return roles[role].recoverWithdraw();},
    async reconcilePayouts(){return {sol:await roles.sol.reconcile(),btc:await roles.btc.reconcile()};},
    async assertRetainedHealthy(){guard();},
    async refundStatus(){
      if(!refundSettlement||!reserveAttempted||reserveReverted)return null;
      guard();await host.assertOwnerExited();await progressRefundClock();
      const result=await refundSettlement.reconcile();
      const base={claimEpoch:refundBinding.cutoff,eligibleAt:refundEligibleAt};
      if(result.state==='CLAIMED')return {...base,state:'CLAIMED'};
      if(result.state==='FUNDED')return {...base,state:refundAttempted?'UNKNOWN':BigInt(result.epoch)>=claimEpoch?'ELIGIBLE':'WAITING'};
      if(result.state==='NOTE_ISSUED') {
        await ensureRefundWithdrawal();const withdrawn=await refundWithdrawal.reconcile();
        if(withdrawn.state==='WITHDRAWN')return {...base,state:'WITHDRAWN',amount:withdrawn.amount};
        return {...base,state:'NOTE_ISSUED'};
      }
      return {...base,state:'UNKNOWN'};
    },
    async refundWindow(){return {remainingMs:Math.max(0,Math.ceil(refundDeadlineAt-performance.now()))};},
    async advanceToRefundCutoffForTest(){
      guard();await host.assertOwnerExited();assert.ok(refundSettlement,'PRIVATE_PAYMENT_ORIGINAL_AUTHORIZATION_REQUIRED');
      const before=await runtime.time(),cutoff=Number(claimEpoch*600n);
      if(before<cutoff) { await runtime.evm('evm_setNextBlockTimestamp',[cutoff]);await runtime.evm('evm_mine'); }
      clock=await runtime.time();
      await audit('owner-refund-clock',{kind:'integration-only-accelerated-local-chain-time',before,after:clock,claimEpoch:claimEpoch.toString(),pool:pool.address});
    },
    async issueRefund(){
      await shared.prepareEpochWindow(330);guard();assert.equal(refundAttempted,false,'PRIVATE_PAYMENT_REFUND_ALREADY_ATTEMPTED');await host.assertOwnerExited();await progressRefundClock();
      let checked=await refundSettlement.reconcile();assert.equal(checked.state,'FUNDED','PRIVATE_PAYMENT_REFUND_RESERVE_UNAVAILABLE');assert.ok(BigInt(checked.epoch)>=claimEpoch,'PRIVATE_PAYMENT_REFUND_BEFORE_CUTOFF');
      const proofEpoch=checked.epoch;
      await heavy('terminal-owner-refund',()=>assembler.control.request('proveRefund',{epoch:proofEpoch}));
      const pkg=validateAssemblyProofPackage(await assembler.control.request('terminalProof'),'refund'),proof=assemblyEvmProof(pkg);
      assertOriginalRefundProofBinding(proof,{scope:pool.scope,policy:pool.policy,epoch:proofEpoch,root:authorizedRoot,reserveNullifier:'0x'+refundBinding.reserveNullifier,paymentCommitment:'0x'+refundBinding.paymentCommitment});
      checked=await refundSettlement.reconcile();assert.equal(checked.state,'FUNDED','PRIVATE_PAYMENT_REFUND_RESERVE_UNAVAILABLE');assert.equal(checked.epoch,proofEpoch,'PRIVATE_PAYMENT_REFUND_EPOCH_CHANGED');
      assert.equal(Math.floor((Math.max(clock,await runtime.time())+1)/600).toString(),proofEpoch,'PRIVATE_PAYMENT_REFUND_EPOCH_CHANGED');
      // Latch before any possible send and keep it in this surviving authority.
      refundAttempted=true;
      await submit('genuine original authorization refund issues exact owner note','refund',proof);
      checked=await refundSettlement.reconcile();assert.equal(checked.state,'NOTE_ISSUED','PRIVATE_PAYMENT_REFUND_ISSUANCE_UNCONFIRMED');
      await audit('owner-refund-issued',{kind:'private-original-authorization-refund',...checked,owner:owner.control.provenance(),services:{sol:roles.sol.audit(),btc:roles.btc.audit()}});
    },
    async reconcileRefundWithdrawal(){guard();await ensureRefundWithdrawal();return refundWithdrawal.reconcile();},
    async withdrawRefund(){
      guard();await shared.prepareEpochWindow(100);await ensureRefundWithdrawal();await startRefundSigner();
      const result=await refundWithdrawal.recover();assert.equal(result.state,'WITHDRAWN','PRIVATE_PAYMENT_OWNER_REFUND_NOT_VERIFIED');return {amount:result.amount};
    },
    async verifyRefund(){
      const status=await host.refundStatus();assert.equal(status.state,'WITHDRAWN','PRIVATE_PAYMENT_OWNER_REFUND_NOT_VERIFIED');
      const final=await pool.snapshot();assert.equal(await assetBinding.backingBalance(),0n,'PRIVATE_PAYMENT_POOL_BALANCE');assert.equal(final.liveReservations,0);assert.equal(final.liveOutputNotes,0);
      await assertPrivatePaymentSourcesUnchanged(sourceHashes);
      await audit('owner-refund-completion',{kind:'private-owner-refund-completion',pool:pool.address,scope:pool.scope,finalState:final,owner:owner.control.provenance(),ownerRefundAmount:PRIVATE_PAYMENT_AMOUNTS.reserveBaseUnits,services:{sol:roles.sol.audit(),btc:roles.btc.audit()},nativePrefixRolledBack:false,executorCompensationPaid:false});
    },
    async recordCoordinator(entry){await audit('coordinator',{kind:'private-payment-coordinator-lifecycle',...entry,pool:pool.address,scope:pool.scope,policy:pool.policy,evmGenesis:runtime.metadata.evmGenesis,bitcoinGenesis:runtime.metadata.bitcoinGenesis,solanaGenesis:solana.genesis});},
    async validateRecovery(){
      guard();await host.assertOwnerExited();
      const states=await host.reconcilePayouts();
      for(const role of ['sol','btc'])assert.ok(['READY','WITHDRAWN'].includes(states[role].state),'PRIVATE_PAYMENT_RECOVERY_EVIDENCE_REQUIRED');
      await audit('recovery-authority',{kind:'private-same-authority-recovery',pool:pool.address,scope:pool.scope,policy:pool.policy,owner:owner.control.provenance(),states});
    },
    async verifyCompletion(){
      await host.assertOwnerExited();const final=await pool.snapshot(),settled=await refundSettlement.reconcile();assert.equal(settled.state,'CLAIMED','PC23_EXACT_OPERATION_NOT_SETTLED');
      const payouts=await host.reconcilePayouts();for(const role of ['sol','btc'])assert.ok(['READY','WITHDRAWN'].includes(payouts[role].state),'PC23_PAYOUT_NOTE_NOT_ISSUED');
      const sol=roles.sol.audit(),btc=roles.btc.audit(),exited=BigInt(owner.control.provenance().exitedAtNs);
      assert.ok(exited<BigInt(sol.dispatchEnteredAtNs));assert.ok(BigInt(sol.certifiedAtNs)<BigInt(btc.authorizedAtNs));
      await audit('settled-in-pool',{kind:'private-wallet-operation-settled-in-pool',finalState:final,owner:owner.control.provenance(),services:{sol,btc},payouts,finalityProfile:FINALITY_PROFILE_NAME});
      return {payouts,claimEpoch:claimEpoch.toString()};
    },
    retirementComplete(){return settledProcessesRetired&&assembler.control.provenance().closed&&['sol','btc'].every(role=>roles[role].retainedRecipient.provenance().closed);},
    async retireSettledProcesses(){
      await host.assertOwnerExited();let retirementVerified=false;
      try{const report=await retirePrivateWalletSettledProcesses({assembler:assembler.control,recipients:{sol:roles.sol.retainedRecipient,btc:roles.btc.retainedRecipient},
        verifySettled:async()=>{const settled=await refundSettlement.reconcile(),payouts=await host.reconcilePayouts();const verified={state:settled.state,payouts:Object.fromEntries(['sol','btc'].map(role=>[role,payouts[role].state]))};retirementVerified=verified.state==='CLAIMED'&&['sol','btc'].every(role=>['READY','WITHDRAWN'].includes(verified.payouts[role]));return verified;},
        recordSample:async(stage,processes)=>{const sample=resourceSnapshot();sample.retainedChildRSS=0;sample.retainedLiveChildren=0;for(const p of [processes.assembler,...Object.values(processes.recipients)])if(!p.closed){const match=/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${p.pid}/status`,'utf8'));assert.ok(match,'PC23_RETIRE_RESOURCE_SAMPLE');sample.retainedChildRSS+=Number(match[1])*1024;sample.retainedLiveChildren++;}await audit('resources',{kind:'private-numeric-resource-sample',stage,...sample});},
        recordRetirement:record=>audit('settled-process-retirement',record),
      });
      return report;
      }finally{
        // Preserve observed closure even if the final audit/checkpoint fails.
        // Never classify an unverified or partially retired branch as complete.
        const closed=assembler.control.provenance().closed&&assembler.control.provenance().channelsClosed&&['sol','btc'].every(role=>{const p=roles[role].retainedRecipient.provenance();return p.closed&&p.channelsClosed;});
        if(retirementVerified&&closed){settledProcessesRetired=true;clearInterval(monitor);monitor=undefined;}
        // Shared authority resource monitoring and this host's abort listener
        // remain; no custody/recovery object or native authority is disposed.
      }
    },
    async privateOutputs(){return {sol:{amount:payoutFor('sol'),state:(await roles.sol.reconcile()).state},btc:{amount:payoutFor('btc'),state:(await roles.btc.reconcile()).state}};},
    async cleanup(){
      clearInterval(monitor);context.signal?.removeEventListener('abort',abort);const failures=[],recipientExits=[];
      for(const signer of refundSigners)try{await signer.stop();}catch(error){failures.push(safeCode(error));}
      for(const recipient of recipients) {
        try { recipientExits.push(await (aborted||context.signal?.aborted?recipient.terminate():recipient.stop())); }
        catch(error) {
          // Abort may arrive after a graceful shutdown request was entered.
          // Its own SIGTERM rejection is not a failed cleanup if the same
          // captured child is subsequently observed fully closed.
          if(aborted||context.signal?.aborted)try{recipientExits.push(await recipient.terminate());}catch(terminationError){failures.push(safeCode(terminationError));}
          else failures.push(safeCode(error));
        }
      }
      for(const actor of actors)try{if(aborted||context.signal?.aborted)await actor.control.terminate();else await stopAssemblyActor(actor.control);}catch{try{await actor.control.terminate();}catch(error){failures.push(safeCode(error));}}
      for(const child of children)try{await stopOwnedChild(child);}catch(error){failures.push(safeCode(error));}
      // Preserve encrypted recipient stores as recovery artifacts. Passwords
      // remain only in this keeper lifetime; its loss is still unrecoverable.
      // Shared issuer and nodes belong to the wallet, never this operation.
      if(actors.some(a=>!a.control.provenance().closed))failures.push('PRIVATE_PAYMENT_ACTOR_CLEANUP');
      
      if(directoryOwned)try{await audit('cleanup',{kind:'private-owned-cleanup',completed:failures.length===0,failures,recipientVaultsRemoved:false,recipientVaultsRetainedEncrypted:true,ownerRefundVaultRetainedEncrypted:Boolean(refundCustody),recipientExits,ownedChildrenClosed:true,actorProcesses:actors.map(a=>a.control.provenance()),privateEvmReceiptCount:evmReceiptCount});}catch(error){failures.push(safeCode(error));}
      assert.equal(failures.length,0,'PRIVATE_PAYMENT_CLEANUP_FAILED');
    },
  };
  return host;
}
