/** Current original observations only. No caller supplies balances, observations,
 * signatures, proof acceptance booleans or baseline records to this oracle. */
import assert from 'node:assert/strict';
import { wrappedSourceWorkDiagnosticV2 } from './wrapped-installation-source-inspector-v2.mjs';
import { ownedWrappedWalletFixedFixtureV1 } from './wrapped-wallet-fixed-fixture-v1.mjs';
import { WRAPPED_WALLET_ECONOMICS_V1 as E } from './wrapped-wallet-fixed-policy-v1.mjs';
import { originalWrappedCombinedAuditFailureV1 } from '../wallet-platform/modules/ops/wrapped-claim-combined-operators-v1.mjs';
const baselines=new WeakMap();
// Original failed observations only; neither this map nor its getter is authority.
const observationFailures=new WeakMap();
function freezeObservationFailure(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freezeObservationFailure(child);Object.freeze(value);}return value;}
function retainObservationFailure(error,fixture,scope,stage,counts,timing){
 const failure=error&&(typeof error==='object'||typeof error==='function')?error:new Error('WRAPPED_TERMINAL_OBSERVATION_FAILED',{cause:error});
 const record=freezeObservationFailure({schema:'WRAPPED_ORIGINAL_OBSERVATION_FAILURE_V1',scope,stage,completed:false,
  counts:{...counts},timing,sharedAudit:originalWrappedCombinedAuditFailureV1(error)});
 observationFailures.set(failure,{fixture,record});return failure;
}
export function originalWrappedWalletObservationFailureV1(error,fixture){assert.equal(arguments.length,2);const entry=error&&(typeof error==='object'||typeof error==='function')?observationFailures.get(error):null;return entry?.fixture===fixture?entry.record:null;}

