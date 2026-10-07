// Separate private witness types. No legacy wire/finality kind is reassigned.
pub struct Profile {
    pub version: u32,
    pub chain_id: u64,
    pub genesis: [u8; 32],
    pub asset: [u8; 32],
    pub source_set_root: [u8; 32],
    pub finality_policy: [u8; 32],
    pub trace_policy: [u8; 32],
    pub obligation: [u8; 32],
    pub maximum_ancestry: u32,
    pub maximum_evidence_lifetime: u64,
    pub maximum_block_age_ms: u64,
    pub maximum_clock_skew_ms: u64,
    pub maximum_query_ms: u64,
}
pub struct Source {
    pub operator_identity: [u8; 32],
    pub endpoint_identity: [u8; 32],
    pub client_release: [u8; 32],
    pub chain_configuration: [u8; 32],
}
pub struct Observation {
    pub block_id: [u8; 32],
    pub state_commitment: [u8; 32],
    pub block_height: u64,
    pub observed_at: u64,
    pub source_commitment: [u8; 32],
    pub destination_commitment: [u8; 32],
    pub amount: u128,
    pub custody_kind: u8,
    pub custody_commitment: [u8; 32],
    pub evidence_from: u64,
    pub evidence_until: u64,
}
pub struct Wire {
    pub transaction_sha256: [u8; 32],
    pub wire_key_commitment: [u8; 32],
}
pub struct Evidence {
    pub finalized_block_id: [u8; 32],
    pub finalized_block_height: u64,
    pub execution_evidence_commitment: [u8; 32],
    pub finality_evidence_commitment: [u8; 32],
}

// Complete distinct TRON source profile. No EVM chain-id/trace reinterpretation.
pub struct TronProfile {
    pub version: u32,
    pub genesis: [u8; 32],
    pub asset: [u8; 32],
    pub source_set_root: [u8; 32],
    pub finality_policy: [u8; 32],
    pub permission_policy: [u8; 32],
    pub tapos_expiry_policy: [u8; 32],
    pub obligation: [u8; 32],
    pub maximum_ancestry: u32,
    pub maximum_tapos_distance: u32,
    pub maximum_evidence_lifetime: u64,
    pub maximum_block_age_ms: u64,
    pub maximum_clock_skew_ms: u64,
    pub maximum_query_ms: u64,
}
