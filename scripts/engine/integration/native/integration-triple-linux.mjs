import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startLocalServer } from '../../../../packages/backend/src/api/private-runtime-server.mjs';
import { RESERVE, CERTIFY, CLAIM, toBTC } from '../../../../packages/engine/src/native/native-triple.mjs';
import { commitment } from '../../../../packages/engine/src/native/native-authority.mjs';
import { observeBitcoinDelivery } from '../../../../packages/engine/src/native/native-bitcoin.mjs';
import { sleep, projectRoot } from '../../../../packages/engine/src/chains/shared/runtime-harness.mjs';
import { sha, hex, deployOwnedNaiveTripleAuthority } from '../../../../packages/engine/src/chains/shared/native-runtime.mjs';

const app = await startLocalServer({ port:0 });
const evidence = { schemaVersion:1, recordedAt:new Date().toISOString(), classification:'ONE_CLIENT_REAL_LOCAL_DEPENDENT_EVM_SOLANA_BITCOIN_TRANSPARENT_TRUSTED_OBSERVER', phase:'starting', nativeTripleExecuted:false, fullAcceptance:false, privateSettlement:false, checks:[], operations:[], negativeControls:[], guarantees:{ledgerAtomicity:'Each native ledger independently; no cross-ledger rollback',protocolAtomicity:'No global commit/abort; one terminal EVM payment/refund and irreversible native effects may remain',economicAtomicity:'Conditional user input payment/refund under honest observer, finality, chain availability and gas assumptions; no general solver guarantee'}, limitations:['Observer and local chain truth/finality are trusted','Public graph/terms, no global ZK fulfillment proof','No remote adversarial executors or server-restart recovery','Fictitious local funds; no public network'] };
const check = (name, value) => { assert.ok(value,name); evidence.checks.push(name); };
const persist=()=>writeFile(join(projectRoot,'evidence/m14-native-triple.json'),JSON.stringify(evidence,null,2)+'\n');
try {
 const page=await(await fetch(app.origin)).text(),token=page.match(/name="local-token" content="([0-9a-f]+)"/)[1];
 const headers={'X-Local-Token':token,Origin:app.origin,'Content-Type':'application/json'};
 const snapshot=async()=> (await fetch(app.origin+'/api/triple',{headers})).json();
 const action=async(name,{quarantined=false}={})=>{
  const response=await fetch(app.origin+'/api/triple/action',{method:'POST',headers,body:JSON.stringify({action:name})});assert.equal(response.status,202,await response.clone().text());
  for(let i=0;i<2400;i++){const s=await snapshot();if(!s.busy){if(quarantined)assert.equal(s.status,'QUARANTINED');else if(s.status==='QUARANTINED')throw app.triple.failureForReview??new Error(s.lastError);console.log(JSON.stringify({action:name,status:s.status}));return s;}await sleep(100);}throw new Error('TRIPLE_CLIENT_TIMEOUT');
 };
 check('three-chain API requires private local session token',(await fetch(app.origin+'/api/triple')).status===403);
 check('same browser page provides triple operation and explicit privacy boundary',page.includes('id="triple"')&&page.includes('prueba global'));
 await action('prepare'); const r=app.triple.ownedRuntimeForReview;
 const reserve=async order=>{
  const id=await r.call('deriveId(address,bytes32)',[order.owner,order.salt]);
  await r.send('owner funds extra exact replay-control order',{from:order.owner,to:r.address,value:hex(order.amountWei),data:r.data(RESERVE,[order.salt,commitment(order),order.solver,order.solanaSender,order.solanaRecipient,order.lamports,order.scriptHash,order.numerator,order.denominator,order.minimumConfirmations,order.executeBy,order.claimBy])});return id;
 };
 const sigParts=f=>{const x=f.signatureHex.replace(/^0x/,'');return ['0x'+x.slice(0,64),'0x'+x.slice(64)];};
 const certifyArgs=(id,o,f,time)=>[id,...sigParts(f),0,f.slot,1,1,o.solanaSender,o.solanaRecipient,f.lamports,time];
 const claimArgs=(o,delivery,parent=o.solana.parentDigest)=>[o.reference.id,parent,'0x'+delivery.txid,delivery.vout,o.order.scriptHash,delivery.amountSatoshi,delivery.confirmations,delivery.observedAtEvmTime];
 const first=await action('lock'); const order=first.operation.order,id=first.operation.reference.id;
 check('actual EVM input retained before Solana delivery',first.operation.reservation.state==='OPEN'&&first.balances.escrowWei===order.amountWei);
 check('Bitcoin command unavailable before certified actual Solana result',(await fetch(app.origin+'/api/triple/action',{method:'POST',headers,body:'{"action":"bitcoin"}'})).status===400);
 await r.send('premature refund rejected',{from:order.owner,to:r.address,data:r.data('refund(bytes32)',[id])},'0x0','REFUND_EARLY');
 const nativeSend=r.send;
 r.send=async(...input)=>{const receipt=await nativeSend(...input);if(input[0]==='observer binds finalized native Solana predecessor'){r.send=nativeSend;throw new Error('INJECTED_LOST_SOLANA_CERTIFICATION_RESPONSE');}return receipt;};
 await action('solana',{quarantined:true});r.send=nativeSend;
 const certificationReceipts=r.receipts.length,transferCount=r.solana.transfers.length;
 const solState=await action('reconcile'),sol=solState.operation.solana;
 check('lost native SOL certification response recovers exact on-chain predecessor without another transfer',solState.status==='SOL_CONFIRMED'&&r.receipts.length===certificationReceipts&&r.solana.transfers.length===transferCount);
 check('native Solana receipt finalized with exact amount and parties',sol.finalized&&sol.success&&sol.lamports===order.lamports&&sol.solverHex===order.solanaSender&&sol.recipientHex===order.solanaRecipient);
 check('Solana predecessor is retained by EVM authority',sol.parentDigest===solState.operation.reservation.solanaParent&&sol.parentDigest!=='0x'+'00'.repeat(32));
 // Execute a genuine wrong-amount native Bitcoin output for the matched naive
 // negative control. Both runtimes succeeded, but the semantic relation fails.
 const wrongTxid=await r.btc('sendtoaddress',[solState.operation.recipientAddress,'0.00090000'],'m9-solver'); await r.btc('generatetoaddress',[6,r.miningAddress]);
 const wrongOp={...solState.operation,order:{...order,sats:'90000'},bitcoin:{txid:wrongTxid}};
 const wrong=await observeBitcoinDelivery(r,wrongOp);wrong.observedAtEvmTime=await r.time();
 const naive=await deployOwnedNaiveTripleAuthority(r,order.amountWei),beforeNaive=await r.balance(order.solver);
 await r.send('naive control pays for two successful but semantically incompatible native outputs',{from:r.accounts[2],to:naive.address,data:naive.data('claim(bytes32,bytes32,bytes32,bool,bool)',[...sigParts(sol),'0x'+wrong.txid,1,1])});
 check('naive native control incorrectly pays the exact EVM reward for wrong BTC arithmetic',(await r.balance(order.solver))-beforeNaive===BigInt(order.amountWei));
 await r.send('dependent authority rejects same actual wrong-amount native Bitcoin output',{from:r.accounts[2],to:r.address,data:r.data(CLAIM,[id,sol.parentDigest,'0x'+wrong.txid,wrong.vout,order.scriptHash,'90000',wrong.confirmations,wrong.observedAtEvmTime])},'0x0','BTC_DELIVERY');
 evidence.negativeControls.push({kind:'ACTUAL_NATIVE_NAIVE_SEMANTIC_ATTACK',solana:sol,bitcoin:wrong,naiveAuthority:naive.address,naivePaid:true,dependentAuthorityRejected:'BTC_DELIVERY',scope:'Honest observer reports actual incompatible outputs; malicious observer remains outside guarantee'});
 const nativeBtc=r.btc;r.btc=async(method,...rest)=>{const result=await nativeBtc(method,...rest);if(method==='sendrawtransaction'){r.btc=nativeBtc;throw new Error('INJECTED_LOST_BITCOIN_BROADCAST_RESPONSE');}return result;};
 await action('bitcoin',{quarantined:true});r.btc=nativeBtc;const mempoolBefore=await r.btc('getrawmempool');await action('reconcile');assert.deepEqual(await r.btc('getrawmempool'),mempoolBefore);
 evidence.checks.push('lost dependent BTC broadcast response reconciles exact existing outpoint without resend');
 const confirmed=await action('confirm'),o=confirmed.operation,d=o.bitcoin;
 check('Bitcoin amount computed from actual finalized Solana result',BigInt(d.amountSatoshi)===BigInt(sol.lamports)*BigInt(order.numerator)/BigInt(order.denominator)&&d.confirmations>=6);
 const args=claimArgs(o,d);
 await r.send('wrong Solana parent cannot pay',{from:r.accounts[2],to:r.address,data:r.data(CLAIM,[id,'0x'+'af'.repeat(32),...args.slice(2)])},'0x0','SOL_PARENT');
 await r.send('foreign caller cannot certify fulfillment',{from:r.accounts[3],to:r.address,data:r.data(CLAIM,args)},'0x0','OBSERVER');
 const tooFew=[...args];tooFew[6]=5;await r.send('five confirmations cannot authorize payment',{from:r.accounts[2],to:r.address,data:r.data(CLAIM,tooFew)},'0x0','BTC_CONFIRMATIONS');
 // An HTTP/native response can be lost after the authority paid. Reconcile must
 // read the terminal decision without repeating any of the three native legs.
 const send=r.send;r.send=async(...input)=>{const result=await send(...input);if(input[0].startsWith('observer pays only'))throw new Error('INJECTED_LOST_PAYMENT_RESPONSE');return result;};
 await action('settle',{quarantined:true});r.send=send; const receiptsBefore=r.receipts.length,solTransfersBefore=r.solana.transfers.length;
 const paid=await action('reconcile');check('lost payment response reconciles authoritative payout without new transactions',paid.status==='PAID'&&paid.operation.solverRewardWei===order.amountWei&&r.receipts.length===receiptsBefore&&r.solana.transfers.length===solTransfersBefore);
 evidence.operations.push(paid.operation); evidence.nativeTripleExecuted=true;
 await r.send('same reservation cannot pay twice',{from:r.accounts[2],to:r.address,data:r.data(CLAIM,args)},'0x0','STATE');
 await r.send('paid input cannot also refund',{from:order.owner,to:r.address,data:r.data('refund(bytes32)',[id])},'0x0','STATE_OWNER');
 const now=await r.time(),replayOrder={...order,salt:'0x'+randomBytes(32).toString('hex'),session:randomBytes(32).toString('hex'),executeBy:now+600,claimBy:now+1200};
 const replayId=await reserve(replayOrder);
 await r.send('same Solana effect cannot authorize fresh order/session',{from:r.accounts[2],to:r.address,data:r.data(CERTIFY,certifyArgs(replayId,replayOrder,sol,await r.time()))},'0x0','SOL_EFFECT_CONSUMED');
 const extra=await r.solana.transfer(order.lamports),extraFact=await r.solana.observe(extra.signature,{expectedLamports:order.lamports});
 await r.send('certify distinct actual Solana delivery for BTC replay test',{from:r.accounts[2],to:r.address,data:r.data(CERTIFY,certifyArgs(replayId,replayOrder,extraFact,await r.time()))});
 const replayAuthority=await r.reservation(replayId);
 await r.send('same Bitcoin output cannot pay another exact funded order',{from:r.accounts[2],to:r.address,data:r.data(CLAIM,[replayId,replayAuthority.solanaParent,'0x'+d.txid,d.vout,order.scriptHash,order.sats,d.confirmations,await r.time()])},'0x0','BTC_EFFECT_CONSUMED');
 evidence.checks.push('native SOL signature and native BTC outpoint are each single-use across funded order/session identities');
 await action('lock');await action('expire'); const emptyRefund=await action('refund');check('actual EVM timeout recovers unused input without native delivery',emptyRefund.status==='REFUNDED'&&!emptyRefund.operation.solana&&!emptyRefund.operation.bitcoin);evidence.operations.push(emptyRefund.operation);
 await r.evm('evm_setNextBlockTimestamp',[Math.max(await r.time(),replayOrder.claimBy)+1]);await r.evm('evm_mine');await r.send('refund unpaid replay-control reserve',{from:order.owner,to:r.address,data:r.data('refund(bytes32)',[replayId])});
 await action('lock');const partialSol=await action('solana');await action('expire');
 const solRead=r.solana.observe;r.solana.observe=async()=>{throw new Error('INJECTED_SOLANA_UNAVAILABLE');}; const refund=await action('refund');r.solana.observe=solRead;
 check('missing BTC leg times out and actual EVM refunds while SOL observation unavailable',refund.status==='REFUNDED'&&!refund.operation.bitcoin&&refund.operation.solverRewardWei==='0');
 const survivingSol=await r.solana.observe(partialSol.operation.solana.signature,{expectedLamports:order.lamports});check('actual finalized Solana effect survives EVM refund',survivingSol.finalized&&survivingSol.lamports===order.lamports);evidence.operations.push({...refund.operation,retainedNativeSolanaAfterRefund:survivingSol});
 // Stop after the exact signature was journaled but before the one broadcast.
 await action('lock'); const realTransfer=r.solana.transfer;
 r.solana.transfer=(amount,options)=>realTransfer(amount,{onSigned:async record=>{await options.onSigned(record);throw new Error('INJECTED_STOP_BEFORE_SOLANA_BROADCAST');}});
 await action('solana',{quarantined:true});r.solana.transfer=realTransfer;
 const realObserve=r.solana.observe,realBalance=r.solana.balance;
 r.solana.observe=async()=>{throw new Error('INJECTED_PERSISTENT_SOLANA_OUTAGE');};r.solana.balance=async()=>{throw new Error('INJECTED_PERSISTENT_SOLANA_OUTAGE');};
 await action('reconcile',{quarantined:true});await action('expire');const strandedRecovery=await action('refund');
 r.solana.observe=realObserve;r.solana.balance=realBalance;
 check('quarantined signed-but-not-broadcast exposure can expire and refund without Solana availability',strandedRecovery.status==='REFUNDED'&&strandedRecovery.operation.solana.broadcastAttempts===0&&strandedRecovery.operation.solana.signature&&strandedRecovery.operation.ownerRefundWei===order.amountWei);
 evidence.operations.push(strandedRecovery.operation);
 const reloaded=await(await fetch(app.origin)).text();check('same-client reload retains operation identity',reloaded.includes(token)&&(await snapshot()).operation.reference.id===strandedRecovery.operation.reference.id);
 evidence.runtime=r.metadata;evidence.transactions=structuredClone(r.receipts);evidence.solanaTransfers=r.solana.transfers;evidence.finalSnapshot=await snapshot();evidence.sourceSHA256={};
 for(const p of ['src/native-triple.mjs','src/server.mjs','src/chains/native-runtime.mjs','src/chains/solana-runtime.mjs','contracts/LocalTripleDeliveryEscrow.sol','contracts/test/NaiveTripleObserverEscrow.sol','client/triple.mjs','scripts/integration-triple-linux.mjs'])evidence.sourceSHA256[p]=sha(await readFile(join(projectRoot,p)));
 evidence.phase='completed';
}catch(e){evidence.phase='failed';evidence.failure={name:e.name,message:e.message,stack:e.stack};process.exitCode=1;console.error(e.stack);}
finally{await app.close();evidence.ownedRuntimesStopped=true;evidence.disposableNativeKeysRemoved=true;await persist();}
console.log(JSON.stringify({phase:evidence.phase,nativeTripleExecuted:evidence.nativeTripleExecuted,fullAcceptance:false,checks:evidence.checks.length,evidence:'evidence/m14-native-triple.json'}));
