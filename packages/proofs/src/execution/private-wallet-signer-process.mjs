/** Fixed, short-lived private balance authorizer. stdin is trusted custody
 * bootstrap, fd3 is bounded private output. No public control, path override,
 * arbitrary message-signing operation or wallet key/opening export exists. */
import assert from 'node:assert/strict';
import {createWriteStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {recoverPrivateWalletCustody} from '@lianum/engine/wallet/custody/private-wallet-custody';
import {proveAssemblyInWorker} from './assembly-workers.mjs';
import {validateAssemblyProofPackage} from '@lianum/engine/assembly/private-assembly-actors';
import {walletInputPublicWords} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
export async function runPrivateWalletSigner(input){
 assert.ok(input&&['deposit_balance','withdraw_balance'].includes(input.mode),'PC23_SIGNER_MODE');
 assert.deepEqual(Object.keys(input).sort(),['custody','mode','request'].sort(),'PC23_SIGNER_FIELDS');
 const custody=await recoverPrivateWalletCustody(input.custody);
 try{
  const preparation=input.mode==='deposit_balance'?await custody.prepareTopUp(input.request):await custody.prepareWithdrawal(input.request);
  const witness=input.mode==='deposit_balance'?await custody.depositInput({requestId:preparation.requestId}):await custody.withdrawalInput({requestId:preparation.requestId});
  const result=await proveAssemblyInWorker(input.mode,witness,'wallet-'+input.mode.replaceAll('_','-'));
  const proof=validateAssemblyProofPackage({version:1,mode:input.mode,target:'evm',proofBase64:Buffer.from(result.proof).toString('base64'),publicInputs:result.publicInputs.map(v=>BigInt(v).toString())},input.mode);
  assert.deepEqual(proof.publicInputs,walletInputPublicWords(input.mode,witness),'PC23_SIGNER_STATEMENT');
  await custody.authenticate();return{preparation,proof,checkpoint:custody.checkpoint()};
 }finally{custody.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const chunks=[];let size=0;const output=createWriteStream(null,{fd:3,autoClose:true});
 try{for await(const chunk of process.stdin){size+=chunk.length;assert.ok(size<=4*1024*1024,'PC23_SIGNER_BOOTSTRAP_LIMIT');chunks.push(chunk);}const buffer=Buffer.concat(chunks),input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));buffer.fill(0);for(const b of chunks)b.fill(0);const result=await runPrivateWalletSigner(input);const encoded=Buffer.from(JSON.stringify({ok:true,result}));assert.ok(encoded.length<=2*1024*1024,'PC23_SIGNER_RESULT_LIMIT');await new Promise((resolve,reject)=>output.end(encoded,e=>e?reject(e):resolve()));encoded.fill(0);}
 catch(e){process.exitCode=1;const code=/^[A-Z][A-Z0-9_]{1,100}$/.test(e.code??e.message)?e.code??e.message:'PC23_SIGNER_FAILED';output.end(JSON.stringify({ok:false,code}));}
}
