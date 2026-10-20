/** The phone exposed a valid DeFi deposit after retired withdrawals at the
 * same account nonce. Exercise the actual ABI/history rules, with no signer,
 * storage migration, network or financial acceptance implied. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {encodeWalletPoolInputs} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {assertNoteRetryNonceHistoryV32,sourceNoteRetryIdV32,EXPIRED_WITHDRAWAL_V32} from '../../../src/chains/public-testnet/sepolia-note-retry-data-v32.mjs';
import {depositSourceBaseIdV18,EXPIRED_DEPOSIT_V18} from '../../../src/chains/public-testnet/sepolia-deposit-retry-data-v18.mjs';
const h=n=>n.toString(16).padStart(64,'0'),a=n=>'0x'+n.toString(16).padStart(40,'0'),w=n=>BigInt(n).toString(16).padStart(64,'0');
function command(mode,epoch){
 const deposit=mode==='deposit',inputs=encodeWalletPoolInputs(deposit?'deposit_balance':'withdraw_balance',{scope:'0x'+h(deposit?4:1),policy:'0x'+h(deposit?5:2),epoch:String(epoch),amount:'10',...(deposit?{output:'0x'+h(6)}:{root:'0x'+h(8),nullifier:'0x'+h(3),recipient:a(7)})});
 const selector=publicKeccak256(Buffer.from((deposit?'depositBalance':'withdraw')+'(bytes,bytes32[])')).subarray(0,4).toString('hex');
 return{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4',identity:h(deposit?21:12),jobId:deposit?'new-defi-deposit-job':'original-withdrawal-job',action:deposit?'FUND_D26':'WITHDRAW_W39',from:a(1),to:a(deposit?20:10),value:deposit?'10':'0',data:'0x'+selector+w(64)+w(128)+w(1)+'01'.padEnd(64,'0')+w(inputs.length)+inputs.map(w).join('')};
}
function row(mode,epoch,phase,retry=false){const c=command(mode,epoch);return{profile:mode==='deposit'?'ORIGINAL_PAGED_SEPOLIA_DEFI_SOURCE_ROW_V8':'ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4',id:retry?sourceNoteRetryIdV32(c):depositSourceBaseIdV18(c),command:c,transaction:{nonce:'89'},phase,signed:{nativeId:'0x'+h(epoch)},receipt:null};}
const history=()=>[row('withdraw',1,EXPIRED_WITHDRAWAL_V32),row('withdraw',2,EXPIRED_WITHDRAWAL_V32,true),row('withdraw',3,EXPIRED_WITHDRAWAL_V32,true)];
test('retired withdrawals can precede a new authorized DeFi deposit without rewriting history',()=>{
 const before=history(),saved=structuredClone(before),deposit=row('deposit',4,'UNKNOWN');
 assertNoteRetryNonceHistoryV32([...before,deposit]);assert.deepEqual(before,saved);
 // A later retry of the same original withdrawal is compared with its own
 // retained predecessors, across the independently retired deposit.
 const retired={...deposit,phase:EXPIRED_DEPOSIT_V18},withdrawal=row('withdraw',5,'UNKNOWN',true);
 assertNoteRetryNonceHistoryV32([...before,retired,withdrawal]);
 assertNoteRetryNonceHistoryV32([...before,retired,row('deposit',5,'UNKNOWN',true)]);
});
test('nonce reuse rejects active predecessors, substituted jobs and unrelated new owners',()=>{
 const before=history(),deposit=row('deposit',4,'UNKNOWN');
 assert.throws(()=>assertNoteRetryNonceHistoryV32([...before.slice(0,-1),{...before.at(-1),phase:'UNKNOWN'},deposit]),/DUPLICATE_NONCE/);
 for(const change of [{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4'},{command:{...deposit.command,identity:before[0].command.identity}},{command:{...deposit.command,jobId:before[0].command.jobId}},{command:{...deposit.command,to:before[0].command.to}},{command:{...deposit.command,from:a(99)}}])assert.throws(()=>assertNoteRetryNonceHistoryV32([...before,{...deposit,...change}]),/NONCE_OWNER|SUBSTITUTION/);
 assert.throws(()=>assertNoteRetryNonceHistoryV32([...before,row('deposit',3,'UNKNOWN')]),/NONCE_EPOCH/);
 const withdrawal=row('withdraw',5,'UNKNOWN',true);
 assert.throws(()=>assertNoteRetryNonceHistoryV32([...before,{...withdrawal,command:{...withdrawal.command,jobId:'substituted-withdrawal-job'}}]),/ORIGINAL_EXPIRED|NONCE_OWNER/);
 const changed=command('withdraw',5);changed.to=a(99);
 assert.throws(()=>assertNoteRetryNonceHistoryV32([...before,{...withdrawal,command:changed}]),/SUBSTITUTION/);
});
