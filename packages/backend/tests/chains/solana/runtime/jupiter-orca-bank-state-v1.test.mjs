/** Synthetic observation metadata only; no validator, program execution or note. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateJupiterPublicBankAccountsV1} from '../../../../src/chains/solana/runtime/jupiter-orca-bank-state-v1.mjs';
import {createOwnedJupiterPublicBankV1,assertOwnedJupiterPublicBankV1} from '../../../../src/chains/solana/runtime/owned-solana-runtime.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
function sample(){
 const rows=Array.from({length:13},(_,n)=>{const data=Buffer.from([n,1,2]);return{address:'synthetic-'+n,
  owner:'BPFLoader2111111111111111111111111111111111',lamports:'10000000',executable:n<3,
  data,dataSHA256:sha(data),origin:{classification:'SYNTHETIC_HOST_METADATA_ONLY'}};});
 const clock=Buffer.alloc(40);clock.writeBigUInt64LE(80n,0);clock.writeBigInt64LE(123n,32);
 const response={context:{slot:80},value:[...rows.map(row=>({owner:row.owner,lamports:Number(row.lamports),
  executable:row.executable,data:[row.data.toString('base64'),'base64']})),
  {owner:'Sysvar1111111111111111111111111111111111111',lamports:1169280,executable:false,data:[clock.toString('base64'),'base64']}]};
 return {rows,response};
}
test('bank metadata joins every program/account byte and native clock to its observed slot',()=>{
 const {rows,response}=sample(),observed=validateJupiterPublicBankAccountsV1(rows,response);
 assert.equal(observed.accounts.length,13);assert.equal(observed.slot,'80');assert.equal(observed.nativeClock.slot,'80');
 assert.equal(observed.nativeClock.loadedFromSnapshot,false);assert.equal(observed.privateCreditEstablished,false);assert.equal(observed.swapExecutionEstablished,false);
 for(const mutate of [x=>x.value[0].data[0]=Buffer.from([0,1,3]).toString('base64'),x=>x.value[1].owner='11111111111111111111111111111111',
   x=>x.value[2].executable=false,x=>x.value[3].lamports++,x=>x.context.slot++,x=>x.value.pop()]){
  const bad=structuredClone(response);mutate(bad);assert.throws(()=>validateJupiterPublicBankAccountsV1(rows,bad));
 }
});
test('fixed bank rejects caller options before any material/native load and has a separate brand',async()=>{
 await assert.rejects(createOwnedJupiterPublicBankV1({endpoint:'synthetic-invalid'}),/JUPITER_BANK_NO_OPTIONS/);
 assert.throws(()=>assertOwnedJupiterPublicBankV1({metadata:{classification:'OWNED_JUPITER_ORCA_PUBLIC_BANK_V1'}}),/ORIGINAL_JUPITER_PUBLIC_BANK_REQUIRED/);
});
