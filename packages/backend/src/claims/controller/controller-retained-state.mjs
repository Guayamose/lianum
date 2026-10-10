/** Pure retained-data checks and status projection. A valid checksum or opening
 * grants no handoff brand, proof acceptance, canonicality or native finality.
 * Callers must authenticate the persisted packet and canonical gateway source. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCommitmentCodec, validateStruct, exactRecord, fixedArray, bytes32, ZERO } from '../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../execution/account/preparation/readiness-inputs.mjs';
import { validateDepositIntentStatement, encodeDepositIntentInputs } from '../../execution/account/preparation/deposit-intent.mjs';
import { validateClaimConfig, claimDomainCommitment, claimIntentId, claimTicketId, validateClaimTicket, claimUint, claimDestinationCommitment, claimIngressReceiptCommitment, encodeClaimIngressInputs } from '../protocol/framing.mjs';
import { balanceCommitment } from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { ownerDigest, FLAT_OWNER_CLAIM_HANDOFF_PROFILE, FLAT_OWNER_CLAIM_HANDOFF_TRUST,FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_V2,FLAT_OWNER_PRIVATE_CLAIM_TRUST_V2 } from '../../../../custody/src/signing/flat-owner-custody.mjs';

const PACKET_FIELDS = ['version', 'profile', 'trust', 'ownerIdentitySHA256', 'claimDomain', 'ingressProverIdentity',
  'intentIdentitySHA256', 'revision', 'statement', 'proofResult', 'opening', 'handoffIdentitySHA256'];
const INTENT_FIELDS = ['id', 'state', 'output', 'amount', 'validFrom', 'validUntil', 'revision', 'proofHash', 'nullifier', 'refundDestination'];
const METRICS = ['initializationMilliseconds', 'jobPreparationMilliseconds', 'witnessMilliseconds',
  'proofMilliseconds', 'verificationMilliseconds', 'totalMilliseconds', 'otherMilliseconds'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function proofBytes(value) {
  assert.ok(typeof value === 'string' && value.length <= 2 * 1024 * 1024
    && /^(?:[0-9a-f]{2})+$/.exec(value)?.[0] === value, 'CLAIM_RETAINED_PROOF_BYTES');
  return Buffer.from(value, 'hex');
}
function proofEvidence(evidence, proof) {
  exactRecord(evidence, ['relation', 'role', 'runId', 'jobId', 'proofSHA256', 'keySHA256', 'manifestSHA256', 'metricUnits', 'metrics']);
  assert.equal(evidence.relation, 'deposit_intent', 'CLAIM_RETAINED_PROOF_RELATION');
  assert.equal(evidence.role, 'owner', 'CLAIM_RETAINED_PROOF_ROLE');
  for (const key of ['runId', 'jobId']) assert.ok(typeof evidence[key] === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(evidence[key])?.[0] === evidence[key],
  'CLAIM_RETAINED_PROOF_RUN_ID');
  for (const key of ['proofSHA256', 'keySHA256', 'manifestSHA256']) bytes32(evidence[key], true);
  assert.equal(evidence.proofSHA256, sha(proof), 'CLAIM_RETAINED_PROOF_HASH');
  assert.equal(evidence.metricUnits, 'milliseconds', 'CLAIM_RETAINED_METRIC_UNITS'); exactRecord(evidence.metrics, METRICS);
  for (const value of Object.values(evidence.metrics)) assert.ok(typeof value === 'string' && value.length <= 64
    && Number.isFinite(Number(value)) && Number(value) >= 0 && String(Number(value)) === value, 'CLAIM_RETAINED_METRIC');
}

/** Revalidates the exact persisted packet from an authenticated scoped handoff.
 * It cannot reconstruct an owner identity from the claim config alone; its
 * owner digest remains authenticated by that original handoff and keeper. */