// Keep every original tree data field, excluding only the derived path method.
// Whole owned observations remain the authority; this is comparison/storage data.
function wrappedPoolObservationDataV1(view){
 const fields=(value,names,code)=>{
  assert.ok(value&&Object.isFrozen(value),code);
  assert.deepEqual(Reflect.ownKeys(value).sort(),[...names].sort(),code);
  for(const name of names){const d=Object.getOwnPropertyDescriptor(value,name);assert.ok(d&&Object.hasOwn(d,'value')&&d.enumerable,code);}
 };
 fields(view,['classification','header','head','poolIndex','poolAddress','hubAddress','domain','domainCommitment',
  'assetMetadata','assetObservation','registry','adapterProfiles','poolObservation','ledger','state','stateOpening',
  'evidenceState','admissionRevocationState','receiptTree','receiptLeaves','revokedEntries','spentTags','snapshot',
  'snapshotDigest','authorizationTree','authorizationRoots','checkpointTree','checkpointCount','checkpoints',
  'evidenceHistory','overflow','healthState','capacity'],'WRAPPED_TERMINAL_POOL_VIEW_FIELDS');
 fields(view.ledger,['tree','commitments','nullifiers','roots','publicState'],'WRAPPED_TERMINAL_LEDGER_FIELDS');
 const treeData=(tree,history)=>{
  fields(tree,['root','count','leafCount','nodes','leaves','path',...(history?['prefixRoots']:[])],'WRAPPED_TERMINAL_TREE_FIELDS');
  assert.equal(typeof tree.path,'function','WRAPPED_TERMINAL_TREE_PATH');
  const {path,...data}=tree;return data;
 };
 const {ledger,receiptTree,authorizationTree,checkpointTree,...data}=view;
 return structuredClone({...data,ledger:{...ledger,tree:treeData(ledger.tree,false)},
  receiptTree:treeData(receiptTree,false),authorizationTree:treeData(authorizationTree,true),checkpointTree:treeData(checkpointTree,true)});
}
const amount=(inventory,role)=>BigInt(inventory.accounts.find(row=>row.role===role).total);
// Each phase has at most three independent read-only branches. Drain every
// started branch (including synchronous failures) before failure/cleanup escapes.
async function completeReadGroup(work){
 assert.ok(work.length>0&&work.length<=3,'WRAPPED_TERMINAL_READ_GROUP_BOUND');
 let failed=false,firstError;
 const results=await Promise.allSettled(work.map(read=>Promise.resolve().then(read).catch(error=>{
  if(!failed){failed=true;firstError=error;}throw error;
 })));
 if(failed)throw firstError;
 return results.map(result=>result.value);
}
async function observe(fixture,scope){
 const s=ownedWrappedWalletFixedFixtureV1(fixture),started=performance.now();
 const counts={readerGroupCompleted:0,claimReadsCompleted:0,poolReadsCompleted:0,nativeInventoriesBeforeCompleted:0,reciprocalAuditsCompleted:0,nativeInventoriesAfterCompleted:0,claimCurrentChecksCompleted:0,poolCurrentChecksCompleted:0};let stage='load-original-readers';
 // Failure-only work attribution. No diagnostic value is an authority input,
 // clock reset, reused observation, timeout, or alternative success condition.
 const stageCosts=[],readCosts=[],sourceWorkStarted=wrappedSourceWorkDiagnosticV2();let stageStarted=started;
 const milliseconds=value=>Number.isFinite(value)&&value>=0?Math.min(3_600_000,Math.ceil(value)):null;
 const nextStage=next=>{const now=performance.now();stageCosts.push({stage,elapsedMilliseconds:milliseconds(now-stageStarted)});stage=next;stageStarted=now;};
 const timed=async(label,read)=>{const began=performance.now(),readStage=stage;try{return await read();}finally{readCosts.push({stage:readStage,read:label,elapsedMilliseconds:milliseconds(performance.now()-began)});}};
 const failedTiming=()=>{const now=performance.now(),work=wrappedSourceWorkDiagnosticV2(),sourceWorkAvailable=work.available&&sourceWorkStarted.available&&!work.saturated&&!sourceWorkStarted.saturated;
  return {schema:'WRAPPED_ORIGINAL_OBSERVATION_COSTS_V1',classification:'DIAGNOSTIC_ONLY_NOT_FRESHNESS_AUTHORITY',elapsedMilliseconds:milliseconds(now-started),stages:[...stageCosts,{stage,elapsedMilliseconds:milliseconds(now-stageStarted)}],reads:readCosts,
   sourceWork:{available:sourceWorkAvailable,inspections:sourceWorkAvailable?work.inspections-sourceWorkStarted.inspections:null,elapsedMilliseconds:sourceWorkAvailable?milliseconds(work.elapsedMilliseconds-sourceWorkStarted.elapsedMilliseconds):null}};};
 try{
 const {assertOwnedWrappedClaimWalletSystemV1}=await import('../wallet-platform/modules/ops/wrapped-claim-wallet-binding-v1.mjs');
 const {createWrappedClaimGraphStateReaderV1}=await import('../wallet-platform/modules/paeg/wrapped-claim-system-state-v1.mjs');
 const {auditClaimNativeInventory,claimEconomicInventory}=await import('../wallet-platform/modules/native-claims/backing-audit.mjs');
 nextStage('assert-original-system');assertOwnedWrappedClaimWalletSystemV1(s.runtime,s.system);
 nextStage('create-two-original-graph-readers');const readers=await completeReadGroup([0,1].map(poolIndex=>()=>timed('pool-'+poolIndex,()=>createWrappedClaimGraphStateReaderV1({runtime:s.runtime,system:s.system,poolIndex}))));
 counts.readerGroupCompleted=1;nextStage('read-original-claims-and-pools');
 const [claims,...pools]=await completeReadGroup([
  async()=>{const view=await timed('claims',()=>s.observer.read());counts.claimReadsCompleted=1;return view;},
  ...readers.map((reader,i)=>async()=>{const view=await timed('pool-'+i,()=>reader.read());counts.poolReadsCompleted++;return view;})]);
 nextStage('join-original-heads');pools.forEach(pool=>assert.deepEqual(pool.head,claims.head));
 // A native runtime owns a single inventory window. Only the distinct BTC
 // and SOL runtimes overlap; both finish before the reciprocal audit starts.
 nextStage('read-native-inventories-before');
 const nativeReads=await completeReadGroup([s.bitcoin,s.solana].map((native,i)=>async()=>{
  const inventory=await timed('native-'+i,()=>native.inventory());
  const funds=auditClaimNativeInventory(inventory,s.system.claims.configs[i],native.roles,native.nonceInfrastructureByAuthority??null);
  counts.nativeInventoriesBeforeCompleted++;return {inventory,funds};
 }));
 const inventories=nativeReads.map(row=>row.inventory),nativeFunds=nativeReads.map(row=>row.funds);
 nextStage('complete-original-reciprocal-quorum-audit');const audit=await timed('quorum',()=>s.system.quorum.audit({poolIndex:1}));counts.reciprocalAuditsCompleted=1;assert.equal(audit.classification,'ORIGINAL_WRAPPED_RECIPROCAL_FULL_INVENTORY_AUDIT_V1');
 assert.equal(audit.signed,false);assert.deepEqual(audit.head,claims.head);assert.deepEqual(audit.signerIndexes,s.system.quorum.signerIndexes);
 nextStage('recheck-native-inventories-after');await completeReadGroup([s.bitcoin,s.solana].map((native,i)=>async()=>{assert.deepEqual(claimEconomicInventory(await timed('native-'+i,()=>native.inventory())),claimEconomicInventory(inventories[i]));counts.nativeInventoriesAfterCompleted++;}));
 nextStage('assert-original-current-heads');await completeReadGroup([
  async()=>{await timed('claims',()=>s.observer.assertCurrent(claims));counts.claimCurrentChecksCompleted=1;},
  ...readers.map((reader,i)=>async()=>{await timed('pool-'+i,()=>reader.assertCurrent(pools[i]));counts.poolCurrentChecksCompleted++;})]);
 nextStage('terminal-original-deadline');assert.ok(performance.now()-started<30_000,'WRAPPED_TERMINAL_COMPLETE_AUDIT_TOO_OLD');
 return {claims,pools,inventories,nativeFunds,audit};
 }catch(error){throw retainObservationFailure(error,fixture,scope,stage,counts,failedTiming());}
}
export async function captureWrappedWalletEmptyV1(fixture){
 const s=ownedWrappedWalletFixedFixtureV1(fixture);assert.ok(!baselines.has(fixture),'WRAPPED_TERMINAL_BASELINE_ONCE');
 const current=await observe(fixture,'empty-baseline');
 for(let i=0;i<2;i++){
  const g=current.claims.gateways[i],p=current.pools[i].ledger.publicState;
  for(const key of ['wrapperSupply','heldUnissued','pendingRedemptions','pendingRefunds','reservedFees'])assert.equal(g[key],'0');
  assert.equal(g.intents.length,0);assert.equal(g.tickets.length,0);assert.equal(current.nativeFunds[i].nativePrincipalAvailable,'0');
  assert.equal(p.backedAmount,'0');assert.equal(p.actualAssetBalance,'0');assert.equal(p.liveReservations,0);
 }
 assert.equal(s.bitcoin.transfers.length,0);assert.equal(s.solana.transfers.length,0);assert.equal(s.graphNative.transactions.length,0);
 const receiverBalances=await Promise.all(s.runtime.accounts.map(account=>s.runtime.balance(account)));
 const baseline={runtime:s.runtime,system:s.system,bitcoin:s.bitcoin,solana:s.solana,graphNative:s.graphNative,
  current:structuredClone({...current,pools:current.pools.map(wrappedPoolObservationDataV1)}),receiverTransactionIndex:s.runtime.transactions.length,receiverBalances,
  graphSender:await s.graphNative.balance(s.graphNative.accounts[0]),graphRecipient:await s.graphNative.balance(s.graphNative.accounts[1])};
 baselines.set(fixture,baseline);
 return Object.freeze({originalFactories:true,principalAbsent:true,proofsAbsent:true,completeCurrentInventory:true,schedule:s.schedule});
}
/** Independent arithmetic over already authenticated observations, for focused
 * host negatives only. This pure function grants no observation/ownership brand. */
