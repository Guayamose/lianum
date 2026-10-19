/** Mechanical DATA for expired wallet-note attempts. No authority, keys or RPC.
 * A new proof may change its epoch/root, never its note, amount or recipient. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {decodeWalletPoolInputs} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {EXPIRED_DEPOSIT_V18,readDepositSourceStatementV18,depositSourceBaseIdV18,depositSourceRetryIdV18,assertSameDepositRetryV18,assertDepositRetryNonceHistoryV18} from './sepolia-deposit-retry-data-v18.mjs';
export const EXPIRED_WITHDRAWAL_V32='EXPIRED_WITHDRAWAL_V32';
const selector=publicKeccak256(Buffer.from('withdraw(bytes,bytes32[])')).subarray(0,4).toString('hex');
export function readWithdrawalSourceStatementV32(c){
 assert.equal(c.profile,'ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4');assert.equal(c.action,'WITHDRAW_W39');assert.equal(c.value,'0');
 assert.ok(typeof c.data==='string'&&c.data.length<8388608&&/^0x(?:[0-9a-f]{2})+$/.test(c.data),'SEPOLIA_WITHDRAWAL_RETRY_ABI');
 assert.equal(c.data.slice(2,10),selector,'SEPOLIA_WITHDRAWAL_RETRY_METHOD');
 const data=c.data.slice(10),at=n=>{assert.ok(Number.isSafeInteger(n)&&n>=0&&n+64<=data.length,'SEPOLIA_WITHDRAWAL_RETRY_ABI');return BigInt('0x'+data.slice(n,n+64));};
 assert.equal(at(0),64n);const size=at(128);assert.ok(size>0n&&size<=1048576n,'SEPOLIA_WITHDRAWAL_RETRY_ABI');
 const inputsAt=(96+Math.ceil(Number(size)/32)*32)*2;assert.equal(at(64),BigInt(inputsAt/2));assert.equal(at(inputsAt),39n);
 assert.equal(data.length,inputsAt+64+39*64);assert.match(data.slice(192+Number(size)*2,inputsAt),/^0*$/);
 const publicInputs=Array.from({length:39},(_,i)=>at(inputsAt+64+i*64).toString());
 return{...decodeWalletPoolInputs('withdraw_balance',publicInputs),publicInputs};
}
export const readSourceNoteStatementV32=c=>c.action==='FUND_D26'?readDepositSourceStatementV18(c):readWithdrawalSourceStatementV32(c);
export const sourceNoteRetryIdV32=c=>c.action==='FUND_D26'?depositSourceRetryIdV18(c):createHash('sha256').update(JSON.stringify([depositSourceBaseIdV18(c),'WITHDRAWAL_EPOCH_RETRY_V32',c.data])).digest('hex');
export function isExpiredSourceNoteV32(row){return row.phase===EXPIRED_DEPOSIT_V18&&row.command?.action==='FUND_D26'||row.phase===EXPIRED_WITHDRAWAL_V32&&row.command?.action==='WITHDRAW_W39';}
export function assertSameSourceNoteRetryV32(old,current){
 if(old.action==='FUND_D26')return assertSameDepositRetryV18(old,current);
 for(const key of ['profile','identity','jobId','action','from','to','value'])assert.equal(old[key],current[key],'SEPOLIA_WITHDRAWAL_RETRY_SUBSTITUTION');
 const a=readWithdrawalSourceStatementV32(old),b=readWithdrawalSourceStatementV32(current);
 for(const key of ['scope','policy','nullifier','amount','recipient'])assert.equal(a[key],b[key],'SEPOLIA_WITHDRAWAL_RETRY_SUBSTITUTION');
 assert.deepEqual(old.expiredMixedWithdrawalV10,current.expiredMixedWithdrawalV10,'SEPOLIA_WITHDRAWAL_RETRY_SUBSTITUTION');
 assert.equal(old.executorPayout,undefined);assert.equal(current.executorPayout,undefined);
 assert.ok(BigInt(b.epoch)>BigInt(a.epoch),'SEPOLIA_WITHDRAWAL_RETRY_EPOCH');
}
export function assertSourceNoteJobV32(command,job,descriptor){
 const deposit=command.action==='FUND_D26';assert.equal(job?.mode,deposit?'deposit':'withdraw','SEPOLIA_NOTE_RETRY_JOB');
 const old=readSourceNoteStatementV32(command),current=decodeWalletPoolInputs(deposit?'deposit_balance':'withdraw_balance',job.publicInputs);
 assert.equal(command.to,descriptor.pool);assert.equal(old.scope,'0x'+descriptor.scope);assert.equal(old.policy,'0x'+descriptor.policy);
 for(const key of deposit?['scope','policy','amount','output']:['scope','policy','nullifier','amount','recipient'])assert.equal(old[key],current[key],'SEPOLIA_NOTE_RETRY_JOB');
 assert.ok(BigInt(old.epoch)<=BigInt(current.epoch),'SEPOLIA_NOTE_RETRY_JOB_EPOCH');return old;
}
export function assertNoteSourceIdV32(row){
 const c=row.command;assert.ok(row.id===depositSourceBaseIdV18(c)||['FUND_D26','WITHDRAW_W39'].includes(c.action)&&row.id===sourceNoteRetryIdV32(c),'SEPOLIA_SOURCE_DURABLE_BINDING');
}
export function assertNoteRetryNonceHistoryV32(rows){
 assertDepositRetryNonceHistoryV18(rows.filter(row=>row.command?.action!=='WITHDRAW_W39'));
 for(const row of rows.filter(row=>row.command?.action==='WITHDRAW_W39')){
  assert.notEqual(row.phase,EXPIRED_DEPOSIT_V18,'SEPOLIA_WITHDRAWAL_EXPIRED_ROW');
  if(row.id===sourceNoteRetryIdV32(row.command)){const original=rows.find(old=>old.id===depositSourceBaseIdV18(row.command));assert.ok(original?.phase===EXPIRED_WITHDRAWAL_V32,'SEPOLIA_WITHDRAWAL_RETRY_ORIGINAL_EXPIRED');assertSameSourceNoteRetryV32(original.command,row.command);}
  if(row.phase===EXPIRED_WITHDRAWAL_V32){assert.ok(['ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4','ORIGINAL_PAGED_SEPOLIA_DEFI_SOURCE_ROW_V8'].includes(row.profile)&&row.signed,'SEPOLIA_WITHDRAWAL_EXPIRED_ROW');readWithdrawalSourceStatementV32(row.command);assert.ok(row.receipt===null||row.receipt.status==='0x0','SEPOLIA_WITHDRAWAL_EXPIRED_SUCCESS');}
 }
 for(const row of rows)if(row.phase===EXPIRED_WITHDRAWAL_V32)assert.equal(row.command?.action,'WITHDRAW_W39','SEPOLIA_WITHDRAWAL_EXPIRED_ROW');
 const groups=new Map();for(const row of rows){if(row.transaction===null)continue;const group=groups.get(row.transaction.nonce)??[];group.push(row);groups.set(row.transaction.nonce,group);}
 for(const group of groups.values())for(let i=1;i<group.length;i++){assert.ok(isExpiredSourceNoteV32(group[i-1])&&group[i-1].signed,'SEPOLIA_SOURCE_DUPLICATE_NONCE');assertSameSourceNoteRetryV32(group[i-1].command,group[i].command);}
}
