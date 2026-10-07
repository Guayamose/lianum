// Byte-exact SHA H4 messages and fixed Poseidon2 purpose 18.
// statement.nr is an unchanged copy of the original registered provider/rule
// framing. Its old observer attestation function is intentionally never called.
use graph_support::sha256::{sha256, u32_bytes, u64_bytes};
use native_support::receipt::NativeEffect;
use poseidon_support::encoding::PROFILE;
use poseidon_support::types::Domain;
use poseidon::poseidon2::Poseidon2;
use readiness_support::types::ReadyDescriptor;
use crate::statement::Observation;
use crate::types::{WireBinding, NativeContext};

// LIANUM/native-facts/1
global FACTS_TAG: [u8; 21] = [76, 73, 65, 78, 85, 77, 47, 110, 97, 116, 105, 118, 101, 45, 102, 97, 99, 116, 115, 47, 49];
// LIANUM_FLAT_NATIVE_FACTS_V1
global FACTS_SCHEMA: [u8; 27] = [76, 73, 65, 78, 85, 77, 95, 70, 76, 65, 84, 95, 78, 65, 84, 73, 86, 69, 95, 70, 65, 67, 84, 83, 95, 86, 49];
// LIANUM/PAEG/native-admission-nullifier/1
global ADMISSION_TAG: [u8; 40] = [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 97, 100, 109, 105, 115, 115, 105, 111, 110, 45, 110, 117, 108, 108, 105, 102, 105, 101, 114, 47, 49];
// LIANUM_PAEG_NATIVE_4_V2
global LEGACY_PROFILE: [u8; 23] = [76, 73, 65, 78, 85, 77, 95, 80, 65, 69, 71, 95, 78, 65, 84, 73, 86, 69, 95, 52, 95, 86, 50];
// LIANUM/PAEG/native-recipient-custody/2
global CUSTODY_TAG: [u8; 38] = [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 110, 97, 116, 105, 118, 101, 45, 114, 101, 99, 105, 112, 105, 101, 110, 116, 45, 99, 117, 115, 116, 111, 100, 121, 47, 50];
// LIANUM/PAEG/local-native-observed-effect/2
global OBSERVED_EFFECT_TAG: [u8; 42] = [76, 73, 65, 78, 85, 77, 47, 80, 65, 69, 71, 47, 108, 111, 99, 97, 108, 45, 110, 97, 116, 105, 118, 101, 45, 111, 98, 115, 101, 114, 118, 101, 100, 45, 101, 102, 102, 101, 99, 116, 47, 50];

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

// Reconstruct the original 96 big-endian u32 digest limbs plus two u64s from
// the ONE descriptor opened under L. No alternate ready_inputs witness exists.
pub fn ready_inputs(descriptor: ReadyDescriptor) -> [Field; 98] {
    let digests: [[u8; 32]; 12] = [
        descriptor.scope, descriptor.policy, descriptor.asset,
        descriptor.hub_domain, descriptor.registry_commitment,
        descriptor.snapshot_digest, descriptor.local_commitment,
        descriptor.dispatch_id, descriptor.chain_domain,
        descriptor.evidence_policy, descriptor.action_commitment,
        descriptor.payout_commitment,
    ];
    let mut result: [Field; 98] = [0; 98];
    for i in 0..12 {
        for j in 0..8 {
            let word: u32 = ((digests[i][j * 4] as u32) << 24)
                | ((digests[i][j * 4 + 1] as u32) << 16)
                | ((digests[i][j * 4 + 2] as u32) << 8)
                | (digests[i][j * 4 + 3] as u32);
            result[i * 8 + j] = word as Field;
        }
    }
    result[96] = descriptor.ready_from as Field;
    result[97] = descriptor.ready_until as Field;
    result
}

