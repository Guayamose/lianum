/** Only an original opened recipient derives this same Native PC23 W39. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import * as P from '../../../mobile-protocol/src/device-native-private-exit-v2.mjs';
import {normalizeOriginalAccountSignatureV2} from '../../../mobile-protocol/src/original-account-review-v2.mjs';
import {readOriginalPrivateProofRecipientV1,wipePrivateProofInputsV1} from './private-proof-transit-v1.mjs';
import {walletInputPublicWords,balanceCommitment,balanceWithdrawFrame} from '../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {nullifier} from '../../../engine/src/notes/private-note-encoding.mjs';
import {verifyPrivateNotePath} from '../../../engine/src/notes/private-note-tree.mjs';
const h=b=>createHash('sha256').update(b).digest('hex'),key=(x,y)=>createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(x).toString('base64url'),y:Buffer.from(y).toString('base64url')}});
export function deriveOriginalNativePrivateExitV2(received){assert.equal(arguments.length,1);const original=readOriginalPrivateProofRecipientV1(received),p=received.inputs;
 assert.ok(p&&Object.getPrototypeOf(p)===Object.prototype);assert.deepEqual(Reflect.ownKeys(p).sort(),['profile','consent','signature','witness'].sort());for(const n of Object.keys(p))assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(p,n),'value'));
 assert.equal(p.profile,'NATIVE_W39_PRIVATE_WITNESS_INPUT_V2');const c=P.normalizeNativePrivateExitConsentV2(p.consent);assert.equal(c.action,'PROVE_W39');assert.deepEqual(c.privateProof.recipient,original);P.validateDeviceExitConsentEitherFreshV2(c);
 assert.equal(h(P.nativePrivateExitTranscriptBytesV2(c)),c.privateProof.transcriptSHA256);const msg=P.deviceExitConsentEitherMessageV2(c);
 assert.equal(verify('sha256',msg,{key:key(Buffer.from(c.devicePublicKey.slice(2,66),'hex'),Buffer.from(c.devicePublicKey.slice(66),'hex')),dsaEncoding:'ieee-p1363'},Buffer.from(normalizeOriginalAccountSignatureV2(p.signature),'hex')),true,'PW_NATIVE_PRIVATE_DEVICE_SIGNATURE');
 assert.deepEqual(received.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,consentSHA256:h(msg),witnessSHA256:c.witnessSHA256});
 let witness,bytes,frame;const opening={};try{witness=P.normalizeDeviceExitWitnessV1(p.witness);bytes=P.deviceExitWitnessBytesV1(witness);assert.equal(h(bytes),c.witnessSHA256);
  const expected=P.nativePrivateExitPublicInputsV2(c);assert.deepEqual(received.expectedPublicInputs,expected);assert.deepEqual(walletInputPublicWords('withdraw_balance',witness),expected);
  for(const n of ['rho','key_x','key_y','secret','signature'])opening[n]=Buffer.from(witness[n]);
  const cm=balanceCommitment(c.statement.scope,c.statement.policy,{type:4,rho:opening.rho,x:opening.key_x,y:opening.key_y,value:witness.value,secret:opening.secret}).toString('hex'),nf=nullifier(c.statement.scope,cm,opening.secret).toString('hex');assert.equal(cm,c.statement.commitment);assert.equal(nf,c.statement.nullifier);
  const path=c.privateProof.path;assert.equal(witness.leaf_index,String(path.index));assert.deepEqual(witness.siblings,path.siblings.map(v=>[...Buffer.from(v,'hex')]));assert.equal(verifyPrivateNotePath({root:Buffer.from(path.root,'hex'),leaf:Buffer.from(cm,'hex'),index:path.index,siblings:path.siblings.map(v=>Buffer.from(v,'hex'))}),true,'PW_NATIVE_PRIVATE_PATH');
  frame=balanceWithdrawFrame(c.statement.scope,c.statement.policy,cm,c.statement.recipient,c.statement.amount,c.statement.epoch);assert.equal(verify('sha256',frame,{key:key(opening.key_x,opening.key_y),dsaEncoding:'ieee-p1363'},opening.signature),true,'PW_NATIVE_PRIVATE_NOTE_SIGNATURE');P.validateDeviceExitConsentEitherFreshV2(c);
  const owned=structuredClone(witness);wipePrivateProofInputsV1(received.inputs);received.inputs=owned;return Object.freeze({profile:'ORIGINAL_NATIVE_DEVICE_W39_PRIVATE_DERIVATION_V2',mode:'withdraw_balance',jobId:c.jobId,commitment:cm,nullifier:nf,consentSHA256:received.authorization.consentSHA256,witnessSHA256:c.witnessSHA256});
 }finally{bytes?.fill(0);frame?.fill(0);for(const b of Object.values(opening))b.fill(0);P.wipeDeviceExitWitnessV1(witness);}}
