// Explicit V2 H4 codecs. Legacy SHA K/GID/N/Action and Poseidon2 domains are unchanged.
use graph_support::sha256::{sha256, u32_bytes, u64_bytes};
use native_support::quorum;
use native_support::receipt::NativeEffect;
use poseidon_support::types::Domain;
use crate::types::{Profile, TronProfile, Source, Observation, Wire, Evidence};
fn part<let N: u32, let M: u32>(buffer: [u8; N], offset: u32, value: [u8; M]) -> [u8; N] {
    assert(offset + 4 + M <= N);
    let mut result = buffer;
    let length = u32_bytes(M);
    for i in 0..4 { result[offset + i] = length[i]; }
    for i in 0..M { result[offset + 4 + i] = value[i]; }
    result
}
fn u128_bytes(value: u128) -> [u8; 16] {
    let mut result: [u8; 16] = [0; 16];
    for i in 0..16 { result[i] = (value >> (((15 - i) * 8) as u128)) as u8; }
    result
}

pub fn profile_commitment(profile: Profile) -> [u8; 32] {
    let mut message: [u8; 373] = [0; 373];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 110, 97, 116, 105, 118, 101, 45, 118, 97, 108, 117, 101, 45, 115, 111, 117, 114, 99, 101, 45, 112, 114, 111, 102, 105, 108, 101, 47, 50]);
    message = part(message, 40, [76, 73, 65, 78, 85, 77, 95, 78, 65, 84, 73, 86, 69, 95, 86, 65, 76, 85, 69, 95, 83, 79, 85, 82, 67, 69, 95, 80, 82, 79, 70, 73, 76, 69, 95, 86, 50]);
    message = part(message, 81, u32_bytes(profile.version));
    message = part(message, 89, u64_bytes(profile.chain_id));
    message = part(message, 101, profile.genesis);
    message = part(message, 137, profile.asset);
    message = part(message, 173, profile.source_set_root);
    message = part(message, 209, profile.finality_policy);
    message = part(message, 245, profile.trace_policy);
    message = part(message, 281, profile.obligation);
    message = part(message, 317, u32_bytes(profile.maximum_ancestry));
    message = part(message, 325, u64_bytes(profile.maximum_evidence_lifetime));
    message = part(message, 337, u64_bytes(profile.maximum_block_age_ms));
    message = part(message, 349, u64_bytes(profile.maximum_clock_skew_ms));
    message = part(message, 361, u64_bytes(profile.maximum_query_ms));
    sha256::<373, 384>(message)
}

pub fn source_commitment(source: Source) -> [u8; 32] {
    let mut message: [u8; 176] = [0; 176];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 110, 97, 116, 105, 118, 101, 45, 118, 97, 108, 117, 101, 45, 115, 111, 117, 114, 99, 101, 47, 50]);
    message = part(message, 32, source.operator_identity);
    message = part(message, 68, source.endpoint_identity);
    message = part(message, 104, source.client_release);
    message = part(message, 140, source.chain_configuration);
    sha256::<176, 192>(message)
}

pub fn registry_commitment(registry: quorum::Registry) -> [u8; 32] {
    let mut message: [u8; 229] = [0; 229];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 110, 97, 116, 105, 118, 101, 45, 97, 100, 97, 112, 116, 101, 114, 45, 114, 101, 103, 105, 115, 116, 114, 121, 47, 50]);
    message = part(message, 36, [76, 73, 65, 78, 85, 77, 95, 78, 65, 84, 73, 86, 69, 95, 65, 68, 65, 80, 84, 69, 82, 95, 82, 69, 71, 73, 83, 84, 82, 89, 95, 86, 50]);
    message = part(message, 73, [82, 88, 233, 31, 90, 150, 209, 19, 105, 146, 2, 244, 98, 202, 198, 20, 97, 57, 135, 250, 190, 201, 91, 180, 62, 184, 221, 4, 176, 191, 217, 121]);
    message = part(message, 109, registry.hub_domain);
    message = part(message, 145, u64_bytes(registry.epoch));
    message = part(message, 157, quorum::registry_commitment(registry));
    message = part(message, 193, registry.rules_root);
    sha256::<229, 256>(message)
}