export function validateRetainedClaimPacket(input, options) {
  exactRecord(options, ['config', 'ingressProverIdentity']);
  const config = validateClaimConfig(options.config), expectedProver = bytes32(options.ingressProverIdentity, true);
  const packet = cloneInput(input); exactRecord(packet, PACKET_FIELDS);
  assert.equal(packet.version, 1, 'CLAIM_RETAINED_PACKET_VERSION');
  assert.equal(packet.profile, FLAT_OWNER_CLAIM_HANDOFF_PROFILE, 'CLAIM_RETAINED_PACKET_PROFILE');
  assert.equal(packet.trust, FLAT_OWNER_CLAIM_HANDOFF_TRUST, 'CLAIM_RETAINED_PACKET_TRUST');
  for (const key of ['ownerIdentitySHA256', 'claimDomain', 'ingressProverIdentity', 'intentIdentitySHA256', 'handoffIdentitySHA256']) bytes32(packet[key], true);
  assert.equal(packet.claimDomain, claimDomainCommitment(config), 'CLAIM_RETAINED_PACKET_DOMAIN');
  assert.equal(packet.ingressProverIdentity, expectedProver, 'CLAIM_RETAINED_PACKET_PROVER');
  assert.ok(Number.isSafeInteger(packet.revision) && !Object.is(packet.revision, -0)
    && packet.revision >= 0 && packet.revision <= 32, 'CLAIM_RETAINED_PACKET_REVISION');
  const s = validateDepositIntentStatement(packet.statement);
  assert.equal(s.scope, config.scope, 'CLAIM_RETAINED_PACKET_SCOPE'); assert.equal(s.policy, config.policy, 'CLAIM_RETAINED_PACKET_POLICY');
  exactRecord(packet.proofResult, ['proof', 'publicInputs', 'evidence']);
  assert.deepEqual(packet.proofResult.publicInputs, [...encodeDepositIntentInputs(s)], 'CLAIM_RETAINED_D27_INPUTS');
  proofEvidence(packet.proofResult.evidence, proofBytes(packet.proofResult.proof));
  const opening = packet.opening; exactRecord(opening, ['rho', 'x', 'y', 'value', 'noteSecret']);
  for (const key of ['rho', 'x', 'y']) bytes32(opening[key]); bytes32(opening.noteSecret, true);
  assert.ok(claimUint(opening.value) > 0n, 'CLAIM_RETAINED_OPENING_VALUE');
  assert.equal(opening.value, s.amount, 'CLAIM_RETAINED_OPENING_AMOUNT');
  assert.equal(balanceCommitment(config.scope, config.policy, { type: 4, rho: opening.rho, x: opening.x, y: opening.y,
    value: opening.value, secret: opening.noteSecret }).toString('hex'), s.output, 'CLAIM_RETAINED_ORIGINAL_NOTE');
  assert.equal(packet.intentIdentitySHA256, ownerDigest({ profile: FLAT_OWNER_CLAIM_HANDOFF_PROFILE,
    identitySHA256: packet.ownerIdentitySHA256, claimDomain: packet.claimDomain,
    scope: s.scope, policy: s.policy, amount: s.amount, output: s.output }), 'CLAIM_RETAINED_INTENT_IDENTITY');
  const { handoffIdentitySHA256, ...body } = packet;
  assert.equal(handoffIdentitySHA256, ownerDigest(body), 'CLAIM_RETAINED_HANDOFF_CHECKSUM');
  assert.ok(Buffer.byteLength(JSON.stringify(packet)) <= 2 * 1024 * 1024, 'CLAIM_RETAINED_PACKET_SIZE');
  return frozenInput(packet);
}

/** Private holder V2 authenticated DATA. The real child brand is checked at
 * admission; AEAD keeper provenance remains mandatory on reopen. No opening,
 * root or private spend key is accepted or reconstructed by this validator. */
