/** A parsed consent/opening is never a recipient or native prover grant. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/native-deposit-v2';
import {normalizeOriginalAccountSignatureV2} from '@lianum/mobile-protocol/original-account-v2';
import {readOriginalPrivateProofRecipientV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import {walletInputPublicWords,balanceCommitment,balanceDepositFrame} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {nullifier} from '@lianum/engine/notes/private-note-encoding';
const h=b=>createHash('sha256').update(b).digest('hex');
const key=(x,y)=>createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(x).toString('base64url'),y:Buffer.from(y).toString('base64url')}});
export function deriveOriginalNativePrivateDepositV2(received){
 assert.equal(arguments.length,1);const original=readOriginalPrivateProofRecipientV1(received),p=received.inputs;
 assert.ok(p&&Object.getPrototypeOf(p)===Object.prototype);assert.deepEqual(Object.keys(p).sort(),['profile','consent','signature','witness'].sort());
 for(const n of Object.keys(p))assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(p,n),'value'));
 assert.equal(p.profile,'NATIVE_D26_PRIVATE_WITNESS_INPUT_V2');const c=P.normalizeNativePrivateDepositConsentV2(p.consent);
 assert.equal(c.action,'PROVE_D26');assert.deepEqual(c.privateProof.recipient,original);P.validateDeviceDepositConsentEitherFreshV2(c);
 assert.equal(h(P.nativePrivateDepositTranscriptBytesV2(c)),c.privateProof.transcriptSHA256);
 const signature=normalizeOriginalAccountSignatureV2(p.signature),message=P.deviceDepositConsentEitherMessageV2(c);
 assert.equal(verify('sha256',message,{key:key(Buffer.from(c.devicePublicKey.slice(2,66),'hex'),Buffer.from(c.devicePublicKey.slice(66),'hex')),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')),true,'PW_NATIVE_PRIVATE_DEVICE_SIGNATURE');
 assert.deepEqual(received.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,consentSHA256:h(message),witnessSHA256:c.witnessSHA256});
 let witness,bytes;const opening={};
 try{
  witness=P.normalizeDeviceDepositWitnessV1(p.witness);bytes=P.deviceDepositWitnessBytesV1(witness);assert.equal(h(bytes),c.witnessSHA256);
  const expected=P.nativePrivateDepositPublicInputsV2(c);assert.deepEqual(received.expectedPublicInputs,expected);assert.deepEqual(walletInputPublicWords('deposit_balance',witness),expected);
  for(const n of ['rho','key_x','key_y','secret','signature'])opening[n]=Buffer.from(witness[n]);
  const cm=balanceCommitment(c.statement.scope,c.statement.policy,{type:4,rho:opening.rho,x:opening.key_x,y:opening.key_y,value:witness.amount,secret:opening.secret}).toString('hex');
  assert.equal(cm,c.statement.output);assert.equal(verify('sha256',balanceDepositFrame(c.statement.scope,c.statement.policy,c.statement.epoch,c.statement.amount,cm),
   {key:key(opening.key_x,opening.key_y),dsaEncoding:'ieee-p1363'},opening.signature),true,'PW_NATIVE_PRIVATE_NOTE_SIGNATURE');
  const nf=nullifier(c.statement.scope,cm,opening.secret).toString('hex');P.validateDeviceDepositConsentEitherFreshV2(c);
  const owned=structuredClone(witness);wipePrivateProofInputsV1(received.inputs);received.inputs=owned;
  return Object.freeze({profile:'ORIGINAL_NATIVE_DEVICE_D26_PRIVATE_DERIVATION_V2',mode:'deposit_balance',jobId:c.jobId,commitment:cm,nullifier:nf,
   consentSHA256:received.authorization.consentSHA256,witnessSHA256:c.witnessSHA256});
 }finally{bytes?.fill(0);for(const b of Object.values(opening))b.fill(0);if(witness)for(const b of Object.values(witness))if(Array.isArray(b))b.fill(0);}
}
