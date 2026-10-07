import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createOwnedNativeRuntime, deployOwnedTripleAuthority, sha, hex } from '../src/chains/native-runtime.mjs';
import { RESERVE, CERTIFY, CLAIM, decodeReservation } from '../src/native-triple.mjs';
import { projectRoot } from '../src/chains/runtime-harness.mjs';
const report={classification:'NATIVE_EVM_CONTRACT_ONLY_SYNTHETIC_SOLANA_BITCOIN_ATTESTATIONS_NOT_TRIPLE',phase:'starting',nativeSolanaExecuted:false,nativeBitcoinDeliveryExecuted:false,fullAcceptance:false,checks:[]};
let r;
try{
 r=await createOwnedNativeRuntime();const a=await deployOwnedTripleAuthority(r,[r.accounts[2],r.metadata.evmGenesis,'0x'+'12'.repeat(32),'0x'+r.metadata.bitcoinGenesis]);
 const reserve=async({sender='0x'+'34'.repeat(32),recipient='0x'+'56'.repeat(32),script='0x'+'78'.repeat(32),numerator='1',denominator='30',min=6}={})=>{
  const now=await r.time(),salt='0x'+randomBytes(32).toString('hex'),id=await a.call('deriveId(address,bytes32)',[r.accounts[0],salt]);
  await r.send('reserve exact synthetic statement contract component',{from:r.accounts[0],to:a.address,value:hex('1000000000000000'),data:a.data(RESERVE,[salt,'0x'+'11'.repeat(32),r.accounts[1],sender,recipient,'3000000',script,numerator,denominator,min,now+600,now+1200])});
  return {id,sender,recipient,script,executeBy:now+600,claimBy:now+1200};
 };
 const cert=(o,extra={})=>[o.id,extra.sigA??'0x'+'aa'.repeat(32),extra.sigB??'0x'+'bb'.repeat(32),extra.index??0,extra.slot??20,extra.success??1,extra.finalized??1,extra.sender??o.sender,extra.recipient??o.recipient,extra.lamports??'3000000',extra.observedAt];
 const certify=async(o,extra={},reason)=>r.send('synthetic Solana statement contract check',{from:r.accounts[2],to:a.address,data:a.data(CERTIFY,cert(o,{observedAt:await r.time(),...extra}))},reason?'0x0':'0x1',reason);
 const o=await reserve();
 const decoded=decodeReservation(await a.call('reservations(bytes32)',[o.id]));assert.equal(decoded.lamports,'3000000');assert.equal(decoded.denominator,'30');
 await certify(o,{success:0},'SOL_RESULT');await certify(o,{finalized:0},'SOL_RESULT');await certify(o,{index:1},'SOL_IDENTITY');await certify(o,{sender:'0x'+'99'.repeat(32)},'SOL_PARTIES');await certify(o,{recipient:'0x'+'99'.repeat(32)},'SOL_PARTIES');await certify(o,{lamports:'3000001'},'SOL_AMOUNT');await certify(o,{observedAt:o.executeBy+1},'OBSERVED_TIME');
 await certify(o);await certify(o,{},'SOL_ALREADY_CERTIFIED');const parent=await a.call('parentDigest(bytes32)',[o.id]);
 const claim=async({id=o.id,p=parent,txid='0x'+'cc'.repeat(32),sats='100000',confirmations=6,time,reason}={})=>r.send('synthetic BTC statement contract check',{from:r.accounts[2],to:a.address,data:a.data(CLAIM,[id,p,txid,0,o.script,sats,confirmations,time??await r.time()])},reason?'0x0':'0x1',reason);
 await claim({p:'0x'+'00'.repeat(32),reason:'SOL_PARENT'});await claim({sats:'99999',reason:'BTC_DELIVERY'});await claim({confirmations:5,reason:'BTC_CONFIRMATIONS'});
 const before=await r.balance(r.accounts[1]);await claim();assert.equal((await r.balance(r.accounts[1]))-before,1000000000000000n);await claim({reason:'STATE'});
 const other=await reserve();await certify(other,{},'SOL_EFFECT_CONSUMED');await certify(other,{sigA:'0x'+'dd'.repeat(32)});const parent2=await a.call('parentDigest(bytes32)',[other.id]);await claim({id:other.id,p:parent2,reason:'BTC_EFFECT_CONSUMED'});
 await r.evm('evm_setNextBlockTimestamp',[other.claimBy]);
 const expiredClaim=await claim({id:other.id,p:parent2,txid:'0x'+'ee'.repeat(32),time:other.executeBy,reason:'CLAIM_EXPIRED'});
 assert.equal(Number(BigInt((await r.evm('eth_getBlockByHash',[expiredClaim.blockHash,false])).timestamp)),other.claimBy);
 await r.send('refund component after exact-deadline claim rejection',{from:r.accounts[0],to:a.address,data:a.data('refund(bytes32)',[other.id])});
 const boundary=await reserve();await r.evm('evm_setNextBlockTimestamp',[boundary.claimBy]);
 const exactRefund=await r.send('refund separate open component exactly at deadline',{from:r.accounts[0],to:a.address,data:a.data('refund(bytes32)',[boundary.id])});
 assert.equal(Number(BigInt((await r.evm('eth_getBlockByHash',[exactRefund.blockHash,false])).timestamp)),boundary.claimBy);
 report.exactDeadlineReceipts={claimRejectedAt:other.claimBy,claimBlock:expiredClaim.blockHash,refundAt:boundary.claimBy,refundBlock:exactRefund.blockHash};
 const third=await reserve();await certify(third,{sigA:'0x'+'dd'.repeat(32)},'SOL_EFFECT_CONSUMED');
 report.checks=['Exact ABI terms retained by actual EVM contract','Failed/unfinalized/wrong-topology/wrong-party/wrong-amount/out-of-window synthetic SOL statements rejected','Stored exact parent and arithmetic required for payment','Underconfirmed synthetic BTC rejected','Exact actual EVM reward paid once','SOL identity and BTC outpoint rejected across reservations','SOL consumption retained after refund at exact deadline'];
 report.runtime=r.metadata;report.transactions=r.receipts;report.contract={address:a.address,sourceSHA256:a.sourceSHA256};report.phase='completed';
}catch(e){report.phase='failed';report.failure={message:e.message,stack:e.stack};process.exitCode=1;console.error(e.stack);}
finally{if(r){await r.close();report.ownedProcessesStopped=true;}await writeFile(join(projectRoot,'evidence/m14-triple-authority-component.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({phase:report.phase,nativeSolanaExecuted:false,checks:report.checks.length}));