pub fn chain_domain(profile: Profile) -> [u8; 32] {
    let mut message: [u8; 106] = [0; 106];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 101, 118, 105, 100, 101, 110, 99, 101, 45, 99, 104, 97, 105, 110, 47, 49]);
    message = part(message, 27, [69, 86, 77]);
    message = part(message, 34, profile.genesis);
    message = part(message, 70, profile.asset);
    sha256::<106, 128>(message)
}

pub fn facts_statement(domain: Domain, registry_epoch: u64, profile: Profile, effect: NativeEffect, gid: [u8; 32], wire: Wire, observed: Observation, evidence: Evidence) -> [u8; 32] {
    let mut message: [u8; 897] = [0; 897];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 110, 97, 116, 105, 118, 101, 45, 102, 97, 99, 116, 115, 47, 101, 118, 109, 45, 118, 97, 108, 117, 101, 47, 50]);
    message = part(message, 35, [76, 73, 65, 78, 85, 77, 95, 69, 86, 77, 95, 78, 65, 84, 73, 86, 69, 95, 86, 65, 76, 85, 69, 95, 70, 65, 67, 84, 83, 95, 86, 50]);
    message = part(message, 71, domain.ledger_namespace);
    message = part(message, 107, domain.hub_domain);
    message = part(message, 143, domain.registry_commitment);
    message = part(message, 179, u64_bytes(registry_epoch));
    message = part(message, 191, profile_commitment(profile));
    message = part(message, 227, profile.source_set_root);
    message = part(message, 263, [effect.family]);
    message = part(message, 268, effect.genesis);
    message = part(message, 304, effect.asset);
    message = part(message, 340, effect.transaction_id);
    message = part(message, 408, u32_bytes(effect.effect_index));
    message = part(message, 416, gid);
    message = part(message, 452, wire.transaction_sha256);
    message = part(message, 488, wire.wire_key_commitment);
    message = part(message, 524, observed.block_id);
    message = part(message, 560, observed.state_commitment);
    message = part(message, 596, u64_bytes(observed.block_height));
    message = part(message, 608, u64_bytes(observed.observed_at));
    message = part(message, 620, observed.source_commitment);
    message = part(message, 656, observed.destination_commitment);
    message = part(message, 692, u128_bytes(observed.amount));
    message = part(message, 712, [observed.custody_kind]);
    message = part(message, 717, observed.custody_commitment);
    message = part(message, 753, u64_bytes(observed.evidence_from));
    message = part(message, 765, u64_bytes(observed.evidence_until));
    message = part(message, 777, evidence.finalized_block_id);
    message = part(message, 813, u64_bytes(evidence.finalized_block_height));
    message = part(message, 825, evidence.execution_evidence_commitment);
    message = part(message, 861, evidence.finality_evidence_commitment);
    sha256::<897, 960>(message)
}