export function assertWrappedConservationNumbersV1(n){
 assert.equal(BigInt(n.source),BigInt(E.source));assert.equal(BigInt(n.payout),BigInt(E.payout));assert.equal(BigInt(n.change),BigInt(E.change));
 assert.equal(BigInt(n.source),BigInt(n.payout)+BigInt(n.change));
 assert.equal(BigInt(n.depositorBefore)-BigInt(n.depositorAfter),BigInt(E.source)+BigInt(n.ingressFee));
 assert.equal(BigInt(n.recipientAfter)-BigInt(n.recipientBefore),BigInt(E.source));
 assert.equal(BigInt(n.escrowBefore)-BigInt(n.escrowAfter),BigInt(n.payoutFee));
 assert.equal(BigInt(n.graphRecipientAfter)-BigInt(n.graphRecipientBefore),BigInt(E.graphNative));
 assert.equal(BigInt(n.graphSenderBefore)-BigInt(n.graphSenderAfter),BigInt(E.graphNative)+BigInt(n.graphGas));return true;
}
export async function assertWrappedWalletClosedV1(fixture){
 const s=ownedWrappedWalletFixedFixtureV1(fixture),b=baselines.get(fixture);assert.ok(b,'WRAPPED_TERMINAL_ORIGINAL_BASELINE');
 for(const k of ['runtime','system','bitcoin','solana','graphNative'])assert.equal(s[k],b[k],'WRAPPED_TERMINAL_ORIGINAL_FIXTURE_CHANGED');
 await s.controller.reconcileAll({});const status=await s.controller.status();
 assert.equal(status.requiresExternalEffectReconciliation,false);assert.equal(status.deposits.length,1);assert.equal(status.deposits[0].status,'ISSUED');
 assert.equal(status.tickets.length,1);assert.equal(status.tickets[0].status,'DISCHARGED');
 const current=await observe(fixture,'terminal-before-conservation'),btc=current.claims.gateways[0],sol=current.claims.gateways[1];
 assert.equal(btc.intents.length,0);assert.equal(btc.tickets.length,0);
 assert.equal(sol.intents.length,1);assert.equal(sol.intents[0].state,'2');assert.equal(sol.intents[0].amount,E.source);
 assert.equal(sol.tickets.length,1);assert.equal(sol.tickets[0].state,'4');assert.equal(sol.tickets[0].ticket.amount,E.source);assert.equal(sol.tickets[0].ticket.kind,'1');
 for(let i=0;i<2;i++){
  const g=current.claims.gateways[i],p=current.pools[i].ledger.publicState;
  for(const key of ['wrapperSupply','heldUnissued','pendingRedemptions','pendingRefunds','reservedFees'])assert.equal(g[key],'0');
  assert.equal(g.activePayout,'0'.repeat(64));assert.equal(g.reservedRefundTickets,'0');
  assert.equal(current.nativeFunds[i].nativePrincipalAvailable,'0');assert.equal(current.nativeFunds[i].unresolvedPreparedFees,'0');
  assert.equal(p.backedAmount,'0');assert.equal(p.actualAssetBalance,'0');assert.equal(p.liveReservations,0);
  assert.equal(await s.system.pools[i].assetCapability.balance(s.runtime.accounts[4],current.pools[i].header.number),0n);
 }
 assert.equal(s.bitcoin.transfers.length,0);assert.equal(s.solana.transfers.length,2);
 const {claimEconomicInventory}=await import('../wallet-platform/modules/native-claims/backing-audit.mjs');
 assert.deepEqual(claimEconomicInventory(current.inventories[0]),claimEconomicInventory(b.current.inventories[0]),'WRAPPED_TERMINAL_UNUSED_BTC_CHANGED');
 const {validateClaimSolanaBindingTransaction}=await import('../wallet-platform/modules/chain-adapters/owned-solana-nonce-binding.mjs');
 for(const [i,row]of s.solana.transfers.entries()){
  assert.equal(row.route,i===0?'deposit':'redeem');assert.equal(row.phase,'OBSERVED_FINALIZED');assert.equal(row.broadcastAttempts,1);
  const decoded=validateClaimSolanaBindingTransaction(row.nativeWire,row.intent);assert.equal(decoded.signatureHex,row.nativeId);assert.equal(decoded.transactionSHA256,row.transactionSHA256);
  const observed=await s.solana.observe(row.nativeId);assert.equal(observed.status,'observed');assert.equal(observed.nativeWire,row.nativeWire);
  assert.equal(observed.nativeId,row.nativeId);assert.equal(row.intent.lamports,E.source);
  const role=i===0?'depositor':'escrow';assert.equal(row.intent.sourcePublicKey,s.solana.roles[role].endpoint);
  assert.equal(row.intent.nonceAccountPublicKey,s.solana.nonceInfrastructureByAuthority[role].nonceAccountPublicKey);
  assert.notEqual(current.inventories[1].nonceInfrastructureByAuthority[role].nonceAccount.durableNonce,row.intent.durableNonce);
 }
 const originals=s.graphNative.transactions.filter(row=>row.signed);assert.equal(originals.length,1);assert.equal(s.graphNative.transactions.length,1);
 const graph=originals[0],gTx=await s.graphNative.transaction(graph.transactionHash);assert.equal(graph.phase,'mined');assert.equal(graph.receipt.status,'0x1');
 await s.graphNative.checkReceipt(graph.receipt);await s.graphNative.assertCanonical(graph.receipt);
 assert.equal(gTx.from,s.graphNative.accounts[0]);assert.equal(gTx.to,s.graphNative.accounts[1]);assert.equal(BigInt(gTx.value),BigInt(E.graphNative));
 assert.equal(BigInt((await s.graphNative.block(graph.receipt.blockNumber)).timestamp),BigInt(s.schedule.nativeInitialSecond)+1n);
 const {FLAT_TRANSACTION_METHODS}=await import('../wallet-platform/modules/paeg/transaction-codec.mjs');
 const {decodeFlatOwnerCalldata}=await import('../mobile-core/flat-owner-custody.mjs');
 const {decodeWalletPoolInputs}=await import('../../../omnichain-product/src/private-wallet-note-encoding.mjs');
 const {decodeNativeWalletAdmissionCalldata}=await import('./native-wallet-real-evidence-v1.mjs');
 const sent=s.runtime.transactions.slice(b.receiverTransactionIndex),gas=new Map(s.runtime.accounts.map(account=>[account,0n]));
 for(const row of sent){assert.equal(row.phase,'mined');assert.equal(row.receipt.status,'0x1');await s.runtime.checkReceipt(row.receipt);await s.runtime.assertCanonical(row.receipt);
  const tx=await s.runtime.transaction(row.transactionHash);assert.equal(tx.input,row.request.data);assert.equal(tx.to,row.request.to);assert.equal(BigInt(tx.value),0n);
  assert.ok(gas.has(tx.from));gas.set(tx.from,gas.get(tx.from)+BigInt(row.receipt.gasUsed)*BigInt(tx.gasPrice));}
 const calls=name=>sent.filter(row=>row.request.data?.slice(2,10)===FLAT_TRANSACTION_METHODS[name].selector);
 const withdrawals=calls('withdrawBalance');assert.equal(withdrawals.length,2);
 const amounts=withdrawals.map(row=>{assert.equal(row.request.to,s.system.pools[1].address);
  const d=decodeFlatOwnerCalldata(s.system.pools[1].artifact,row.request.data);assert.equal(d.kind,'withdrawal');
  const statement=decodeWalletPoolInputs('withdraw_balance',d.publicInputs);assert.equal(statement.recipient,s.runtime.accounts[4]);
  assert.ok(current.pools[1].ledger.nullifiers.includes(statement.nullifier));return statement.amount;}).sort();
 assert.deepEqual(amounts,[E.payout,E.change].sort());assert.equal(calls('reserveGenericGuarded').length,1);assert.equal(calls('fulfillGeneric').length,1);
 const admission=calls('admit');assert.equal(admission.length,1);assert.equal(admission[0].request.to,s.system.hub.address);
 const decoded=decodeNativeWalletAdmissionCalldata(admission[0].request.data);assert.equal(decoded.request.pool,s.system.pools[1].address);
 assert.equal(decoded.admission.domainCommitment,s.system.pools[1].domainCommitment.slice(2));
 assert.ok(current.pools[1].receiptLeaves.includes(decoded.admission.receiptLeaf));
 assert.equal(await s.system.verify('admission',Buffer.from(decoded.request.admission.proof,'hex'),decoded.request.admission.publicInputs.map(value=>'0x'+BigInt(value).toString(16).padStart(64,'0'))),true,'WRAPPED_TERMINAL_ORIGINAL_I84_REJECTED');
 for(let i=0;i<s.runtime.accounts.length;i++)assert.equal(b.receiverBalances[i]-await s.runtime.balance(s.runtime.accounts[i]),gas.get(s.runtime.accounts[i]));
 const fees=current.inventories[1].feeAudit.transfers;assert.equal(fees.length,2);assert.deepEqual(fees.map(row=>row.route),['deposit','redeem']);
 assertWrappedConservationNumbersV1({source:E.source,payout:E.payout,change:E.change,
  depositorBefore:amount(b.current.inventories[1],'depositor'),depositorAfter:amount(current.inventories[1],'depositor'),ingressFee:fees[0].actualFee,
  recipientBefore:amount(b.current.inventories[1],'recipient'),recipientAfter:amount(current.inventories[1],'recipient'),
  escrowBefore:amount(b.current.inventories[1],'escrow'),escrowAfter:amount(current.inventories[1],'escrow'),payoutFee:fees[1].actualFee,
  graphSenderBefore:b.graphSender,graphSenderAfter:await s.graphNative.balance(s.graphNative.accounts[0]),graphRecipientBefore:b.graphRecipient,
  graphRecipientAfter:await s.graphNative.balance(s.graphNative.accounts[1]),graphGas:BigInt(graph.receipt.gasUsed)*BigInt(gTx.gasPrice)});
 // Re-run the complete original audit after proof/receipt and balance reads.
 // No earlier 30-second window is carried across that potentially long work.
 const final=await observe(fixture,'terminal-final-audit');assert.deepEqual(final.claims,current.claims);assert.deepEqual(final.pools.map(wrappedPoolObservationDataV1),current.pools.map(wrappedPoolObservationDataV1));
 for(let i=0;i<2;i++)assert.deepEqual(claimEconomicInventory(final.inventories[i]),claimEconomicInventory(current.inventories[i]));
 return Object.freeze({profile:'ORIGINAL_WRAPPED_WALLET_ECONOMIC_CLOSURE_V1',economics:E,head:current.claims.head,
  finalLiabilities:['0','0'],finalNativePrincipal:['0','0'],nativeSendCounts:{bitcoin:0,solana:2,graph:1},
  originalProofTransactionsVerified:true,currentCompleteReciprocalAudit:true,
  canonicalTransactionHashes:sent.map(row=>row.transactionHash),solanaNativeIds:s.solana.transfers.map(row=>row.nativeId),graphNativeId:graph.transactionHash});
}

