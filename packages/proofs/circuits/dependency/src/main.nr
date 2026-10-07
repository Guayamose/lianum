// P42: one opaque target's prerequisites, with no target action, spend secret,
// Local opening, child proof or VK. Accepted E must come from atomic U/S'.
// Native signing must jointly verify P/R and repeat fresh checkpoint/health
// checks. A historical source proof alone establishes no signing chronology.
use readiness_support::common;
use readiness_support::framing as readiness_framing;
use envelope_support::types::{Dependency, Predecessor};
use envelope_support::framing as envelope_framing;
use poseidon_support::{encoding, framing, merkle};
use poseidon_support::state as internal_state;
use poseidon_support::types::{Domain, Core};
use native_support::{receipt, state};
use graph_support::sha256::words_to_bytes;

fn zero_predecessor(value: Predecessor) {
    assert(value.source_slot == 0);
    assert(value.source_node_commitment == [0; 32]);
    assert(value.source_local_commitment == [0; 32]);
    assert(value.source_dispatch_id == [0; 32]);
    assert(value.chain_domain == [0; 32]);
    assert(value.evidence_policy == [0; 32]);
    assert(value.action_commitment == [0; 32]);
    assert(value.payout_commitment == [0; 32]);
    assert(value.receipt_key_commitment == [0; 32]);
    assert(value.receipt_rho == [0; 32]);
}

fn main(
    domain_commitment: pub [u32; 8],
    authorization_root: pub [u32; 8],
    checkpoint: pub [u32; 8],
    readiness_evidence_state: pub [u32; 8],
    join_commitment: pub [u32; 8],
    ready_from: pub u64,
    ready_until: pub u64,
    domain: Domain,
    envelope: [u8; 32],
    authorization_siblings: [[u8; 32]; 6],
    authorization_index: u32,
    core: Core,
    core_blind: [u8; 32],
    core_siblings: [[u8; 32]; 4],
    dependency: Dependency,
    dependency_blind: [u8; 32],
    dependency_siblings: [[u8; 32]; 4],
    snapshot: state::Snapshot,
    predecessor_receipts: [receipt::ReceiptRead; 3],
    receipt_siblings: [[[u8; 32]; 6]; 3],
    receipt_indexes: [u32; 3],
    revoked_entries: [[u8; 32]; 64],
) {
    let (domain_value, authorization_value, envelope_value) = common::assert_authorized_core(
        domain_commitment, authorization_root, domain, envelope,
        authorization_siblings, authorization_index, core, core_blind, core_siblings);
    let checkpoint_bytes = words_to_bytes(checkpoint);
    let evidence_value = encoding::canonical_field(words_to_bytes(readiness_evidence_state));
    let join_value = encoding::canonical_field(words_to_bytes(join_commitment));

    assert(dependency.target_slot < 4);
    assert(dependency.dependency_count <= 3);
    assert(dependency.target_context != [0; 32]);
    assert(dependency.capsule_salt != [0; 32]);
    assert(dependency.target_join_blind != [0; 32]);
    let dependency_index: u32 = 8 + (dependency.target_slot as u32);
    merkle::membership::<4>(domain_value, 1,
        envelope_framing::dependency_leaf(domain_value, dependency, dependency_blind),
        dependency_siblings, dependency_index, envelope_value);

    common::assert_readiness_snapshot(domain_value, domain, snapshot,
        checkpoint_bytes, evidence_value, ready_from, ready_until);
    assert(ready_until <= core.settle_before);
    assert(readiness_framing::join_commitment(domain_value, envelope_value,
        dependency.target_context, authorization_value, checkpoint_bytes,
        evidence_value, ready_from, ready_until, dependency.target_join_blind) == join_value);

    // Same complete canonical revoked-GID vector predicates as the frozen N':
    // prefix/nonzero, count <=64, exact zero tail and pairwise distinctness.
    // Cache the injective two-u128-limb encoding for every receipt's absence.
    let (revoked_digest, revoked_limbs) = internal_state::bounded_list_digest(
        domain_value, domain.hub_domain, revoked_entries, snapshot.revoked_count);
    assert(revoked_digest == encoding::canonical_field(snapshot.revoked_digest));
    let receipt_root = encoding::canonical_field(snapshot.receipt_root);

    for i in 0..3 {
        let parent = dependency.predecessors[i];
        let observed = predecessor_receipts[i];
        if i < dependency.dependency_count as u32 {
            assert(parent.source_slot < dependency.target_slot);
            if i > 0 { assert(parent.source_slot > dependency.predecessors[i - 1].source_slot); }
            assert(observed.hub_domain == domain.hub_domain);
            assert(observed.registry_commitment == domain.registry_commitment);
            assert(observed.scope == domain.scope);
            assert(observed.policy == domain.policy);
            assert(observed.local_commitment == parent.source_local_commitment);
            assert(observed.dispatch_id == parent.source_dispatch_id);
            assert(observed.chain_domain == parent.chain_domain);
            assert(observed.evidence_policy == parent.evidence_policy);
            assert(observed.action_commitment == parent.action_commitment);
            assert(observed.payout_commitment == parent.payout_commitment);
            assert(observed.receipt_key_commitment == parent.receipt_key_commitment);
            assert(observed.receipt_rho == parent.receipt_rho);
            assert(observed.valid_from <= ready_from);
            assert(ready_until <= observed.valid_until);
            assert(receipt_indexes[i] < snapshot.receipt_count);
            // ReceiptCM is the complete original SHA digest. Only its internal
            // purpose-8 leaf adapter and kind-2 Merkle tree are Poseidon2.
            let receipt_commitment = receipt::receipt_commitment(observed);
            merkle::membership::<6>(domain_value, 2,
                framing::receipt_leaf(domain_value, receipt_commitment),
                receipt_siblings[i], receipt_indexes[i], receipt_root);
            let gid = encoding::raw_digest_limbs(observed.global_effect_id);
            for j in 0..64 {
                if j < snapshot.revoked_count { assert(gid != revoked_limbs[j]); }
            }
        } else {
            zero_predecessor(parent);
            common::zero_receipt(observed);
            assert(receipt_indexes[i] == 0);
            assert(receipt_siblings[i] == [[0; 32]; 6]);
        }
    }
}
