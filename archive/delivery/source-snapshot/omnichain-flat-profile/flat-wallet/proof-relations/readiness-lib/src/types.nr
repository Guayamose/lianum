// Every original R98 statement field is retained, privately, in the seal L.
// Digest bytes are B32, including the SHA snapshot digest; none are reduced
// to a single field. Domain and join are separate canonical F hash operands.
pub struct ReadyDescriptor {
    pub scope: [u8; 32],
    pub policy: [u8; 32],
    pub asset: [u8; 32],
    pub hub_domain: [u8; 32],
    pub registry_commitment: [u8; 32],
    pub snapshot_digest: [u8; 32],
    pub local_commitment: [u8; 32],
    pub dispatch_id: [u8; 32],
    pub chain_domain: [u8; 32],
    pub evidence_policy: [u8; 32],
    pub action_commitment: [u8; 32],
    pub payout_commitment: [u8; 32],
    pub ready_from: u64,
    pub ready_until: u64,
}
