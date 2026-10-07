import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startLocalServer } from '../src/server.mjs';
import { sleep, projectRoot } from '../src/chains/runtime-harness.mjs';
import { sha } from '../src/chains/native-runtime.mjs';

const app=await startLocalServer({port:0});
const report={classification:'ACTUAL_EVM_BITCOIN_TRANSACTIONS_WITH_INJECTED_RESPONSE_LOSS_NOT_PRIVATE_OR_TRIPLE',phase:'starting',checks:[],injectedFailures:[],operations:[]};
try{
  const page=await(await fetch(app.origin)).text(),token=page.match(/name="local-token" content="([0-9a-f]+)"/)[1];
  const headers={'X-Local-Token':token,Origin:app.origin,'Content-Type':'application/json'};
  const snapshot=async()=> (await fetch(app.origin+'/api/native',{headers})).json();
  const action=async(name,expected)=>{
    const response=await fetch(app.origin+'/api/native/action',{method:'POST',headers,body:JSON.stringify({action:name})});assert.equal(response.status,202);
    for(let j=0;j<600;j++){const s=await snapshot();if(!s.busy){assert.equal(s.status,expected,`${name}: ${s.lastError}`);return s;}await sleep(100);}throw new Error('JOB_TIMEOUT');
  };
  await action('prepare','READY');const r=app.native.ownedRuntimeForReview;
  const failOnce=(field,predicate,after)=>{
    const original=r[field];r[field]=async(...args)=>{if(!predicate(...args))return original(...args);r[field]=original;let result;if(after)result=await original(...args);report.injectedFailures.push({field,when:after?'after actual operation completed':'before RPC response',method:args[0]});throw new Error('INJECTED_RESPONSE_LOSS');};
  };
  await action('lock','LOCKED');
  failOnce('btc',method=>method==='sendrawtransaction',true);const lostSend=await action('send','QUARANTINED');
  const txid=lostSend.operation.bitcoin.txid;assert.equal((await r.btc('getrawtransaction',[txid,true])).txid,txid);
  const countBefore=await r.btc('getrawmempool');await action('reconcile','BTC_PENDING');assert.deepEqual(await r.btc('getrawmempool'),countBefore);
  report.checks.push('lost send response reconciles existing signed transaction without rebroadcast');
  failOnce('btc',method=>method==='generatetoaddress',true);await action('confirm','QUARANTINED');const confirmed=await action('reconcile','BTC_CONFIRMED');
  assert.ok(confirmed.operation.bitcoin.confirmations>=6);report.checks.push('lost mining response reconciles actual historical confirmed delivery');
  const d=confirmed.operation.bitcoin,o=confirmed.operation.order;
  const raw=await r.btc('createrawtransaction',[[{txid:d.txid,vout:d.vout}],{[r.miningAddress]:'0.00099000'},0,false]);
  const signed=await r.btc('signrawtransactionwithwallet',[raw],'m9-recipient');assert.equal(signed.complete,true);
  const spendId=await r.btc('sendrawtransaction',[signed.hex]);await r.btc('generatetoaddress',[1,r.miningAddress]);
  assert.equal(await r.btc('gettxout',[d.txid,d.vout,true]),null);
  report.recipientSpend={txid:spendId,rawTransaction:signed.hex,spentDelivery:{txid:d.txid,vout:d.vout},originalOutputNowAbsent:true};
  await action('reconcile','BTC_CONFIRMED');report.checks.push('recipient spends confirmed output before claim without revoking historical delivery');
  failOnce('send',label=>label.includes('pays solver'),true);const lostClaim=await action('settle','QUARANTINED');
  assert.equal((await r.reservation(lostClaim.operation.reference.id)).state,'PAID');
  const evmCount=r.receipts.length,solverBalance=await r.balance(o.solver),paid=await action('reconcile','PAID');
  assert.equal(r.receipts.length,evmCount);assert.equal(await r.balance(o.solver),solverBalance);assert.equal(paid.operation.solverRewardWei,o.amountWei);
  assert.equal(paid.operation.bitcoin.txid,txid);report.operations.push(paid.operation);
  report.checks.push('actual mined payout with lost reply reconciles terminal state without another payment');
  assert.equal((await fetch(app.origin+'/api/native/action',{method:'POST',headers,body:'{"action":"settle"}'})).status,400);
  await r.send('spent historical output still cannot be paid twice',{from:r.accounts[2],to:r.address,data:r.data('claim(bytes32,bytes32,uint32,bytes32,uint64,uint32,uint64)',[paid.operation.reference.id,'0x'+d.txid,d.vout,o.scriptHash,o.sats,7,d.observedAtEvmTime])},'0x0','STATE_PROFILE');
  report.checks.push('client and native contract reject duplicate payment after recipient spend');
  failOnce('btc',method=>method==='getbalance',false);const transient=await action('lock','QUARANTINED');
  assert.equal((await r.reservation(transient.operation.reference.id)).state,'OPEN');await action('reconcile','LOCKED');
  report.checks.push('transient auxiliary balance RPC failure after actual funding is recoverable');
  await r.evm('evm_setNextBlockTimestamp',[transient.operation.order.claimBy+1]);await r.evm('evm_mine');
  const originalBtc=r.btc;r.btc=async()=>{throw new Error('INJECTED_BITCOIN_UNAVAILABLE');};
  const expired=await action('reconcile','EXPIRED');assert.equal(expired.reconciliation.auxiliaryBalancesAvailable,false);
  await action('refund','QUARANTINED');assert.equal((await r.reservation(expired.operation.reference.id)).state,'REFUNDED');
  const refundCount=r.receipts.length,refunded=await action('reconcile','REFUNDED');assert.equal(r.receipts.length,refundCount);
  assert.equal(refunded.operation.ownerRefundWei,o.amountWei);assert.equal(refunded.balances.stale,true);report.operations.push(refunded.operation);r.btc=originalBtc;
  report.checks.push('unavailable Bitcoin observation does not block authority-derived expiry/refund or hide mined refund');
  await action('lock','LOCKED');await action('send','BTC_PENDING');const beforeReorg=await action('confirm','BTC_CONFIRMED');
  await r.btc('invalidateblock',[beforeReorg.operation.bitcoin.blockhash]);
  await action('settle','QUARANTINED');const afterReorg=await action('reconcile','BTC_PENDING');
  assert.equal(afterReorg.operation.reservation.state,'OPEN');assert.equal(afterReorg.operation.bitcoin.confirmations,0);
  assert.equal(afterReorg.operation.bitcoin.observedAtEvmTime,undefined); assert.equal(afterReorg.operation.bitcoin.certifiedBlockhash,undefined);
  await action('expire','EXPIRED');const final=await action('refund','REFUNDED');report.operations.push(final.operation);
  report.checks.push('actual block invalidation removes delivery finality and prevents payout while allowing expiry refund');
  report.runtime=r.metadata;report.nativeTransactions=structuredClone(r.receipts);report.sourceSHA256={};
  for(const p of ['src/native-local.mjs','src/native-authority.mjs','src/chains/native-runtime.mjs','scripts/integration-native-recovery.mjs'])report.sourceSHA256[p]=sha(await readFile(join(projectRoot,p)));
  report.phase='completed';
}catch(e){report.phase='failed';report.failure=e.message;process.exitCode=1;console.error(e.message);}
finally{await app.close();report.ownRuntimesStopped=true;await writeFile(join(projectRoot,'evidence/m10-native-recovery.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({phase:report.phase,checks:report.checks.length,injectedFailures:report.injectedFailures.length,operations:report.operations.length}));
