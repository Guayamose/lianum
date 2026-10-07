use poseidon_support::{encoding, framing, merkle};
use poseidon_support::state as internal_state;
use poseidon_support::types::{Domain, Core};
use native_support::{state, receipt};
use graph_support::sha256::{words_to_bytes, sha256, u32_bytes};

// Both actors authenticate the same complete domain, registered envelope and
// Core. Their own typed leaf is authenticated separately in each relation.
pub fn assert_authorized_core(
    domain_commitment: [u32; 8],
    authorization_root: [u32; 8],
    domain: Domain,
    envelope: [u8; 32],
    authorization_siblings: [[u8; 32]; 6],
    authorization_index: u32,
    core: Core,
    core_blind: [u8; 32],
    core_siblings: [[u8; 32]; 4],
) -> (Field, Field, Field) {
    let domain_value = encoding::canonical_field(words_to_bytes(domain_commitment));
    let authorization_value = encoding::canonical_field(words_to_bytes(authorization_root));
    let envelope_value = encoding::canonical_field(envelope);
    assert(domain_value != 0);
    assert(envelope_value != 0);
    assert(framing::domain_commitment(domain) == domain_value);
    merkle::membership::<6>(domain_value, 0,
        framing::authorization_leaf(domain_value, envelope_value),
        authorization_siblings, authorization_index, authorization_value);
    assert(core.context != [0; 32]);
    assert(core.reserve_commitment != [0; 32]);
    assert(core.reserve_nullifier != [0; 32]);
    merkle::membership::<4>(domain_value, 1,
        framing::core_leaf(domain_value, core, core_blind), core_siblings, 0, envelope_value);
    (domain_value, authorization_value, envelope_value)
}

// The SHA checkpoint commits the entire original Snapshot shape. Its receipt
// root/revoked digest are canonical internal Poseidon F bytes in this profile.
// SHA hashing of Snapshot, pool root and pool-spent digest remains unchanged.
pub fn assert_readiness_snapshot(
    domain_value: Field,
    domain: Domain,
    snapshot: state::Snapshot,
    checkpoint: [u8; 32],
    readiness_evidence_state: Field,
    ready_from: u64,
    ready_until: u64,
) {
    assert(snapshot.hub_domain == domain.hub_domain);
    assert(snapshot.registry_commitment == domain.registry_commitment);
    assert(snapshot.scope == domain.scope);
    assert(snapshot.policy == domain.policy);
    assert(snapshot.asset_identity == domain.asset);
    assert(snapshot.halt == 0);
    assert(ready_from < ready_until);
    assert(ready_from <= snapshot.timestamp);
    assert(snapshot.timestamp < ready_until);
    assert(state::snapshot_digest(snapshot) == checkpoint);
    let evidence = state::EvidenceState {
        hub_domain: snapshot.hub_domain,
        registry_commitment: snapshot.registry_commitment,
        receipt_root: snapshot.receipt_root,
        receipt_count: snapshot.receipt_count,
        revoked_digest: snapshot.revoked_digest,
        revoked_count: snapshot.revoked_count,
        revocation_sequence: snapshot.revocation_sequence,
    };
    assert(internal_state::evidence_state_digest(domain_value, evidence) == readiness_evidence_state);
}

// Exact original R98 reserve-unspent helper: canonical SHA vector, bounded
// count, nonzero prefix, zero tail, and target absence. Like original R98 this
// deliberately relies on the authenticated append-only pool for uniqueness;
// it does not silently relax the general vector codec elsewhere.
pub fn assert_reserve_unspent(
    scope: [u8; 32],
    entries: [[u8; 32]; 64],
    count: u32,
    expected_digest: [u8; 32],
    target: [u8; 32],
) {
    assert(count <= 64);
    assert(target != [0; 32]);
    let mut message: [u8; 2085] = [0; 2085];
    message[0] = 0x02;
    for i in 0..32 { message[1 + i] = scope[i]; }
    let encoded_count = u32_bytes(count);
    for i in 0..4 { message[33 + i] = encoded_count[i]; }
    for i in 0..64 {
        if i < count {
            assert(entries[i] != [0; 32]);
            assert(entries[i] != target);
        } else { assert(entries[i] == [0; 32]); }
        for j in 0..32 { message[37 + i * 32 + j] = entries[i][j]; }
    }
    assert(sha256::<2085, 2112>(message) == expected_digest);
}

pub fn zero_receipt(value: receipt::ReceiptRead) {
    assert(value.hub_domain == [0; 32]);
    assert(value.registry_commitment == [0; 32]);
    assert(value.global_effect_id == [0; 32]);
    assert(value.scope == [0; 32]);
    assert(value.policy == [0; 32]);
    assert(value.local_commitment == [0; 32]);
    assert(value.dispatch_id == [0; 32]);
    assert(value.chain_domain == [0; 32]);
    assert(value.evidence_policy == [0; 32]);
    assert(value.action_commitment == [0; 32]);
    assert(value.payout_commitment == [0; 32]);
    assert(value.valid_from == 0);
    assert(value.valid_until == 0);
    assert(value.receipt_key_commitment == [0; 32]);
    assert(value.receipt_rho == [0; 32]);
}