export function validateRetainedPrivateClaimPacketV2(input,options) {return validatePrivatePacket(input,options,FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_V2,FLAT_OWNER_PRIVATE_CLAIM_TRUST_V2);}
export function validateRetainedDeviceRootClaimPacketV2(input,options) {return validatePrivatePacket(input,options,'ORIGINAL_DEVICE_ROOT_NATIVE_CLAIM_HANDOFF_V2','DEVICE_ROOT_NOTE_NATIVE_BACKEND_LOCAL_QUORUM');}
function validatePrivatePacket(input,options,profile,trust) {
  exactRecord(options,['config','ingressProverIdentity']);const config=validateClaimConfig(options.config),packet=cloneInput(input);
  exactRecord(packet,PACKET_FIELDS.filter(k=>k!=='opening').concat(['receiptBinding']));
  assert.equal(packet.version,2,'CLAIM_PRIVATE_PACKET_VERSION');assert.equal(packet.profile,profile,'CLAIM_PRIVATE_PACKET_PROFILE');assert.equal(packet.trust,trust,'CLAIM_PRIVATE_PACKET_TRUST');
  for(const k of ['ownerIdentitySHA256','claimDomain','ingressProverIdentity','intentIdentitySHA256','handoffIdentitySHA256'])bytes32(packet[k],true);
  assert.equal(packet.claimDomain,claimDomainCommitment(config),'CLAIM_PRIVATE_PACKET_DOMAIN');assert.equal(packet.ingressProverIdentity,bytes32(options.ingressProverIdentity,true),'CLAIM_PRIVATE_PACKET_PROVER');
  assert.equal(packet.revision,0,'CLAIM_PRIVATE_PACKET_NO_RENEWAL');const s=validateDepositIntentStatement(packet.statement);assert.equal(s.scope,config.scope,'CLAIM_PRIVATE_PACKET_SCOPE');assert.equal(s.policy,config.policy,'CLAIM_PRIVATE_PACKET_POLICY');
  exactRecord(packet.proofResult,['proof','publicInputs','evidence']);assert.deepEqual(packet.proofResult.publicInputs,[...encodeDepositIntentInputs(s)],'CLAIM_PRIVATE_PACKET_D27');proofEvidence(packet.proofResult.evidence,proofBytes(packet.proofResult.proof));
  exactRecord(packet.receiptBinding,['secret','refundSalt']);bytes32(packet.receiptBinding.secret,true);bytes32(packet.receiptBinding.refundSalt,true);
  assert.equal(packet.intentIdentitySHA256,ownerDigest({profile:FLAT_OWNER_CLAIM_HANDOFF_PROFILE,identitySHA256:packet.ownerIdentitySHA256,claimDomain:packet.claimDomain,scope:s.scope,policy:s.policy,amount:s.amount,output:s.output}),'CLAIM_PRIVATE_PACKET_ORIGINAL_INTENT');
  const {handoffIdentitySHA256,...body}=packet;assert.equal(handoffIdentitySHA256,ownerDigest(body),'CLAIM_PRIVATE_PACKET_CHECKSUM');assert.ok(Buffer.byteLength(JSON.stringify(packet))<=2*1024*1024,'CLAIM_PRIVATE_PACKET_SIZE');return frozenInput(packet);
}

/** Supply row.refundMaxFee from the authenticated claim config, never from a
 * fee quote or the candidate ticket. Native observation freshness remains the
 * controller's responsibility; this function only projects authenticated data. */
