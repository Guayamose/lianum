// R50: exact local action/reservation readiness, with no predecessor receipts,
// receipt spend secret, child proof or VK. P is checked by the consuming gate
// with exact public joins. L seals every original R98 field for later I.
use readiness_support::common;
use readiness_support::framing as readiness_framing;
use readiness_support::types::ReadyDescriptor;
use poseidon_support::{encoding, framing, merkle};
use poseidon_support::types::{Domain, Core, Local};
use native_support::{capsule, capsule_framing, state};
use graph_support::sha256::words_to_bytes;

fn main(
    domain_commitment: pub [u32; 8],
    authorization_root: pub [u32; 8],
    checkpoint: pub [u32; 8],
    readiness_evidence_state: pub [u32; 8],
    join_commitment: pub [u32; 8],
    readiness_commitment: pub [u32; 8],
    ready_from: pub u64,
    ready_until: pub u64,
    domain: Domain,
    envelope: [u8; 32],
    authorization_siblings: [[u8; 32]; 6],
    authorization_index: u32,
    core: Core,
    core_blind: [u8; 32],
    core_siblings: [[u8; 32]; 4],
    local: Local,
    local_blind: [u8; 32],
    local_siblings: [[u8; 32]; 4],
    action: capsule::Action,
    snapshot: state::Snapshot,
    reserve_siblings: [[u8; 32]; 6],
    reserve_index: u32,
    pool_spent_entries: [[u8; 32]; 64],
    readiness_blind: [u8; 32],
) {
    let (domain_value, authorization_value, envelope_value) = common::assert_authorized_core(
        domain_commitment, authorization_root, domain, envelope,
        authorization_siblings, authorization_index, core, core_blind, core_siblings);
    let checkpoint_bytes = words_to_bytes(checkpoint);
    let evidence_value = encoding::canonical_field(words_to_bytes(readiness_evidence_state));
    let join_value = encoding::canonical_field(words_to_bytes(join_commitment));
    let readiness_value = encoding::canonical_field(words_to_bytes(readiness_commitment));

    assert(local.slot < 4);
    assert(local.active);
    assert(local.target_context != [0; 32]);
    assert(local.capsule_salt != [0; 32]);
    assert(local.target_join_blind != [0; 32]);
    let local_index: u32 = 4 + (local.slot as u32);
    merkle::membership::<4>(domain_value, 1,
        framing::local_leaf(domain_value, local, local_blind),
        local_siblings, local_index, envelope_value);

    // Preserve original action semantics and byte-exact full SHA action hash.
    // Native K, receipt rho, custody, signer/source/destination and risk fields
    // are not replaced by a host-valid flag or a commitment to fewer fields.
    capsule::assert_action(action);
    assert(capsule_framing::native_transfer_action(action) == local.action_commitment);
    assert(action.chain_domain == local.chain_domain);
    assert(action.receipt_key_commitment == local.receipt_key_commitment);
    assert(action.receipt_rho == local.receipt_rho);
    assert(action.settle_before == core.settle_before);
    assert(action.execution_from <= ready_from);
    assert(ready_from < ready_until);
    assert(ready_until <= action.execution_until);
    assert(ready_until <= action.settle_before);

    common::assert_readiness_snapshot(domain_value, domain, snapshot,
        checkpoint_bytes, evidence_value, ready_from, ready_until);
    // The original reserve remains a SHA note in the original pool tree. E's
    // Core supplies the exact reserve commitment/nullifier/cutoff; no new note
    // identity, field reduction or Poseidon pool path is introduced here.
    state::membership(core.reserve_commitment, reserve_siblings, reserve_index, snapshot.pool_root);
    common::assert_reserve_unspent(snapshot.scope, pool_spent_entries, snapshot.pool_spent_count,
        snapshot.pool_spent_digest, core.reserve_nullifier);

    assert(readiness_framing::join_commitment(domain_value, envelope_value,
        local.target_context, authorization_value, checkpoint_bytes,
        evidence_value, ready_from, ready_until, local.target_join_blind) == join_value);

    // Construct the descriptor from checked openings, not an independent
    // caller-provided descriptor that could drift from the action or snapshot.
    let descriptor = ReadyDescriptor {
        scope: domain.scope,
        policy: domain.policy,
        asset: domain.asset,
        hub_domain: domain.hub_domain,
        registry_commitment: domain.registry_commitment,
        snapshot_digest: checkpoint_bytes,
        local_commitment: local.local_commitment,
        dispatch_id: local.dispatch_id,
        chain_domain: local.chain_domain,
        evidence_policy: local.evidence_policy,
        action_commitment: local.action_commitment,
        payout_commitment: local.payout_commitment,
        ready_from: ready_from,
        ready_until: ready_until,
    };
    assert(readiness_framing::readiness_commitment(domain_value, join_value,
        readiness_blind, descriptor) == readiness_value);
}
