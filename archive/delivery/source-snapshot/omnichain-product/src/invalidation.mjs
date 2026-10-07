/** Signed synthetic invalidations. A pinned local verifier's assertion is not a
 * consensus proof, chain oracle or permission for an unauthenticated producer. */
import { canonical, digest, sign, verify } from './privacy.mjs';

const MAX_EVIDENCE_BYTES = 8192;
function reject(code) { throw Object.assign(new Error(code), { code }); }
function requireValue(value, code) { if (!value) reject(code); }
function fields(value, expected) {
  requireValue(value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key)), 'INVALID_INVALIDATION_SHAPE');
}
function resourceIdentity(receipt) {
  return digest('PAEG/consumed-resource/1', { domain: receipt.domain, chain: receipt.chain, txRef: receipt.txRef, effectIndex: receipt.effectIndex });
}
function locate(state, hash, legId, resource) {
  const operation = state.operations.find((item) => item.hash === hash);
  requireValue(operation, 'INVALIDATION_UNKNOWN_GRAPH');
  const leg = operation.legs.find((item) => item.id === legId);
  requireValue(leg, 'INVALIDATION_UNKNOWN_LEG');
  const observation = resource ? leg.observations.find((item) => item.resource === resource) :
    leg.observations.find((item) => item.resource === leg.resource) ?? leg.observations.find((item) => item.validity === 'CANONICAL');
  requireValue(observation, 'INVALIDATION_UNKNOWN_RESOURCE');
  return { operation, leg, observation };
}

export function invalidationDigest(evidence) { return digest('PAEG/signed-invalidation/1', evidence); }
export function invalidationIdentity(evidence) {
  return digest('PAEG/invalidation-event-identity/1', { payload: evidence.payload, predecessor: evidence.predecessor.payload });
}

export function validateInvalidation(state, hash, evidence, now) {
  // Canonical validation rejects getters/proxies/non-JSON before fields are read.
  requireValue(Buffer.byteLength(canonical(evidence)) <= MAX_EVIDENCE_BYTES, 'INVALIDATION_TOO_LARGE');
  fields(evidence, ['payload', 'predecessor', 'signature']);
  const payload = evidence.payload;
  fields(payload, ['version', 'domain', 'evidenceType', 'graphHash', 'legId', 'resource', 'authorizationDigest',
    'policyDigest', 'verifierFingerprint', 'predecessorDigest', 'observedAt', 'reason']);
  fields(evidence.predecessor, ['payload', 'signature']);
  requireValue(payload.version === 1 && payload.evidenceType === 'simulation-invalidation' && payload.reason === 'FINALITY_ASSUMPTION_BROKEN', 'UNSUPPORTED_INVALIDATION');
  requireValue(payload.graphHash === hash, 'INVALIDATION_WRONG_GRAPH');
  const { operation, leg, observation } = locate(state, hash, payload.legId, payload.resource);
  const provenance = operation.authorization.provenance;
  requireValue(payload.domain === operation.graph.domain && payload.domain === state.domain, 'INVALIDATION_WRONG_DOMAIN');
  requireValue(payload.authorizationDigest === digest('PAEG/authorization-record/1', operation.authorization), 'INVALIDATION_WRONG_AUTHORIZATION');
  requireValue(payload.policyDigest === digest('PAEG/invalidation-policy/1', provenance.policy), 'INVALIDATION_WRONG_POLICY');
  requireValue(payload.verifierFingerprint === provenance.verifierFingerprint &&
    payload.verifierFingerprint === digest('PAEG/local-verifier/1', provenance.verifierPublicKey), 'INVALIDATION_WRONG_VERIFIER');
  requireValue(canonical(evidence.predecessor) === canonical(observation.receipt) &&
    payload.predecessorDigest === digest('PAEG/signed-receipt/1', observation.receipt), 'INVALIDATION_WRONG_PREDECESSOR');
  const predecessor = evidence.predecessor.payload;
  requireValue(predecessor.version === provenance.policy.version && predecessor.domain === provenance.policy.domain &&
    predecessor.evidenceType === provenance.policy.evidenceType && predecessor.finality === provenance.policy.finality, 'INVALIDATION_PREDECESSOR_POLICY');
  requireValue(predecessor.graphHash === hash && predecessor.domain === payload.domain && predecessor.legId === leg.id &&
    resourceIdentity(predecessor) === payload.resource, 'INVALIDATION_WRONG_RESOURCE');
  requireValue(verify(predecessor, evidence.predecessor.signature, provenance.verifierPublicKey), 'INVALIDATION_INVALID_PREDECESSOR_SIGNATURE');
  requireValue(verify(payload, evidence.signature, provenance.verifierPublicKey), 'INVALID_INVALIDATION_SIGNATURE');
  requireValue(Number.isSafeInteger(now) && Number.isSafeInteger(payload.observedAt) &&
    payload.observedAt >= predecessor.observedAt && payload.observedAt <= now, 'INVALID_INVALIDATION_TIME');
  requireValue(['CANONICAL', 'REORGED'].includes(observation.validity), 'INVALID_INVALIDATION_PREDECESSOR_STATE');
  return { legId: leg.id, resource: observation.resource, evidenceDigest: invalidationDigest(evidence),
    alreadyInvalidated: observation.validity === 'REORGED',
    sameRetainedEvent: Boolean(observation.invalidation && invalidationIdentity(observation.invalidation) === invalidationIdentity(evidence)),
    retainedEvidenceDigest: observation.invalidationDigest ?? null };
}

export function simulationInvalidation(state, hash, legId, resource, privateKey, now) {
  const { operation, observation } = locate(state, hash, legId, resource);
  const payload = {
    version: 1, domain: operation.graph.domain, evidenceType: 'simulation-invalidation', graphHash: hash,
    legId, resource: observation.resource,
    authorizationDigest: digest('PAEG/authorization-record/1', operation.authorization),
    policyDigest: digest('PAEG/invalidation-policy/1', operation.authorization.provenance.policy),
    verifierFingerprint: operation.authorization.provenance.verifierFingerprint,
    predecessorDigest: digest('PAEG/signed-receipt/1', observation.receipt), observedAt: now,
    reason: 'FINALITY_ASSUMPTION_BROKEN',
  };
  return { payload, predecessor: structuredClone(observation.receipt), signature: sign(payload, privateKey) };
}