export function canonicalClaimDepositProjection(rawRow, rawGateway) {
  const row = cloneInput(rawRow), gateway = cloneInput(rawGateway);
  bytes32(row.id, true); bytes32(row.claimDomain, true);
  assert.equal(gateway.claimDomain, row.claimDomain, 'CLAIM_PROJECTION_GATEWAY_DOMAIN');
  assert.equal(row.packet.claimDomain, row.claimDomain, 'CLAIM_PROJECTION_PACKET_DOMAIN');
  const s = validateDepositIntentStatement(row.packet.statement);
  assert.deepEqual(row.packet.proofResult.publicInputs, [...encodeDepositIntentInputs(s)], 'CLAIM_PROJECTION_D27_INPUTS');
  const proofHash = sha(proofBytes(row.packet.proofResult.proof));
  assert.equal(row.id, claimIntentId({ claimDomain: row.claimDomain, outputQ: s.output, amount: s.amount }), 'CLAIM_PROJECTION_INTENT_ID');
  assert.ok(Array.isArray(gateway.intents) && gateway.intents.length <= 16 && Array.isArray(gateway.tickets)
    && gateway.tickets.length <= 32, 'CLAIM_PROJECTION_HISTORY_BOUND');
  fixedArray(gateway.intents, gateway.intents.length); fixedArray(gateway.tickets, gateway.tickets.length);
  const matches = gateway.intents.filter(intent => intent.id === row.id);
  if (matches.length === 0) {
    assert.ok(!gateway.intents.some(intent => intent.output === s.output)
      && !gateway.tickets.some(({ ticket }) => ticket.referenceQ === s.output), 'CLAIM_PROJECTION_UNMATCHED_ORIGINAL_Q');
    assert.ok(row.status === 'PREPARED' && row.native === null && !row.issueSubmission && !row.refundTicketId
      && !row.renewalCandidate && row.packet.revision === 0 && (!row.history || row.history.length === 0), 'CLAIM_PROJECTION_MISSING_INTENT');
    return frozenInput({ status: 'PREPARED', intent: null, refund: null, refundTicketId: null });
  }
  assert.equal(matches.length, 1, 'CLAIM_PROJECTION_UNIQUE_INTENT'); const intent = matches[0];
  assert.equal(gateway.intents.filter(item => item.output === s.output).length, 1, 'CLAIM_PROJECTION_UNIQUE_ORIGINAL_Q');
  exactRecord(intent, INTENT_FIELDS); assert.ok(['1', '2', '3'].includes(intent.state), 'CLAIM_PROJECTION_INTENT_STATE');
  assert.ok(claimUint(intent.revision) > 0n, 'CLAIM_PROJECTION_INTENT_REVISION');
  for (const key of ['output', 'amount', 'validFrom', 'validUntil']) assert.equal(intent[key], s[key], 'CLAIM_PROJECTION_ORIGINAL_D27');
  assert.equal(intent.proofHash, proofHash, 'CLAIM_PROJECTION_ORIGINAL_PROOF');
  bytes32(intent.nullifier, intent.state !== '1'); bytes32(intent.refundDestination, intent.state !== '1');
  assert.equal(intent.nullifier === ZERO, intent.refundDestination === ZERO, 'CLAIM_PROJECTION_INTENT_RESERVATION');
  if (intent.nullifier !== ZERO) assert.equal(intent.refundDestination, bytes32(row.refundDestination, true), 'CLAIM_PROJECTION_REFUND_DESTINATION');
  if (row.native?.binding) {
    const binding = row.native.binding;
    assert.equal(binding.claimDomain, row.claimDomain, 'CLAIM_PROJECTION_NATIVE_DOMAIN');
    assert.equal(binding.operationId, row.id, 'CLAIM_PROJECTION_NATIVE_OPERATION');
    assert.equal(binding.ingress, true, 'CLAIM_PROJECTION_NATIVE_KIND');
    assert.equal(binding.admissionN, intent.nullifier, 'CLAIM_PROJECTION_ORIGINAL_N');
  }
  if (intent.state !== '3') {
    assert.ok(!row.refundTicketId, 'CLAIM_PROJECTION_UNEXPECTED_REFUND');
    return frozenInput({ status: intent.state === '2' ? 'ISSUED'
      : row.native?.status === 'OBSERVED' ? 'HELD_UNISSUED' : row.native ? 'UNKNOWN' : 'PREPOSITIONED',
    intent, refund: null, refundTicketId: null });
  }
  assert.ok(claimUint(row.refundMaxFee) > 0n, 'CLAIM_PROJECTION_REFUND_MAX_FEE');
  const references = gateway.tickets.filter(({ ticket }) => ticket.referenceIngressN === intent.nullifier || ticket.referenceQ === intent.output);
  assert.equal(references.length, 1, 'CLAIM_PROJECTION_UNIQUE_REFUND'); const refund = references[0];
  exactRecord(refund, ['ticket', 'state', 'payoutRouteCommitment']); const ticket = validateClaimTicket(refund.ticket);
  assert.equal(ticket.kind, '2', 'CLAIM_PROJECTION_REFUND_KIND'); assert.equal(ticket.claimDomain, row.claimDomain, 'CLAIM_PROJECTION_REFUND_DOMAIN');
  assert.equal(ticket.referenceIngressN, intent.nullifier, 'CLAIM_PROJECTION_REFUND_N');
  assert.equal(ticket.referenceQ, intent.output, 'CLAIM_PROJECTION_REFUND_Q'); assert.equal(ticket.amount, s.amount, 'CLAIM_PROJECTION_REFUND_AMOUNT');
  assert.equal(ticket.destinationCommitment, row.refundDestination, 'CLAIM_PROJECTION_REFUND_DESTINATION');
  assert.equal(ticket.maxFee, row.refundMaxFee, 'CLAIM_PROJECTION_REFUND_FEE');
  assert.equal(ticket.id, claimTicketId({ claimDomain: row.claimDomain, kind: '2',
    nonce: String(gateway.tickets.indexOf(refund)) }), 'CLAIM_PROJECTION_REFUND_TICKET_ID');
  assert.equal(gateway.tickets.filter(item => item.ticket.id === ticket.id).length, 1, 'CLAIM_PROJECTION_UNIQUE_REFUND_ID');
  if (row.refundTicketId !== undefined) assert.equal(row.refundTicketId, ticket.id, 'CLAIM_PROJECTION_ORIGINAL_REFUND_ID');
  assert.ok(['1', '2', '3', '4'].includes(refund.state), 'CLAIM_PROJECTION_REFUND_STATE'); bytes32(refund.payoutRouteCommitment);
  assert.equal(refund.payoutRouteCommitment === ZERO, refund.state === '1', 'CLAIM_PROJECTION_REFUND_ROUTE');
  return frozenInput({ status: refund.state === '4' ? 'REFUNDED' : 'REFUND_PENDING', intent, refund, refundTicketId: ticket.id });
}

