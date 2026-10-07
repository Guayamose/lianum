// Exact typed payloads from src/framing.mjs SCHEMAS. Field names use snake_case.
// Every value is private when used by node-component; pub exports the fields,
// not their circuit visibility. The four explicit main arguments are public.

pub struct Domain {
    pub scope: [u8; 32],
    pub policy: [u8; 32],
    pub asset: [u8; 32],
    pub hub_domain: [u8; 32],
    pub registry_commitment: [u8; 32],
    pub verifier_set_commitment: [u8; 32],
    pub ledger_namespace: [u8; 32],
}

pub struct Core {
    pub context: [u8; 32],
    pub reserve_commitment: [u8; 32],
    pub reserve_nullifier: [u8; 32],
    pub settle_before: u64,
}

pub struct Local {
    pub slot: u8,
    pub active: bool,
    pub target_context: [u8; 32],
    pub node_commitment: [u8; 32],
    pub local_commitment: [u8; 32],
    pub dispatch_id: [u8; 32],
    pub chain_domain: [u8; 32],
    pub evidence_policy: [u8; 32],
    pub action_commitment: [u8; 32],
    pub payout_commitment: [u8; 32],
    pub receipt_key_commitment: [u8; 32],
    pub receipt_rho: [u8; 32],
    pub dummy_terminal_tag: [u8; 32],
    pub capsule_salt: [u8; 32],
    pub target_join_blind: [u8; 32],
}

pub struct Completion {
    pub hub_domain: [u8; 32],
    pub registry_commitment: [u8; 32],
    pub evidence_state: [u8; 32],
    pub context: [u8; 32],
    pub payout_commitment: [u8; 32],
    pub terminal_receipt_tag: [u8; 32],
    pub slot: u8,
    pub valid_from: u64,
    pub valid_until: u64,
}

