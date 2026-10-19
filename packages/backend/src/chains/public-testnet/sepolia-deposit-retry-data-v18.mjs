/** Mechanical deposit/retry DATA. No private keys, Original capabilities or RPC.
 * Expiry must be established separately by the Original account and signer. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {decodeWalletPoolInputs} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
export const EXPIRED_DEPOSIT_V18='EXPIRED_DEPOSIT_V18';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const selector=publicKeccak256(Buffer.from('depositBalance(bytes,bytes32[])')).subarray(0,4).toString('hex');
export const depositSourceBaseIdV18=c=>sha([c.identity,c.jobId,c.action]);
export const depositSourceRetryIdV18=c=>sha([depositSourceBaseIdV18(c),'EPOCH_RETRY_V18',c.data]);
export function assertDepositSourceIdV18(row){
 const c=row.command;assert.ok(row.id===depositSourceBaseIdV18(c)||c.action==='FUND_D26'&&row.id===depositSourceRetryIdV18(c),'SEPOLIA_SOURCE_DURABLE_BINDING');
}
export function readDepositSourceStatementV18(c){
 assert.equal(c.profile,'ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4');assert.equal(c.action,'FUND_D26');
 assert.ok(typeof c.data==='string'&&c.data.length<8388608&&/^0x(?:[0-9a-f]{2})+$/.test(c.data),'SEPOLIA_DEPOSIT_RETRY_ABI');
 assert.equal(c.data.slice(2,10),selector,'SEPOLIA_DEPOSIT_RETRY_METHOD');
 const data=c.data.slice(10),at=n=>{assert.ok(Number.isSafeInteger(n)&&n>=0&&n+64<=data.length,'SEPOLIA_DEPOSIT_RETRY_ABI');return BigInt('0x'+data.slice(n,n+64));};
 assert.equal(at(0),64n,'SEPOLIA_DEPOSIT_RETRY_ABI');const size=at(128);assert.ok(size>0n&&size<=1048576n,'SEPOLIA_DEPOSIT_RETRY_ABI');
 const inputsAt=(96+Math.ceil(Number(size)/32)*32)*2;assert.equal(at(64),BigInt(inputsAt/2),'SEPOLIA_DEPOSIT_RETRY_ABI');assert.equal(at(inputsAt),26n,'SEPOLIA_DEPOSIT_RETRY_ABI');
 assert.equal(data.length,inputsAt+64+26*64,'SEPOLIA_DEPOSIT_RETRY_ABI');
 assert.match(data.slice(192+Number(size)*2,inputsAt),/^0*$/,'SEPOLIA_DEPOSIT_RETRY_ABI');
 const publicInputs=Array.from({length:26},(_,i)=>at(inputsAt+64+i*64).toString()),statement=decodeWalletPoolInputs('deposit_balance',publicInputs);
 assert.equal(statement.amount,c.value,'SEPOLIA_DEPOSIT_RETRY_VALUE');return{...statement,publicInputs};
}
export function assertSameDepositRetryV18(old,current){
 for(const key of ['profile','identity','jobId','action','from','to','value'])assert.equal(old[key],current[key],'SEPOLIA_DEPOSIT_RETRY_SUBSTITUTION');
 const a=readDepositSourceStatementV18(old),b=readDepositSourceStatementV18(current);
 for(const key of ['scope','policy','amount','output'])assert.equal(a[key],b[key],'SEPOLIA_DEPOSIT_RETRY_SUBSTITUTION');
 assert.ok(BigInt(b.epoch)>BigInt(a.epoch),'SEPOLIA_DEPOSIT_RETRY_EPOCH');
}
export function assertDepositRetryNonceHistoryV18(rows){
 const groups=new Map();
 for(const row of rows){
  if(row.command?.action==='FUND_D26'&&row.id===depositSourceRetryIdV18(row.command)){
   const original=rows.find(old=>old.id===depositSourceBaseIdV18(row.command));
   assert.ok(original?.phase===EXPIRED_DEPOSIT_V18,'SEPOLIA_DEPOSIT_RETRY_ORIGINAL_EXPIRED');assertSameDepositRetryV18(original.command,row.command);
  }
  if(row.phase===EXPIRED_DEPOSIT_V18){assert.ok(['ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4','ORIGINAL_PAGED_SEPOLIA_DEFI_SOURCE_ROW_V8'].includes(row.profile)&&row.signed,'SEPOLIA_DEPOSIT_EXPIRED_ROW');readDepositSourceStatementV18(row.command);assert.ok(row.receipt===null||row.receipt.status==='0x0','SEPOLIA_DEPOSIT_EXPIRED_SUCCESS');}
  if(row.transaction===null)continue;const nonce=row.transaction.nonce,group=groups.get(nonce)??[];group.push(row);groups.set(nonce,group);
 }
 for(const group of groups.values())if(group.length>1)for(let i=1;i<group.length;i++){
  assert.equal(group[i-1].phase,EXPIRED_DEPOSIT_V18,'SEPOLIA_SOURCE_DUPLICATE_NONCE');
  assert.ok(group[i-1].signed,'SEPOLIA_SOURCE_DUPLICATE_NONCE');assertSameDepositRetryV18(group[i-1].command,group[i].command);
 }
}
