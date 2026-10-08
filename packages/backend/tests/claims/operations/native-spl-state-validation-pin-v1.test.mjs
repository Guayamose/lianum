/** HOST executes only the original fixed getter vector; no observer brand,
 * deployment, compiler, account, proof or native runtime is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {join} from 'node:path';
import {ROOT} from '../../../../proofs/src/catalog.mjs';

test('the original current-state getter pins SPL to its separate library and keeps BTC/SOL unchanged',async()=>{
 const url=new URL('../../../src/claims/operations/owned-state.mjs',import.meta.url);
 const source=readFileSync(existsSync(url)?url:join(ROOT,'wallet-platform/modules/native-claims/owned-state.mjs'),'utf8');
 const start=source.indexOf('...Object.entries({ claimDomain:')+3;
 const marker="}).map(([key, value]) => expect(gateway, key + '()', [], value))";
 const end=source.indexOf(marker,start)+marker.length;
 assert.ok(start>=3&&end>start);const body=source.slice(start,end);
 const base='0x'+'11'.repeat(32),spl='0x'+'22'.repeat(32),wrong='0x'+'33'.repeat(32);
 async function read(splProfile,index,actual){
  const claims={nativeSplCustodyProfile:splProfile,libraries:{nativeClaimCodec:{codeHash:base},nativeClaimValidation:{codeHash:base},nativeSplClaimValidation:{codeHash:spl}},authority:{address:'0x'+'01'.repeat(20),codeHash:base}};
  const gateway={configurationCommitment:base,async call(signature,args,at){assert.equal(signature,'validationCodeHash()');assert.equal(args.length,0);assert.equal(at,'0x10');return actual;}};
  let reads=0;
  const context=createContext({claims,i:index,gateway,system:{hub:{address:'0x'+'02'.repeat(20)}},pool:{address:'0x'+'03'.repeat(20)},config:{custodyInventoryDomain:'44'.repeat(32)},assetKey:base,
   prefix:x=>'0x'+x,word:x=>'0x'+BigInt(x).toString(16).padStart(64,'0'),claimDomainCommitment:()=> '55'.repeat(32),
   async expect(target,signature,args,expected){if(signature!=='validationCodeHash()')return;reads++;assert.equal(await target.call(signature,args,'0x10'),expected,'CLAIM_STATE_PIN_'+signature);}});
  await Promise.all(new Script(body).runInContext(context));assert.equal(reads,1);
 }
 await read(true,0,base);await read(true,1,spl);await read(false,1,base);
 await assert.rejects(read(true,1,base),/CLAIM_STATE_PIN_validationCodeHash/);
 await assert.rejects(read(true,1,wrong),/CLAIM_STATE_PIN_validationCodeHash/);
 await assert.rejects(read(true,0,spl),/CLAIM_STATE_PIN_validationCodeHash/);
 await assert.rejects(read(false,1,spl),/CLAIM_STATE_PIN_validationCodeHash/);
});
