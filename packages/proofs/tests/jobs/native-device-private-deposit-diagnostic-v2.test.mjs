import test from 'node:test';
import assert from 'node:assert/strict';
import {originalNativePrivateDepositFailureV2,normalizeOriginalNativePrivateDepositFailureV2,createOriginalNativePrivateDepositProofClientV2,readOriginalNativePrivateDepositDerivationV2} from '../../src/jobs/native-device-private-deposit-client-v2.mjs';
test('HOST Native private D26 failure retains closed phase/code/frame and excludes witness or assertion values',async()=>{
 const secret='HOST_PRIVATE_VALUE_MUST_NOT_BE_RETAINED',error=Error('values differ\nactual:'+secret);error.code='ERR_ASSERTION';
 error.stack='Error: '+secret+'\n    at original (file:///private/'+secret+'/proof-worker.mjs:247:3)\n    at caller (file:///private/foreign-file.mjs:8:9)';
 const frame=originalNativePrivateDepositFailureV2(error,'PROVE');assert.deepEqual(frame,{type:'original-native-private-deposit-failure-v2',phase:'PROVE',code:'ERR_ASSERTION',ownedFrame:'proof-worker.mjs:247:3'});
 assert.equal(JSON.stringify(frame).includes(secret),false);assert.equal(Object.isFrozen(frame),true);assert.deepEqual(normalizeOriginalNativePrivateDepositFailureV2(frame),frame);
 const code=originalNativePrivateDepositFailureV2(Error('PAEG_PROOF_WITNESS_SHAPE'),'PROVE');assert.equal(code.code,'PAEG_PROOF_WITNESS_SHAPE');
 const missing=Error(secret);missing.code='ENOENT';assert.equal(originalNativePrivateDepositFailureV2(missing,'CONSTRUCT_FACADE').code,'ENOENT');
 let reads=0;const accessors={get code(){reads++;return secret;},get message(){reads++;return secret;},get stack(){reads++;return secret;}};
 const safe=originalNativePrivateDepositFailureV2(accessors,'DERIVE');assert.equal(reads,0);assert.equal(safe.code,'PW_PRIVATE_WALLET_PROOF_INCOMPLETE');assert.equal(safe.ownedFrame,null);
 const proxy=new Proxy({}, {ownKeys(){throw Error(secret);}});assert.equal(originalNativePrivateDepositFailureV2(proxy,'INTAKE').code,'PW_PRIVATE_WALLET_PROOF_INCOMPLETE');
 for(const altered of [{...frame,payload:secret},{...frame,code:secret},{...frame,phase:'MINT'},{...frame,ownedFrame:'/private/proof-worker.mjs:1:2'},{...frame,ownedFrame:'foreign-file.mjs:1:2'}])assert.throws(()=>normalizeOriginalNativePrivateDepositFailureV2(altered));
 const client=createOriginalNativePrivateDepositProofClientV2();assert.throws(()=>readOriginalNativePrivateDepositDerivationV2(client,frame),/ORIGINAL_RESULT/);await client.close();
});
