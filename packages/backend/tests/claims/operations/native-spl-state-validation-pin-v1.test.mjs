/** HOST executes the fixed validation-library getter; no observer brand,
 * deployment, compiler, account, proof or native runtime is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNativeClaimValidationLibraryV1} from '../../../src/claims/operations/claim-validation-library-v1.mjs';

test('the original current-state getter pins SPL to its separate library and keeps BTC/SOL unchanged',async()=>{
 const base='0x'+'11'.repeat(32),spl='0x'+'22'.repeat(32),wrong='0x'+'33'.repeat(32);
 async function read(splProfile,index,actual){
  const claims={nativeSplCustodyProfile:splProfile,libraries:{nativeClaimCodec:{codeHash:base},nativeClaimValidation:{codeHash:base},nativeSplClaimValidation:{codeHash:spl}},authority:{address:'0x'+'01'.repeat(20),codeHash:base}};
  const gateway={configurationCommitment:base,async call(signature,args,at){assert.equal(signature,'validationCodeHash()');assert.equal(args.length,0);assert.equal(at,'0x10');return actual;}};
  await assertNativeClaimValidationLibraryV1(claims,index,async expected=>{assert.equal(await gateway.call('validationCodeHash()',[],'0x10'),expected,'CLAIM_STATE_PIN_validationCodeHash()');});
 }
 await read(true,0,base);await read(true,1,spl);await read(false,1,base);
 await assert.rejects(read(true,1,base),/CLAIM_STATE_PIN_validationCodeHash/);
 await assert.rejects(read(true,1,wrong),/CLAIM_STATE_PIN_validationCodeHash/);
 await assert.rejects(read(true,0,spl),/CLAIM_STATE_PIN_validationCodeHash/);
 await assert.rejects(read(false,1,spl),/CLAIM_STATE_PIN_validationCodeHash/);
});
