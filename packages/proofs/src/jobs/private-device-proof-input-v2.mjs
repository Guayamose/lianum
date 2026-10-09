/** The original private recipient validates D27 before original ABI/prover.
 * CM/NF are descriptive until the same owned proof client and pool verify. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {wipePrivateProofInputsV1,readOriginalPrivateProofRecipientV1} from './private-proof-transit-v1.mjs';
import * as P from '../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
import {depositIntentWitness} from '../../../backend/src/execution/account/preparation/deposit-intent.mjs';
import {balanceCommitment} from '../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {nullifier} from '../../../engine/src/notes/private-note-encoding.mjs';
export function deriveOriginalDeviceDepositIntentJobV2(received,spec) {
  assert.equal(arguments.length,2,'PW_PRIVATE_D27_ARITY');
  const originalRecipient=readOriginalPrivateProofRecipientV1(received);
  if (received.inputs?.profile !== 'DEVICE_D27_PRIVATE_WITNESS_INPUT_V2') return null;
  let privateDeviceDerivation=null;
    const packet=P.externalFlatExactV1(received.inputs,['profile','consent','signature','witness']);
    const c=P.normalizeExternalFlatConsentV1(packet.consent);
    assert.equal(spec.name,'deposit_intent','PW_PRIVATE_D27_RELATION');
    assert.equal(c.action,'PROVE_D27','PW_PRIVATE_D27_CONSENT');assert.ok(c.privateProof,'PW_PRIVATE_D27_CONSENT');
    assert.deepEqual(c.privateProof.recipient,originalRecipient,'PW_PRIVATE_D27_RECIPIENT');
    P.validateExternalFlatFreshV1(c);
    const h=bytes=>createHash('sha256').update(bytes).digest('hex');
    assert.equal(h(P.externalFlatPrivateProofTranscriptBytesV2(c)),c.privateProof.transcriptSHA256,'PW_PRIVATE_D27_TRANSCRIPT');
    const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
      x:Buffer.from(c.descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),
      y:Buffer.from(c.descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}});
    assert.equal(verify('sha256',P.externalFlatPermissionMessageV1(c),{key,dsaEncoding:'ieee-p1363'},
      Buffer.from(P.normalizeExternalFlatSignatureV1(packet.signature),'hex')),true,'PW_PRIVATE_D27_DEVICE_SIGNATURE');
    assert.deepEqual(received.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:c.jobId,
      consentSHA256:h(P.externalFlatPermissionMessageV1(c)),witnessSHA256:c.witnessSHA256},'PW_PRIVATE_D27_BINDING');
    let witness,bytes,prepared;const opening={};
    try {
      witness=P.externalFlatWitnessV1('deposit_intent',packet.witness);bytes=P.externalFlatWitnessBytesV1('deposit_intent',witness);
      assert.equal(h(bytes),c.witnessSHA256,'PW_PRIVATE_D27_WITNESS_HASH');
      for(const name of ['rho','key_x','key_y','secret','signature'])opening[name]=Buffer.from(witness[name]);
      prepared=depositIntentWitness({statement:c.statement,note:{type:4,rho:opening.rho.toString('hex'),
        x:opening.key_x.toString('hex'),y:opening.key_y.toString('hex'),value:witness.amount,
        secret:opening.secret.toString('hex')},signature:opening.signature.toString('hex')});
      assert.deepEqual(prepared.publicInputs,received.expectedPublicInputs,'PW_PRIVATE_D27_PUBLIC_INPUTS');
      const cm=balanceCommitment(c.statement.scope,c.statement.policy,{type:4,rho:opening.rho,
        x:opening.key_x,y:opening.key_y,value:witness.amount,secret:opening.secret}).toString('hex');
      assert.equal(cm,c.statement.output,'PW_PRIVATE_D27_COMMITMENT');
      privateDeviceDerivation={profile:'ORIGINAL_DEVICE_D27_PRIVATE_DERIVATION_V2',jobId:c.jobId,commitment:cm,
        nullifier:nullifier(c.statement.scope,cm,opening.secret).toString('hex'),
        consentSHA256:received.authorization.consentSHA256,witnessSHA256:c.witnessSHA256};
      const inputs=structuredClone(prepared.inputs);wipePrivateProofInputsV1(received.inputs);received.inputs=inputs;
    } finally {bytes?.fill(0);for(const value of Object.values(opening))value.fill(0);P.externalFlatWipeV1(witness);prepared=null;}
  return privateDeviceDerivation;
}
