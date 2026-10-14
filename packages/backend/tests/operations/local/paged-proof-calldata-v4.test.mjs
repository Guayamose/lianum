/** Actual pinned Solidity ABI transport only. The deliberately inert bytes and
 * syntactically valid signature fields are never submitted to a verifier or
 * chain; this test claims no SNARK, quorum, payment or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pagedGraphProofDataV3} from '../../../src/operations/local/funded-graph-paged-deployment-v3.mjs';
import {pinnedCompilation} from '../../../src/operations/local/funded-graph-paged-kernel-data-v4.mjs';
import {PAEG_PAGED_WORDS_V3} from '@lianum/proofs/tooling/original-paged-artifacts-v3';
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const at=(payload,offset)=>BigInt('0x'+payload.slice(offset*2,(offset+32)*2));
function assertTransport(data,selector,proof,inputs,headBytes){
 assert.equal(data.slice(0,10),'0x'+selector);
 const payload=data.slice(10),proofOffset=Number(at(payload,0)),inputsOffset=Number(at(payload,32));
 assert.equal(proofOffset,headBytes);
 assert.equal(inputsOffset,headBytes+32+Math.ceil(proof.length/32)*32);
 assert.equal(at(payload,proofOffset),BigInt(proof.length));
 assert.equal(payload.slice((proofOffset+32)*2,(proofOffset+32+proof.length)*2),proof.toString('hex'));
 assert.equal(payload.slice((proofOffset+32+proof.length)*2,inputsOffset*2),'0'.repeat((Math.ceil(proof.length/32)*32-proof.length)*2));
 assert.equal(at(payload,inputsOffset),BigInt(inputs.length));
 assert.equal(payload.slice((inputsOffset+32)*2),inputs.map(n=>n.slice(2)).join(''));
 return payload;
}
test('original compiled withdrawal and terminal ABIs preserve selectors, public words and fixed health tuple',async()=>{
 const active=JSON.parse(await readFile(new URL('../../../../../scripts/development/active-paged-generation.json',import.meta.url),'utf8'));
 const compiled=pinnedCompilation(active.manifestSHA256,active.consumerSHA256);
 assert.equal(compiled.manifest.securityGeneration,'EXACT_PAYOUT_SET_V4');
 const pool=compiled.consumer.contracts['contracts/wallet/PrivatePagedFundedGraphPoolV4.sol'].PrivatePagedFundedGraphPoolV4;
 const state=compiled.consumer.contracts['contracts/wallet/PrivatePagedFundedGraphStateV3.sol'].PrivatePagedFundedGraphStateV3;
 const proof=Buffer.from(Array.from({length:65},(_,i)=>i+1));
 const inputs=count=>Array.from({length:count},(_,i)=>'0x'+word(i+1));
 const withdrawInputs=inputs(PAEG_PAGED_WORDS_V3.withdraw);
 assert.equal(withdrawInputs.length,39);
 assertTransport(pagedGraphProofDataV3(pool,'withdraw',proof,withdrawInputs),pool.evm.methodIdentifiers['withdraw(bytes,bytes32[])'],proof,withdrawInputs,64);
 const health={healthFrom:'1700000000',healthUntil:'1700000030',healthSignatures:Array.from({length:3},(_,i)=>({signerIndex:String(i),v:i%2?'28':'27',r:'0x'+word(i+1),s:'0x'+word(i+2)}))};
 const signature='fulfill(bytes,bytes32[],uint64,uint64,(uint8,uint8,bytes32,bytes32)[3])';
 const terminalInputs=inputs(PAEG_PAGED_WORDS_V3.terminal);
 assert.equal(terminalInputs.length,compiled.manifest.roles.terminal.words);
 for(const artifact of [pool,state]){
  const payload=assertTransport(pagedGraphProofDataV3(artifact,'fulfill',proof,terminalInputs,health),artifact.evm.methodIdentifiers[signature],proof,terminalInputs,512);
  assert.equal(at(payload,64),BigInt(health.healthFrom));assert.equal(at(payload,96),BigInt(health.healthUntil));
  for(const [i,sig] of health.healthSignatures.entries()){
   const start=128+i*128;
   assert.equal(at(payload,start),BigInt(sig.signerIndex));assert.equal(at(payload,start+32),BigInt(sig.v));
   assert.equal(at(payload,start+64),BigInt(sig.r));assert.equal(at(payload,start+96),BigInt(sig.s));
  }
  assert.throws(()=>pagedGraphProofDataV3(artifact,'fulfill',proof,terminalInputs),/NATIVE_HEALTH_FIELDS/);
  assert.throws(()=>pagedGraphProofDataV3(artifact,'fulfill',proof,terminalInputs,{...health,healthSignatures:[health.healthSignatures[1],health.healthSignatures[0],health.healthSignatures[2]]}),/NATIVE_HEALTH_SIGNER_ORDER/);
 }
 assert.throws(()=>pagedGraphProofDataV3(pool,'withdraw',proof,withdrawInputs,health));
});
