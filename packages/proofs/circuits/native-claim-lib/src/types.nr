use admission_support::statement::{Rule, Observation};
use admission_support::types::{WireBinding, NativeContext};
use native_support::quorum::Registry;
use native_support::receipt::NativeEffect;

// Full ordered claim-domain configuration. Chain ID is raw u256BE bytes;
// unlike a Field conversion, this preserves all 256 bits without reduction.
pub struct ClaimConfig {
    pub evm_chain_id: [u8; 32],
    pub evm_genesis: [u8; 32],
    pub gateway: [u8; 20],
    pub gateway_code_hash: [u8; 32],
    pub wrapper: [u8; 20],
    pub wrapper_code_hash: [u8; 32],
    pub pool: [u8; 20],
    pub pool_code_hash: [u8; 32],
    pub pool_domain: [u8; 32],
    pub scope: [u8; 32],
    pub policy: [u8; 32],
    pub wrapper_asset_identity: [u8; 32],
    pub hub: [u8; 20],
    pub hub_code_hash: [u8; 32],
    pub hub_domain: [u8; 32],
    pub ledger_namespace: [u8; 32],
    pub registry_commitment: [u8; 32],
    pub claim_verifier_set_commitment: [u8; 32],
    pub native_family: u8,
    pub native_genesis: [u8; 32],
    pub native_asset: [u8; 32],
    pub native_rule_commitment: [u8; 32],
    pub escrow_endpoint_commitment: [u8; 32],
    pub custody_inventory_domain: [u8; 32],
    pub refund_max_fee: u64,
}

pub struct NoteOpening {
    pub rho: [u8; 32],
    pub x: [u8; 32],
    pub y: [u8; 32],
    pub value: u64,
    pub note_secret: [u8; 32],
}

// kind 1 = REDEEM, 2 = REFUND. ID issuance and immutable funding are gateway
// predicates; CO42 opens exactly the stored ticket commitment, not a new ID.
pub struct ClaimTicket {
    pub kind: u8,
    pub id: [u8; 32],
    pub claim_domain: [u8; 32],
    pub amount: u64,
    pub destination_commitment: [u8; 32],
    pub max_fee: u64,
    pub reference_ingress_n: [u8; 32],
    pub reference_q: [u8; 32],
}

pub struct ClaimEvidence {
    pub registry: Registry,
    pub rule: Rule,
    pub rule_siblings: [[u8; 32]; 3],
    pub rule_index: u8,
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
