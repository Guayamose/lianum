/** Fixed original Native D26 recipient. This own process sees its witness and uses
 * the unchanged original native economic PC23 proof facade. No caller paths/backend/limits. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {preparePrivateProofJobV1,wipePrivateProofInputsV1} from './private-proof-transit-v1.mjs';
import {deriveOriginalNativePrivateDepositV2} from './private-native-device-deposit-input-v2.mjs';
import {originalNativePrivateDepositFailureV2} from './native-device-private-deposit-client-v2.mjs';
import {createNativeEconomicNoteProofProcessV1} from '../../../engine/src/execution/proofs/proof-process.mjs';
async function main(){
 const mode='deposit_balance';assert.ok(process.argv.length===2&&process.connected,'PW_NATIVE_PRIVATE_ENTRY');process.umask(0o077);
 let received,prover,stopping=false,phase='INTAKE';
 const stop=async()=>{if(stopping)return;stopping=true;try{await prover?.close();}finally{wipePrivateProofInputsV1(received?.inputs);if(process.connected)process.disconnect();process.exit(2);}};
 process.once('disconnect',stop);process.once('SIGTERM',stop);
 try{
  received=await preparePrivateProofJobV1({relation:mode,role:'owner',jobId:randomUUID()});assert.equal(stopping,false,'PW_PRIVATE_WALLET_CLOSED');
  phase='DERIVE';const derivation=deriveOriginalNativePrivateDepositV2(received);phase='CONSTRUCT_FACADE';prover=createNativeEconomicNoteProofProcessV1('owner');
  phase='PROVE';const result=await prover.prove(mode,received.inputs,received.expectedPublicInputs,'device-deposit-d26');
  phase='RESULT';assert.equal(result.metrics.acceptedResult,true,'PW_PRIVATE_WALLET_PROOF_REJECTED');assert.equal(stopping,false,'PW_PRIVATE_WALLET_CLOSED');await prover.close();prover=null;
  const publicResult={type:'original-native-private-deposit-result-v2',mode,recipientJobId:derivation?received.authorization.jobId:null,
   derivation,result:{...result,proof:typeof result.proof==='string'?result.proof:Buffer.from(result.proof).toString('hex'),publicInputs:[...result.publicInputs]}};
  assert.ok(Buffer.byteLength(JSON.stringify(publicResult))<=1048576,'PW_PRIVATE_WALLET_RESULT_BOUND');
  await new Promise((resolve,reject)=>process.send(publicResult,e=>e?reject(e):resolve()));
 }catch(error){if(!stopping&&process.connected){const diagnostic=originalNativePrivateDepositFailureV2(error,phase);await new Promise(resolve=>process.send(diagnostic,()=>resolve()));}process.exitCode=1;}
 finally{wipePrivateProofInputsV1(received?.inputs);await prover?.close();process.off('disconnect',stop);process.off('SIGTERM',stop);if(process.connected)process.disconnect();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().then(()=>process.exit(process.exitCode??0),()=>process.exit(1));
