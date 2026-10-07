// Exact new purposes 16/17. Every hash passes the literal WHOLE array size,
// not payloadFieldCount. Frozen purposes 1-10 and native SHA codecs are reused.
use poseidon::poseidon2::Poseidon2;
use poseidon_support::encoding::{PROFILE, raw_digest_limbs};
use crate::types::ReadyDescriptor;

// Payload: D:F,E:F,targetContext:B32,G:F,checkpoint:B32,state:F,
// readyFrom:u64,readyUntil:u64,targetJoinBlind:B32 = 12 fields, N = 16.
pub fn join_commitment(
    domain: Field,
    envelope: Field,
    target_context: [u8; 32],
    authorization_root: Field,
    checkpoint: [u8; 32],
    readiness_evidence_state: Field,
    ready_from: u64,
    ready_until: u64,
    target_join_blind: [u8; 32],
) -> Field {
    assert(domain != 0);
    assert(envelope != 0);
    assert(target_context != [0; 32]);
    assert(target_join_blind != [0; 32]);
    assert(ready_from < ready_until);
    let context = raw_digest_limbs(target_context);
    let snapshot = raw_digest_limbs(checkpoint);
    let blind = raw_digest_limbs(target_join_blind);
    let input: [Field; 16] = [
        PROFILE, 1, 16, 12,
        domain, envelope, context[0], context[1], authorization_root,
        snapshot[0], snapshot[1], readiness_evidence_state,
        ready_from as Field, ready_until as Field, blind[0], blind[1],
    ];
    Poseidon2::hash(input, 16)
}

// Payload: D:F,J:F,blind:B32,complete twelve-B32 R98 descriptor,
// readyFrom:u64,readyUntil:u64 = 30 fields, N = 34.
// I must open this exact function, not a shortened descriptor or host flag.
pub fn readiness_commitment(
    domain: Field,
    join: Field,
    blind: [u8; 32],
    descriptor: ReadyDescriptor,
) -> Field {
    assert(domain != 0);
    assert(blind != [0; 32]);
    assert(descriptor.ready_from < descriptor.ready_until);
    let blinding = raw_digest_limbs(blind);
    let scope = raw_digest_limbs(descriptor.scope);
    let policy = raw_digest_limbs(descriptor.policy);
    let asset = raw_digest_limbs(descriptor.asset);
    let hub = raw_digest_limbs(descriptor.hub_domain);
    let registry = raw_digest_limbs(descriptor.registry_commitment);
    let snapshot = raw_digest_limbs(descriptor.snapshot_digest);
    let local = raw_digest_limbs(descriptor.local_commitment);
    let dispatch = raw_digest_limbs(descriptor.dispatch_id);
    let chain = raw_digest_limbs(descriptor.chain_domain);
    let evidence_policy = raw_digest_limbs(descriptor.evidence_policy);
    let action = raw_digest_limbs(descriptor.action_commitment);
    let payout = raw_digest_limbs(descriptor.payout_commitment);
    let input: [Field; 34] = [
        PROFILE, 1, 17, 30,
        domain, join, blinding[0], blinding[1],
        scope[0], scope[1], policy[0], policy[1], asset[0], asset[1],
        hub[0], hub[1], registry[0], registry[1], snapshot[0], snapshot[1],
        local[0], local[1], dispatch[0], dispatch[1], chain[0], chain[1],
        evidence_policy[0], evidence_policy[1], action[0], action[1],
        payout[0], payout[1], descriptor.ready_from as Field, descriptor.ready_until as Field,
    ];
    Poseidon2::hash(input, 34)
}
