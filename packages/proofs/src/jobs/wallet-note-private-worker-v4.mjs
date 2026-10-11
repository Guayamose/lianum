/** New fixed entry, not an alias/monkeypatch of the legacy proof worker.
 * Only the original PC23 algorithms/ABI/pins are reused after own AEAD intake. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {preparePrivateProofJobV1,privateProofBindingSHA256V1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import {ORIGINAL_WALLET_PRIVATE_PROVER_V4,readOriginalWalletNoteProverRequestV4} from './wallet-note-private-prover-v4.mjs';
import {need,proofError,exactObject,encodeProofMessage,decodeProofMessage,normalizeProofWitness,assertExpectedInputs,publicInputsFromWitness,
 loadProofProfile,encodePrivateProof,wipePrivate} from '../execution/proof-worker.mjs';
import {hash,verifyToolchain,verifyCRS} from '@lianum/proofs/toolchain/wallet-resources';
async function main(){
 const mode=process.argv[2];need(process.argv.length===3&&['deposit_balance','withdraw_balance'].includes(mode)&&process.connected,'PAEG_PROOF_PRIVATE_ENTRY');process.umask(0o077);
 let opened,input,proof,pendingAck,sequence=0;const terminate=()=>{wipePrivate(input);wipePrivateProofInputsV1(opened?.inputs);process.exit(2);};process.once('disconnect',terminate);process.once('SIGTERM',terminate);
 const send=async value=>{const bytes=encodeProofMessage(value);try{await new Promise((resolve,reject)=>process.send(bytes,e=>e?reject(e):resolve()));}finally{bytes.fill(0);}};
 const receive=bytes=>{let value;try{value=decodeProofMessage(bytes);exactObject(value,['event','sequence']);need(value.event==='phase-persisted'&&value.sequence===sequence&&pendingAck,'PAEG_PROOF_ONE_REQUEST');const resolve=pendingAck;pendingAck=null;resolve();}catch{terminate();}finally{wipePrivate(value);}};
 try{
  opened=await preparePrivateProofJobV1({relation:mode,role:'owner',jobId:randomUUID()});const{request,expected,binding}=readOriginalWalletNoteProverRequestV4(opened,mode);process.on('message',receive);
  const phase=async stage=>{const ack=new Promise(resolve=>{pendingAck=resolve;});await send({event:'phase',sequence:++sequence,stage});await ack;};await phase('checking-pins');
  const loaded=loadProofProfile(mode);need(loaded.legacy===true&&loaded.target==='evm'&&loaded.maximumPages===32768,'PAEG_PROOF_PRIVATE_PROFILE');const toolchain=verifyToolchain(),crs=verifyCRS();
  globalThis.fetch=async()=>{throw proofError('PAEG_PROOF_OFFLINE_REQUIRED');};input=normalizeProofWitness(loaded.program,request.input);assertExpectedInputs(mode,publicInputsFromWitness(loaded.program,input),expected);const metrics={...loaded.publicPins,privateTransitProfile:ORIGINAL_WALLET_PRIVATE_PROVER_V4,zeroKnowledgeEnabled:true,maximumPages:loaded.maximumPages,threads:1,toolchain,crs};
  await phase('legacy-proof-and-self-verification');
  const{proveWallet}=await import('../toolchain/wallet-prover.mjs');proof=await proveWallet(mode,input,request.label);
  assert.equal(proof.metrics.verified,true,'PAEG_PROOF_SELF_VERIFICATION_FAILED');proof.publicInputs=assertExpectedInputs(mode,proof.publicInputs,expected);metrics.verified=true;metrics.proofSHA256=hash(proof.proof);metrics.publicInputsSHA256=hash(JSON.stringify(proof.publicInputs));metrics.proofBytes=proof.proof.length;metrics.publicInputCount=proof.publicInputs.length;
  const result={proofPackage:encodePrivateProof(mode,proof),metrics};try{await send({event:'result',result,authorizationBindingSHA256:privateProofBindingSHA256V1(binding)});}finally{wipePrivate(result.proofPackage);}
 }catch(e){const code=/^PAEG_PROOF_[A-Z_]+$/.test(e?.code??'')?e.code:'PAEG_PROOF_TOOLCHAIN_OR_CONSTRAINT_FAILURE';if(process.connected)await send({event:'failure',code}).catch(()=>{});process.exitCode=1;}
 finally{wipePrivate(input);wipePrivate(proof);wipePrivateProofInputsV1(opened?.inputs);process.off('message',receive);process.off('disconnect',terminate);process.off('SIGTERM',terminate);if(process.connected)process.disconnect();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().then(()=>process.exit(process.exitCode??0),()=>process.exit(1));