import { FACTS_SCHEMA, validateNativeClaimFacts, encodeNativeClaimFacts, nativeClaimFactsDigest,
  receiptKeyCommitment, nativeAdmissionNullifier } from '../../chains/shared/dispatch/native-receipt-binding.mjs';
import { nativeAdmissionRuleRoot, nativeAdmissionRuleCommitment, nativeAdmissionChainDomain }
  from '../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier }
  from '../../../../engine/src/evidence/native-quorum.mjs';

// Public CI51 validation follows the same original framing and quorum source.
// It never accepts an opening or produces a proof, deployment or owner brand.
const ROOT_CLAIM_COMMON_FIELDS=['config','domain','registry','rule','rulePath','certificates','currentRevocation'];
async function deviceRootClaimPublicContext(input,hashFields){
  const config=validateClaimConfig(input.config),domain=validateStruct('domain',input.domain),codec=createCommitmentCodec({hashFields});
  assert.equal(await codec.domainCommitment(domain),config.poolDomain,'CLAIM_POOL_DOMAIN');
  for(const [dk,ck]of [['scope','scope'],['policy','policy'],['asset','wrapperAssetIdentity'],['hubDomain','hubDomain'],['ledgerNamespace','ledgerNamespace'],['registryCommitment','registryCommitment']])assert.equal(domain[dk],config[ck],'CLAIM_CONFIG_DOMAIN');
  const {registry,rule,rulePath}=input;
  assert.equal(registry.hubDomain,config.hubDomain,'CLAIM_REGISTRY_HUB');assert.equal(nativeQuorumRegistryCommitment(registry),config.registryCommitment,'CLAIM_REGISTRY');
  exactRecord(rulePath,['index','siblings']);fixedArray(rulePath.siblings,3);rulePath.siblings.forEach(v=>bytes32(v));assert.ok(claimUint(rulePath.index,8)<8n,'CLAIM_RULE_INDEX');
  assert.equal(nativeAdmissionRuleRoot(rule,rulePath),registry.rulesRoot,'CLAIM_RULE_MEMBERSHIP');assert.equal(nativeAdmissionRuleCommitment(rule),config.nativeRuleCommitment,'CLAIM_RULE_COMMITMENT');
  for(const [k,v]of [['family',config.nativeFamily],['genesis',config.nativeGenesis],['asset',config.nativeAsset]])assert.equal(rule[k],v,'CLAIM_RULE_NATIVE_DOMAIN');
  const policy={ledgerNamespace:config.ledgerNamespace,hubDomain:config.hubDomain,registryCommitment:config.registryCommitment,rule},indexes=[],signatures=[];
  fixedArray(input.certificates,3);let frame,facts;
  for(const c of input.certificates){
    exactRecord(c,['schema','signerIndex','facts','frameHex','digest','signature']);assert.equal(c.schema,FACTS_SCHEMA,'CLAIM_FACTS_SCHEMA');
    const checked=validateNativeClaimFacts(c.facts,policy),encoded=encodeNativeClaimFacts(checked,policy);
    assert.equal(c.frameHex,encoded.toString('hex'),'CLAIM_FACTS_FRAME');assert.equal(c.digest,nativeClaimFactsDigest(checked,policy),'CLAIM_FACTS_DIGEST');assert.equal(encoded.length,829,'CLAIM_FACTS_FRAME_WIDTH');
    if(frame)assert.ok(frame.equals(encoded),'CLAIM_FACTS_DISAGREE');else{frame=encoded;facts=checked;}
    const index=claimUint(c.signerIndex,8);assert.ok(index<4n,'CLAIM_ATTESTER_INDEX');assert.match(c.signature,/^[0-9a-f]{128}$/,'CLAIM_SIGNATURE_ENCODING');indexes.push(Number(index));signatures.push(c.signature);
  }
  createNativeQuorumHostVerifier({registry,expectedRegistryCommitment:policy.registryCommitment}).assertQuorumForMessage({messageBytes:frame,indexes,signatures});
  claimUint(facts.observation.amount);
  const current=input.currentRevocation;exactRecord(current,['revokedDigest','revokedCount','revocationSequence','entries']);fixedArray(current.entries,64);claimUint(current.revokedCount,32);claimUint(current.revocationSequence);
  assert.equal(await codec.revokedDigest(config.poolDomain,config.hubDomain,current.entries,current.revokedCount),current.revokedDigest,'CLAIM_CURRENT_REVOKED_DIGEST');assert.ok(!current.entries.slice(0,Number(current.revokedCount)).includes(facts.nativeGid),'CLAIM_GID_REVOKED');
  const admissionRevocationState=await codec.admissionRevocationState(config.poolDomain,{currentRevokedDigest:current.revokedDigest,currentRevokedCount:current.revokedCount,currentRevocationSequence:current.revocationSequence});
  return{config,codec,facts,claimDomain:claimDomainCommitment(config),admissionRevocationState,nativeChainDomain:nativeAdmissionChainDomain(rule)};
}
/** Original public CI51 join, computed before offering the private recipient.
 * The independent recipient recomputes the same statement from the device's
 * opening. No opening, witness, root or private key enters this function. */