/** Sealed original baseline continuity only. An ordinary caller cannot supply
 * a baseline, observation, receipt or capability to the terminal oracle. */
export function captureWrappedWalletTerminalRecoveryV1(fixture) {
 assert.equal(arguments.length,1);const s=ownedWrappedWalletFixedFixtureV1(fixture),b=baselines.get(fixture);assert.ok(b,'WRAPPED_TERMINAL_ORIGINAL_BASELINE');
 for(const k of ['runtime','system','bitcoin','solana','graphNative'])assert.equal(s[k],b[k]);
 return {schema:'WRAPPED_ORIGINAL_TERMINAL_BASELINE_RECOVERY_V1',current:structuredClone(b.current),receiverTransactionIndex:b.receiverTransactionIndex,
  receiverBalances:b.receiverBalances.map(String),graphSender:String(b.graphSender),graphRecipient:String(b.graphRecipient),
  identity:{receiverGenesis:s.runtime.metadata.evmGenesis,receiverAccounts:[...s.runtime.accounts],bitcoinGenesis:s.bitcoin.genesis,solanaGenesis:s.solana.genesisHex,
    bitcoinRoles:structuredClone(s.bitcoin.roles),solanaRoles:structuredClone(s.solana.roles),graphGenesis:s.graphNative.metadata.evmGenesis,graphAccounts:[...s.graphNative.accounts],hub:s.system.hub.address,pools:s.system.pools.map(p=>p.address)}};
}
export async function reopenWrappedWalletTerminalRecoveryV1(token) {
 assert.equal(arguments.length,1);const {consumeWrappedFixtureRecoveryPartV1}=await import('./wrapped-wallet-fixed-fixture-v1.mjs');
 const {fixture,record:r}=consumeWrappedFixtureRecoveryPartV1(token,'terminal');const s=ownedWrappedWalletFixedFixtureV1(fixture);assert.ok(!baselines.has(fixture));
 const {exactRecord}=await import('../wallet-platform/modules/paeg/commitments.mjs');
 exactRecord(r,['schema','current','receiverTransactionIndex','receiverBalances','graphSender','graphRecipient','identity']);assert.equal(r.schema,'WRAPPED_ORIGINAL_TERMINAL_BASELINE_RECOVERY_V1');
 assert.deepEqual(r.identity,{receiverGenesis:s.runtime.metadata.evmGenesis,receiverAccounts:[...s.runtime.accounts],bitcoinGenesis:s.bitcoin.genesis,solanaGenesis:s.solana.genesisHex,
  bitcoinRoles:structuredClone(s.bitcoin.roles),solanaRoles:structuredClone(s.solana.roles),graphGenesis:s.graphNative.metadata.evmGenesis,graphAccounts:[...s.graphNative.accounts],hub:s.system.hub.address,pools:s.system.pools.map(p=>p.address)});
 assert.ok(Number.isSafeInteger(r.receiverTransactionIndex)&&r.receiverTransactionIndex>=0&&r.receiverTransactionIndex<=s.runtime.transactions.length);
 assert.equal(r.receiverBalances.length,s.runtime.accounts.length);for(const value of [...r.receiverBalances,r.graphSender,r.graphRecipient])assert.match(value,/^(0|[1-9][0-9]*)$/);
 const head=r.current.claims.head,header=await s.runtime.block('0x'+BigInt(head.number).toString(16));assert.equal(header.hash,'0x'+head.hash);await s.runtime.assertCanonical(header);
 baselines.set(fixture,{runtime:s.runtime,system:s.system,bitcoin:s.bitcoin,solana:s.solana,graphNative:s.graphNative,current:structuredClone(r.current),receiverTransactionIndex:r.receiverTransactionIndex,
  receiverBalances:r.receiverBalances.map(BigInt),graphSender:BigInt(r.graphSender),graphRecipient:BigInt(r.graphRecipient)});
 return {originalBaselineRestored:true,newBaselineCaptured:false};
}
