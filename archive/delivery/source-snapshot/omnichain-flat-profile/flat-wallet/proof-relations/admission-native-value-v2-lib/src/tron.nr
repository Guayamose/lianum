// Registered historical-permission replay + solidified-native TRX predicate.
// The ECDSA quorum authenticates independently checked native observations, not
// a circuit proof of java-tron state/consensus. No permission-success flag exists.
use native_support::receipt;
use admission_support::framing as legacy;
use crate::types::{TronProfile, Observation, Wire, Evidence};
use crate::{facts, framing};
pub fn assert_profile(profile: TronProfile) {
    assert(profile.version == 2);
    assert(profile.genesis != [0; 32]); assert(profile.asset != [0; 32]);
    assert(profile.source_set_root != [0; 32]);
    assert(profile.finality_policy == [219, 39, 103, 190, 233, 231, 187, 62, 184, 111, 88, 159, 109, 145, 41, 36, 175, 19, 59, 26, 2, 169, 230, 129, 119, 43, 149, 65, 250, 235, 167, 249]);
    assert(profile.permission_policy == [138, 38, 30, 138, 199, 242, 27, 226, 245, 138, 73, 69, 2, 37, 127, 171, 196, 117, 96, 98, 97, 161, 97, 11, 100, 27, 195, 172, 205, 148, 80, 35]);
    assert(profile.tapos_expiry_policy == [8, 62, 11, 72, 69, 155, 247, 225, 45, 6, 50, 13, 150, 252, 49, 54, 61, 33, 104, 9, 13, 58, 51, 78, 255, 108, 245, 39, 58, 96, 246, 220]);
    assert(profile.obligation == [180, 63, 153, 215, 137, 58, 137, 192, 5, 43, 49, 214, 69, 31, 123, 244, 75, 79, 143, 166, 216, 5, 50, 251, 79, 43, 68, 5, 15, 139, 127, 139]);
    assert((profile.maximum_ancestry > 0) & (profile.maximum_ancestry <= 256));
    assert(profile.maximum_tapos_distance <= 256);
    assert((profile.maximum_evidence_lifetime > 0) & (profile.maximum_evidence_lifetime <= 300));
    assert((profile.maximum_block_age_ms > 0) & (profile.maximum_block_age_ms <= 86400000));
    assert(profile.maximum_clock_skew_ms <= 30000);
    assert((profile.maximum_query_ms > 0) & (profile.maximum_query_ms <= 60000));
}
pub fn assert_native_facts(profile: TronProfile, effect: receipt::NativeEffect,
    wire: Wire, observed: Observation, evidence: Evidence) -> [u8; 32] {
    assert_profile(profile);
    assert(effect.family == 4); // existing canonical TRON label, no new kind
    assert(effect.genesis == profile.genesis); assert(effect.asset == profile.asset);
    assert(effect.transaction_id != [0; 64]);
    for i in 32..64 { assert(effect.transaction_id[i] == 0); } assert(effect.effect_index == 0);
    let gid = receipt::native_global_effect_id(effect);
    assert(gid != [0; 32]); assert(wire.transaction_sha256 != [0; 32]);
    assert(wire.wire_key_commitment != [0; 32]); assert(observed.block_id != [0; 32]);
    assert(observed.block_height > 0);
    assert(observed.source_commitment != [0; 32]); assert(observed.destination_commitment != [0; 32]);
    assert(observed.source_commitment != observed.destination_commitment);
    assert((observed.amount > 0) & (observed.amount <= 9223372036854775807));
    assert(observed.custody_kind == 1);
    let old = facts::legacy_observation(observed); let chain = framing::tron_chain_domain(profile);
    assert(observed.custody_commitment == legacy::native_custody_commitment(chain, old));
    assert(observed.state_commitment == legacy::observed_effect_commitment(chain, gid, wire.transaction_sha256, old));
    assert(observed.evidence_from == observed.observed_at);
    assert(observed.observed_at <= 18446744073709551615 - profile.maximum_evidence_lifetime);
    assert(observed.evidence_until == observed.observed_at + profile.maximum_evidence_lifetime);
    assert(observed.evidence_from < observed.evidence_until);
    assert(evidence.finalized_block_id != [0; 32]);
    assert(evidence.finalized_block_height >= observed.block_height);
    assert(evidence.finalized_block_height - observed.block_height <= profile.maximum_ancestry as u64);
    if evidence.finalized_block_height == observed.block_height { assert(evidence.finalized_block_id == observed.block_id); }
    assert(evidence.execution_evidence_commitment != [0; 32]);
    assert(evidence.finality_evidence_commitment != [0; 32]);
    gid
}
