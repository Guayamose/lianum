/** Synthetic public framing only. No ledger membership, original grant,
 * biometric hardware, U/S proof or financial acceptance is established here. */
import { createHash, createECDH } from 'node:crypto';
import { originalAccountFramesV2 } from './original-account-frames-v2.mjs';
import { compileFundedGraph, ownerAuthorizationMessage, payoutInvoiceMessage } from '../../../../packages/engine/src/execution/graph/funded-graph.mjs';
import { nativeTransferActionCommitment } from '../../../../packages/engine/src/execution/native/dispatch/native-capsules.mjs';
import { normalizeDeviceReservationWitnessV1 } from '../../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';
import { signDeviceMessage, devicePublicKey } from '../../src/custody/signing.mjs';
export function deviceReservationFixtureV1(deviceKey = new Uint8Array(32).fill(11)) {
  const h = index => index.toString(16).padStart(64, '0'), devicePublic = devicePublicKey(deviceKey);
  const { access, review } = originalAccountFramesV2({ devicePublicKey: devicePublic, action: 'read' });
  access.expiresAt = Date.now() + 15000;
  const note = (index, value) => {
    const key = createECDH('secp256k1'); key.setPrivateKey(Buffer.from(h(index), 'hex')); const pub = key.getPublicKey().toString('hex');
    return { type: 4, rho: h(index + 10), x: pub.slice(2, 66), y: pub.slice(66), value, secret: h(index + 20) };
  };
  const payout = { ...note(4, '120'), randomness: h(5) }; delete payout.type; delete payout.rho;
  const action = { chainDomain: h(6), signerIdentity: h(7), sourceCommitment: h(8), destinationCommitment: h(9),
    amount: '120', custodyKind: 1, custodyCommitment: h(10), executionFrom: '1', executionUntil: '600', settleBefore: '900',
    receiptKeyCommitment: h(11), receiptRho: h(12), deliveryRiskCommitment: h(13), actionSalt: h(14) };
  const proposal = { scope: h(15), policy: h(16), asset: h(17), operationId: h(18), budget: '120',
    fundingNotBefore: '0', fundingValidUntil: '600', settleBefore: '900',
    nodes: [{ id: 'one', dependsOn: [], chainDomain: action.chainDomain, evidencePolicy: h(19),
      actionCommitment: nativeTransferActionCommitment(action), payout }] };
  const input = { ...proposal, reservationNonce: h(20), reserveSecret: h(21), graphNonce: h(22),
    inputNote: note(1, '500'), changeNote: note(2, '380'), recoveryNote: note(3, '120'), paddingSalts: [23, 24, 25, 26].map(h) };
  const compiled = compileFundedGraph(input), statement = compiled.authorizationStatement;
  const invoice = signDeviceMessage(Buffer.from(h(4), 'hex'), payoutInvoiceMessage(statement, compiled.ownerWitness.graph.nodes[0], 0));
  const ownerSignature = signDeviceMessage(Buffer.from(h(1), 'hex'), ownerAuthorizationMessage(statement));
  const capsuleOptions = { nodes: [{ id: 'one', action, receiptSpendSecret: h(27) }],
    slotSalts: [28, 31, 34, 37].map(index => ({ targetSalt: h(index), localCapsuleSalt: h(index + 1), dependencyCapsuleSalt: h(index + 2) })) };
  const witness = normalizeDeviceReservationWitnessV1({ input, ownerSignature, invoiceSignatures: [invoice],
    envelopePreparation: { capsuleOptions, joinBlinds: [40, 41, 42, 43].map(h), leafBlinds: Array.from({ length: 16 }, (_, i) => h(i + 44)) } });
  const custody = { rootId: h(60), noteRevision: 6, encryptedRecordSHA256: h(61),
    frameSHA256: createHash('sha256').update(ownerAuthorizationMessage(statement)).digest('hex'),
    sourceCommitment: statement.inputCommitment, sourceNullifier: statement.inputNullifier,
    changeCommitment: statement.changeCommitment, recoveryCommitment: statement.recoveryCommitment };
  const consent = { version: 1, profile: 'LIANUM_DEVICE_ORIGINAL_US_V1', action: 'PROVE_U',
    origin: access.origin, pairingId: access.pairingId, devicePublicKey: devicePublic, challengeId: h(62), nonce: h(63),
    expiresAt: Date.now() + 15000, binding: review.binding,
    poolTerms: { scope: proposal.scope, policy: proposal.policy, codeHash: h(64), assetIdentity: proposal.asset, domainCommitment: h(65) },
    depositJobId: h(66), quoteId: h(67), jobId: h(68), custody, statement,
    witnessSHA256: createHash('sha256').update(JSON.stringify(witness)).digest('hex'), proofSHA256: null, publicInputsSHA256: null,
    observed: { blockNumber: '1', blockHash: h(69), timestamp: '1' }, openingDisclosure: 'ONE_FUNDED_OWNER_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER' };
  return { access, descriptor: { origin: access.origin, pairingId: access.pairingId, devicePublicKey: devicePublic },
    consent, witness, proposal, capsuleOptions };
}