export async function buildDeviceRootClaimIngressPublicV2(raw,options){
 exactRecord(options,['hashFields']);const input=cloneInput(raw);exactRecord(input,[...ROOT_CLAIM_COMMON_FIELDS,'outputQ','amountQ','receiptBinding']);
 bytes32(input.outputQ,true);assert.ok(claimUint(input.amountQ)>0n,'CLAIM_POSITIVE_AMOUNT');exactRecord(input.receiptBinding,['secret','refundSalt']);for(const k of ['secret','refundSalt'])bytes32(input.receiptBinding[k],true);
 const c=await deviceRootClaimPublicContext(input,options.hashFields),o=c.facts.observation;
 assert.equal(o.destinationCommitment,c.config.escrowEndpointCommitment,'CLAIM_INGRESS_ESCROW');assert.equal(o.amount,input.amountQ,'CLAIM_NOTE_AMOUNT');
 const key=receiptKeyCommitment({ledgerNamespace:c.config.ledgerNamespace,secret:input.receiptBinding.secret});assert.equal(key,c.facts.wireKeyCommitment,'CLAIM_INGRESS_WIRE_KEY');
 const admissionN=nativeAdmissionNullifier({ledgerNamespace:c.config.ledgerNamespace,secret:input.receiptBinding.secret,nativeGid:c.facts.nativeGid});bytes32(admissionN,true);
 const refundDestination=claimDestinationCommitment({claimDomain:c.claimDomain,nativeChainDomain:c.nativeChainDomain,endpoint:o.sourceCommitment,amount:input.amountQ,maxFee:c.config.refundMaxFee,salt:input.receiptBinding.refundSalt});
 const receipt=claimIngressReceiptCommitment({claimDomain:c.claimDomain,outputQ:input.outputQ,amount:input.amountQ,admissionN,refundDestination});
 const statement={claimDomain:c.claimDomain,outputQ:input.outputQ,admissionN,refundDestination,admissionRevocationState:c.admissionRevocationState,ingressReceiptLeaf:await c.codec.receiptLeaf(c.config.poolDomain,receipt),amountQ:input.amountQ,evidenceFrom:o.evidenceFrom,evidenceUntil:o.evidenceUntil};
 return frozenInput({statement,expectedPublicInputs:[...encodeClaimIngressInputs(statement)]});
}
