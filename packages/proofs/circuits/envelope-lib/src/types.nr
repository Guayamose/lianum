// New typed envelope payloads. Frozen Domain/Core/Local/Completion remain in
// poseidon_support::types. B32 fields are complete original digest bytes.
use native_support::capsule;
use poseidon_support::types::Local;

pub struct Funding {
    pub input_commitment: [u8; 32],
    pub input_nullifier: [u8; 32],
    pub reserve_commitment: [u8; 32],
    pub change_commitment: [u8; 32],
    pub operation_id: [u8; 32],
    pub funding_not_before: u64,
    pub funding_valid_until: u64,
}

pub struct Recovery {
    pub reserve_commitment: [u8; 32],
    pub reserve_nullifier: [u8; 32],
    pub recovery_commitment: [u8; 32],
    pub settle_before: u64,
}

pub struct Settlement {
    pub context: [u8; 32],
    pub reserve_commitment: [u8; 32],
    pub reserve_nullifier: [u8; 32],
    pub outputs: [[u8; 32]; 4],
    pub settle_before: u64,
}

pub struct Predecessor {
    pub source_slot: u8,
    pub source_node_commitment: [u8; 32],
    pub source_local_commitment: [u8; 32],
    pub source_dispatch_id: [u8; 32],
    pub chain_domain: [u8; 32],
    pub evidence_policy: [u8; 32],
    pub action_commitment: [u8; 32],
    pub payout_commitment: [u8; 32],
    pub receipt_key_commitment: [u8; 32],
    pub receipt_rho: [u8; 32],
}

pub struct Dependency {
    pub target_slot: u8,
    pub target_context: [u8; 32],
    pub dependency_count: u8,
    pub predecessors: [Predecessor; 3],
    pub capsule_salt: [u8; 32],
    pub target_join_blind: [u8; 32],
}

pub struct Payout {
    pub slot: u8,
    pub commitment: [u8; 32],
}

// Field-preserving adapters, not validity assertions. U calls the original
// full capsule predicate before committing these derived payloads.
pub fn local_from_capsule(value: capsule::LocalCapsule, target_join_blind: [u8; 32]) -> Local {
    Local {
        slot: value.slot,
        active: value.active,
        target_context: value.target_context,
        node_commitment: value.node_commitment,
        local_commitment: value.local_commitment,
        dispatch_id: value.dispatch_id,
        chain_domain: value.chain_domain,
        evidence_policy: value.evidence_policy,
        action_commitment: value.action_commitment,
        payout_commitment: value.payout_commitment,
        receipt_key_commitment: value.receipt_key_commitment,
        receipt_rho: value.receipt_rho,
        dummy_terminal_tag: value.dummy_terminal_tag,
        capsule_salt: value.capsule_salt,
        target_join_blind,
    }
}

fn predecessor_from_capsule(value: capsule::Predecessor) -> Predecessor {
    Predecessor {
        source_slot: value.source_slot,
        source_node_commitment: value.source_node_commitment,
        source_local_commitment: value.source_local_commitment,
        source_dispatch_id: value.source_dispatch_id,
        chain_domain: value.chain_domain,
        evidence_policy: value.evidence_policy,
        action_commitment: value.action_commitment,
        payout_commitment: value.payout_commitment,
        receipt_key_commitment: value.receipt_key_commitment,
        receipt_rho: value.receipt_rho,
    }
}

pub fn dependency_from_capsule(value: capsule::DependencyCapsule, target_join_blind: [u8; 32]) -> Dependency {
    Dependency {
        target_slot: value.target_slot,
        target_context: value.target_context,
        dependency_count: value.dependency_count,
        predecessors: [
            predecessor_from_capsule(value.predecessors[0]),
            predecessor_from_capsule(value.predecessors[1]),
            predecessor_from_capsule(value.predecessors[2]),
        ],
        capsule_salt: value.capsule_salt,
        target_join_blind,
    }
}