// Exact rows 1..33 from design/native-receipt-binding.md. Each field is its
// own H4 part, including both tags. BTC transaction_id here has all 64 bytes;
// the separate unchanged GID codec uses its canonical 32-byte BTC identity.
pub fn facts_statement(
    domain: Domain,
    rule_commitment: [u8; 32],
    effect: NativeEffect,
    native_gid: [u8; 32],
    wire: WireBinding,
    observed: Observation,
    context: NativeContext,
) -> [u8; 32] {
    let mut message: [u8; 829] = [0; 829];
    message = part(message, 0, FACTS_TAG);
    message = part(message, 25, FACTS_SCHEMA);
    message = part(message, 56, domain.ledger_namespace); // row 1
    message = part(message, 92, domain.hub_domain); // row 2
    message = part(message, 128, domain.registry_commitment); // row 3
    message = part(message, 164, rule_commitment); // row 4
    message = part(message, 200, [effect.family]); // row 5
    message = part(message, 205, effect.genesis); // row 6
    message = part(message, 241, effect.asset); // row 7
    message = part(message, 277, effect.transaction_id); // row 8
    message = part(message, 345, u32_bytes(effect.effect_index)); // row 9
    message = part(message, 353, native_gid); // row 10
    message = part(message, 389, wire.transaction_sha256); // row 11
    message = part(message, 425, [wire.wire_binding_version]); // row 12
    message = part(message, 430, [wire.wire_binding_kind]); // row 13
    message = part(message, 435, u32_bytes(wire.wire_binding_position)); // row 14
    message = part(message, 443, wire.wire_key_commitment); // row 15
    message = part(message, 479, observed.block_id); // row 16
    message = part(message, 515, observed.state_commitment); // row 17
    message = part(message, 551, u64_bytes(observed.block_height)); // row 18
    message = part(message, 563, u64_bytes(observed.observed_at)); // row 19
    message = part(message, 575, [observed.finality_kind]); // row 20
    message = part(message, 580, u32_bytes(observed.confirmations)); // row 21
    message = part(message, 588, observed.source_commitment); // row 22
    message = part(message, 624, observed.destination_commitment); // row 23
    message = part(message, 660, u128_bytes(observed.amount)); // row 24
    message = part(message, 680, [observed.custody_kind]); // row 25
    message = part(message, 685, observed.custody_commitment); // row 26
    message = part(message, 721, u64_bytes(observed.evidence_from)); // row 27
    message = part(message, 733, u64_bytes(observed.evidence_until)); // row 28
    message = part(message, 745, context.observed_tip_id); // row 29
    message = part(message, 781, u64_bytes(context.observed_tip_height)); // row 30
    message = part(message, 793, u64_bytes(context.transaction_slot)); // row 31
    message = part(message, 805, u64_bytes(context.parent_slot)); // row 32
    message = part(message, 817, u64_bytes(context.observed_slot)); // row 33
    sha256::<829, 896>(message)
}

// Stable namespace/secret/GID nullifier. No profile, pool, registry, context,
// receipt CM/rho or actor-selected salt enters this admission identity.
pub fn admission_nullifier(
    ledger_namespace: [u8; 32],
    receipt_secret: [u8; 32],
    native_gid: [u8; 32],
) -> [u8; 32] {
    assert(ledger_namespace != [0; 32]);
    assert(receipt_secret != [0; 32]);
    assert(native_gid != [0; 32]);
    let mut message: [u8; 152] = [0; 152];
    message = part(message, 0, ADMISSION_TAG);
    message = part(message, 44, ledger_namespace);
    message = part(message, 80, receipt_secret);
    message = part(message, 116, native_gid);
    let result = sha256::<152, 192>(message);
    assert(result != [0; 32]);
    result
}

// Purpose 18: D and current canonical revoked digest bind the same configured
// hub/registry/namespace through D; count and sequence are original integers.
// Header payload_count=4, literal WHOLE hash length N=8.
pub fn admission_revocation_state(
    domain: Field,
    current_revoked_digest: Field,
    current_revoked_count: u32,
    current_revocation_sequence: u64,
) -> Field {
    assert(domain != 0);
    assert(current_revoked_count <= 64);
    let input: [Field; 8] = [PROFILE, 1, 18, 4,
        domain, current_revoked_digest, current_revoked_count as Field,
        current_revocation_sequence as Field];
    Poseidon2::hash(input, 8)
}

// Original transparent native-recipient fact commitment. These endpoints are
// certified native observations and separately matched to the exact action.
pub fn native_custody_commitment(
    chain_domain: [u8; 32],
    observed: Observation,
) -> [u8; 32] {
    let mut message: [u8; 177] = [0; 177];
    message = part(message, 0, CUSTODY_TAG);
    message = part(message, 42, LEGACY_PROFILE);
    message = part(message, 69, chain_domain);
    message = part(message, 105, observed.source_commitment);
    message = part(message, 141, observed.destination_commitment);
    sha256::<177, 192>(message)
}

// This is the unchanged local-native-observed-effect/2 fact digest, NOT a
// consensus state root. No full native wire or native block is parsed here.
pub fn observed_effect_commitment(
    chain_domain: [u8; 32],
    native_gid: [u8; 32],
    transaction_sha256: [u8; 32],
    observed: Observation,
) -> [u8; 32] {
    let mut message: [u8; 321] = [0; 321];
    message = part(message, 0, OBSERVED_EFFECT_TAG);
    message = part(message, 46, LEGACY_PROFILE);
    message = part(message, 73, chain_domain);
    message = part(message, 109, native_gid);
    message = part(message, 145, observed.block_id);
    message = part(message, 181, u64_bytes(observed.block_height));
    message = part(message, 193, transaction_sha256);
    message = part(message, 229, observed.source_commitment);
    message = part(message, 265, observed.destination_commitment);
    message = part(message, 301, u128_bytes(observed.amount));
    sha256::<321, 384>(message)
}
