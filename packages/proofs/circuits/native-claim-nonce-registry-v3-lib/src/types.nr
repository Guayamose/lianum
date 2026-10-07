// Distinct nonce-registry V3 custody witness; no old key or predicate is redefined.
use admission_support::statement::{Rule, Observation};
use admission_support::types::{WireBinding, NativeContext};
use native_support::quorum::Registry;
use native_support::receipt::NativeEffect;
use native_value_support::types::Source;

pub struct ClaimEvidenceNonceRegistryV3 {
    pub source_set_root: [u8; 32],
    pub sources: [Source; 3],
    pub source_siblings: [[[u8; 32]; 2]; 3],
    pub registry: Registry,
    pub rule: Rule,
    pub profile_siblings: [[u8; 32]; 3],
    pub profile_index: u8,
    pub effect: NativeEffect,
    pub observation: Observation,
    pub wire: WireBinding,
    pub native_context: NativeContext,
    pub attester_indexes: [u8; 3],
    pub attester_signatures: [[u8; 64]; 3],
    pub current_revoked_entries: [[u8; 32]; 64],
    pub current_revoked_digest: [u8; 32],
    pub current_revoked_count: u32,
    pub current_revocation_sequence: u64,
}