pub fn tron_profile_commitment(profile: TronProfile) -> [u8; 32] {
    let mut message: [u8; 415] = [0; 415];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 116, 114, 111, 110, 45, 110, 97, 116, 105, 118, 101, 45, 118, 97, 108, 117, 101, 45, 115, 111, 117, 114, 99, 101, 45, 112, 114, 111, 102, 105, 108, 101, 47, 50]);
    message = part(message, 45, [76, 73, 65, 78, 85, 77, 95, 84, 82, 79, 78, 95, 78, 65, 84, 73, 86, 69, 95, 86, 65, 76, 85, 69, 95, 83, 79, 85, 82, 67, 69, 95, 80, 82, 79, 70, 73, 76, 69, 95, 86, 50]);
    message = part(message, 91, u32_bytes(profile.version));
    message = part(message, 99, profile.genesis);
    message = part(message, 135, profile.asset);
    message = part(message, 171, profile.source_set_root);
    message = part(message, 207, profile.finality_policy);
    message = part(message, 243, profile.permission_policy);
    message = part(message, 279, profile.tapos_expiry_policy);
    message = part(message, 315, profile.obligation);
    message = part(message, 351, u32_bytes(profile.maximum_ancestry));
    message = part(message, 359, u32_bytes(profile.maximum_tapos_distance));
    message = part(message, 367, u64_bytes(profile.maximum_evidence_lifetime));
    message = part(message, 379, u64_bytes(profile.maximum_block_age_ms));
    message = part(message, 391, u64_bytes(profile.maximum_clock_skew_ms));
    message = part(message, 403, u64_bytes(profile.maximum_query_ms));
    sha256::<415, 448>(message)
}

pub fn tron_chain_domain(profile: TronProfile) -> [u8; 32] {
    let mut message: [u8; 107] = [0; 107];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 101, 118, 105, 100, 101, 110, 99, 101, 45, 99, 104, 97, 105, 110, 47, 49]);
    message = part(message, 27, [84, 82, 79, 78]);
    message = part(message, 35, profile.genesis);
    message = part(message, 71, profile.asset);
    sha256::<107, 128>(message)
}

pub fn tron_facts_statement(domain: Domain, registry_epoch: u64, profile: TronProfile, effect: NativeEffect, gid: [u8; 32], wire: Wire, observed: Observation, evidence: Evidence) -> [u8; 32] {
    let mut message: [u8; 899] = [0; 899];
    message = part(message, 0, [76, 73, 65, 78, 85, 77, 47, 110, 97, 116, 105, 118, 101, 45, 102, 97, 99, 116, 115, 47, 116, 114, 111, 110, 45, 118, 97, 108, 117, 101, 47, 50]);
    message = part(message, 36, [76, 73, 65, 78, 85, 77, 95, 84, 82, 79, 78, 95, 78, 65, 84, 73, 86, 69, 95, 86, 65, 76, 85, 69, 95, 70, 65, 67, 84, 83, 95, 86, 50]);
    message = part(message, 73, domain.ledger_namespace);
    message = part(message, 109, domain.hub_domain);
    message = part(message, 145, domain.registry_commitment);
    message = part(message, 181, u64_bytes(registry_epoch));
    message = part(message, 193, tron_profile_commitment(profile));
    message = part(message, 229, profile.source_set_root);
    message = part(message, 265, [effect.family]);
    message = part(message, 270, effect.genesis);
    message = part(message, 306, effect.asset);
    message = part(message, 342, effect.transaction_id);
    message = part(message, 410, u32_bytes(effect.effect_index));
    message = part(message, 418, gid);
    message = part(message, 454, wire.transaction_sha256);
    message = part(message, 490, wire.wire_key_commitment);
    message = part(message, 526, observed.block_id);
    message = part(message, 562, observed.state_commitment);
    message = part(message, 598, u64_bytes(observed.block_height));
    message = part(message, 610, u64_bytes(observed.observed_at));
    message = part(message, 622, observed.source_commitment);
    message = part(message, 658, observed.destination_commitment);
    message = part(message, 694, u128_bytes(observed.amount));
    message = part(message, 714, [observed.custody_kind]);
    message = part(message, 719, observed.custody_commitment);
    message = part(message, 755, u64_bytes(observed.evidence_from));
    message = part(message, 767, u64_bytes(observed.evidence_until));
    message = part(message, 779, evidence.finalized_block_id);
    message = part(message, 815, u64_bytes(evidence.finalized_block_height));
    message = part(message, 827, evidence.execution_evidence_commitment);
    message = part(message, 863, evidence.finality_evidence_commitment);
    sha256::<899, 960>(message)
}
