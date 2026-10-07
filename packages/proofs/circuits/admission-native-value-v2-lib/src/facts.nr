// Federated exact-K successful endpoint execution, not custody or L1 consensus.
use native_support::{receipt, state};
use admission_support::{statement, framing as legacy_framing};
use crate::types::{Profile, Source, Observation, Wire, Evidence};
use crate::framing;
pub fn assert_profile(profile: Profile) {
    assert(profile.version == 2);
    assert(profile.genesis != [0; 32]);
    assert(profile.asset != [0; 32]);
    assert(profile.source_set_root != [0; 32]);
    if profile.chain_id == 1 { assert(profile.finality_policy == [121, 53, 222, 151, 151, 109, 247, 208, 183, 235, 143, 53, 42, 137, 141, 187, 89, 55, 130, 75, 106, 42, 129, 180, 180, 152, 132, 115, 86, 138, 138, 222]); }
    else if profile.chain_id == 8453 { assert(profile.finality_policy == [80, 125, 212, 229, 29, 253, 93, 74, 83, 15, 97, 135, 198, 101, 191, 89, 234, 245, 202, 52, 215, 84, 215, 46, 93, 95, 2, 255, 103, 34, 199, 255]); }
    else if profile.chain_id == 42161 { assert(profile.finality_policy == [230, 13, 59, 177, 201, 92, 134, 213, 60, 83, 18, 132, 35, 145, 244, 135, 226, 145, 71, 123, 113, 65, 233, 9, 176, 215, 197, 180, 81, 186, 23, 184]); }
    else if profile.chain_id == 56 { assert(profile.finality_policy == [243, 209, 135, 201, 77, 17, 74, 16, 127, 93, 106, 105, 155, 215, 133, 128, 79, 55, 73, 212, 93, 66, 34, 118, 92, 167, 192, 151, 78, 249, 77, 138]); }
    else { assert(false); }
    assert(profile.trace_policy == [170, 10, 108, 52, 160, 131, 239, 94, 190, 219, 240, 248, 22, 154, 69, 229, 108, 78, 87, 104, 114, 90, 226, 83, 64, 217, 188, 201, 27, 181, 232, 166]);
    assert(profile.obligation == [245, 184, 239, 208, 216, 185, 182, 105, 158, 105, 132, 181, 0, 100, 23, 74, 18, 24, 168, 239, 171, 38, 218, 35, 166, 201, 208, 234, 86, 30, 51, 186]);
    assert((profile.maximum_ancestry > 0) & (profile.maximum_ancestry <= 256));
    assert((profile.maximum_evidence_lifetime > 0) & (profile.maximum_evidence_lifetime <= 300));
    assert((profile.maximum_block_age_ms > 0) & (profile.maximum_block_age_ms <= 86400000));
    assert(profile.maximum_clock_skew_ms <= 30000);
    assert((profile.maximum_query_ms > 0) & (profile.maximum_query_ms <= 60000));
}
// Source identities are private witness material from authenticated deployment,
// tied to the very same ordered signer positions used by the ECDSA quorum.
pub fn assert_source(profile: Profile, source: Source, index: u8, siblings: [[u8; 32]; 2]) {
    assert_source_set(profile.source_set_root, source, index, siblings);
}
pub fn assert_source_set(source_set_root: [u8; 32], source: Source, index: u8, siblings: [[u8; 32]; 2]) {
    assert(source_set_root != [0; 32]);
    assert(index < 4);
    assert(source.operator_identity != [0; 32]);
    assert(source.endpoint_identity != [0; 32]);
    assert(source.client_release != [0; 32]);
    assert(source.chain_configuration != [0; 32]);
    let mut root = framing::source_commitment(source);
    for depth in 0..2 {
        root = if (((index as u32) >> depth) & 1) == 0 {
            state::node_hash(root, siblings[depth])
        } else { state::node_hash(siblings[depth], root) };
    }
    assert(root == source_set_root);
}
// These two unused legacy members are zero only in this private conversion for
// unchanged endpoint/effect hashes. They are absent from every V2 wire frame.
pub fn legacy_observation(observed: Observation) -> statement::Observation {
    statement::Observation {
        block_id: observed.block_id, state_commitment: observed.state_commitment,
        block_height: observed.block_height, observed_at: observed.observed_at,
        finality_kind: 0, confirmations: 0,
        source_commitment: observed.source_commitment,
        destination_commitment: observed.destination_commitment, amount: observed.amount,
        custody_kind: observed.custody_kind, custody_commitment: observed.custody_commitment,
        evidence_from: observed.evidence_from, evidence_until: observed.evidence_until,
    }
}
pub fn assert_native_facts(profile: Profile, effect: receipt::NativeEffect,
    wire: Wire, observed: Observation, evidence: Evidence) -> [u8; 32] {
    assert_profile(profile);
    assert(effect.family == 3); // unchanged canonical EVM identity, not a new wire kind
    assert(effect.genesis == profile.genesis);
    assert(effect.asset == profile.asset);
    assert(effect.transaction_id != [0; 64]);
    for i in 32..64 { assert(effect.transaction_id[i] == 0); }
    assert(effect.effect_index == 0);
    let gid = receipt::native_global_effect_id(effect);
    assert(gid != [0; 32]);
    assert(wire.transaction_sha256 != [0; 32]);
    assert(wire.wire_key_commitment != [0; 32]);
    assert(observed.block_id != [0; 32]);
    assert(observed.source_commitment != [0; 32]);
    assert(observed.destination_commitment != [0; 32]);
    assert(observed.source_commitment != observed.destination_commitment);
    assert(observed.amount > 0);
    assert(observed.custody_kind == 1);
    let old = legacy_observation(observed);
    let chain = framing::chain_domain(profile);
    assert(observed.custody_commitment == legacy_framing::native_custody_commitment(chain, old));
    assert(observed.state_commitment == legacy_framing::observed_effect_commitment(chain, gid, wire.transaction_sha256, old));
    assert(observed.evidence_from == observed.observed_at);
    assert(observed.observed_at <= 18446744073709551615 - profile.maximum_evidence_lifetime);
    assert(observed.evidence_until == observed.observed_at + profile.maximum_evidence_lifetime);
    assert(observed.evidence_from < observed.evidence_until);
    assert(evidence.finalized_block_id != [0; 32]);
    assert(evidence.finalized_block_height >= observed.block_height);
    assert(evidence.finalized_block_height - observed.block_height <= profile.maximum_ancestry as u64);
    if evidence.finalized_block_height == observed.block_height {
        assert(evidence.finalized_block_id == observed.block_id);
    }
    assert(evidence.execution_evidence_commitment != [0; 32]);
    assert(evidence.finality_evidence_commitment != [0; 32]);
    gid
}
