// P50 proves prerequisites for ONE opaque target capsule. It does not prove
// that an arbitrary capsule was authorized: R must bind its commitment to C129.
// The actor sees incoming facts, never the target's native action or nk.
use native_support::{capsule, capsule_framing, receipt, state};
use graph_support::sha256::words_to_bytes;

fn zero_predecessor(value: capsule::Predecessor) {
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

fn zero_receipt(value: receipt::ReceiptRead) {
    assert(value.hub_domain == [0; 32]);
    assert(value.registry_commitment == [0; 32]);
    assert(value.global_effect_id == [0; 32]);
    assert(value.scope == [0; 32]);
    assert(value.policy == [0; 32]);
    assert(value.local_commitment == [0; 32]);
    assert(value.dispatch_id == [0; 32]);
    assert(value.chain_domain == [0; 32]);
    assert(value.evidence_policy == [0; 32]);
    assert(value.action_commitment == [0; 32]);
    assert(value.payout_commitment == [0; 32]);
    assert(value.valid_from == 0);
    assert(value.valid_until == 0);
    assert(value.receipt_key_commitment == [0; 32]);
    assert(value.receipt_rho == [0; 32]);
}

fn main(
    hub_domain: pub [u32; 8],
    registry_commitment: pub [u32; 8],
    context: pub [u32; 8],
    target_context: pub [u32; 8],
    dependency_capsule_commitment: pub [u32; 8],
    snapshot_digest: pub [u32; 8],
    valid_from: pub u64,
    valid_until: pub u64,
    dependency: capsule::DependencyCapsule,
    snapshot: state::Snapshot,
    predecessor_receipts: [receipt::ReceiptRead; 3],
    receipt_siblings: [[[u8; 32]; 6]; 3],
    receipt_indexes: [u32; 3],
    revoked_entries: [[u8; 32]; 64],
) {
    let hub = words_to_bytes(hub_domain);
    let registry = words_to_bytes(registry_commitment);
    let graph_context = words_to_bytes(context);
    assert(hub != [0; 32]);
    assert(registry != [0; 32]);
    assert(graph_context != [0; 32]);
    assert(dependency.target_slot < 4);
    assert(dependency.dependency_count <= 3);
    assert(dependency.target_context == words_to_bytes(target_context));
    assert(dependency.target_context != [0; 32]);
    assert(capsule_framing::dependency_capsule(hub, registry, graph_context, dependency)
        == words_to_bytes(dependency_capsule_commitment));

    assert(snapshot.hub_domain == hub);
    assert(snapshot.registry_commitment == registry);
    assert(snapshot.halt == 0);
    assert(valid_from < valid_until);
    assert(valid_from <= snapshot.timestamp);
    assert(snapshot.timestamp < valid_until);
    assert(state::snapshot_digest(snapshot) == words_to_bytes(snapshot_digest));
    assert(snapshot.receipt_count <= 64);
    assert(state::bounded_list_digest(0x32, hub, revoked_entries, snapshot.revoked_count)
        == snapshot.revoked_digest);

    for i in 0..3 {
        let parent = dependency.predecessors[i];
        let observed = predecessor_receipts[i];
        if i < dependency.dependency_count as u32 {
            assert(parent.source_slot < dependency.target_slot);
            if i > 0 { assert(parent.source_slot > dependency.predecessors[i - 1].source_slot); }
            assert(observed.hub_domain == hub);
            assert(observed.registry_commitment == registry);
            assert(observed.local_commitment == parent.source_local_commitment);
            assert(observed.dispatch_id == parent.source_dispatch_id);
            assert(observed.chain_domain == parent.chain_domain);
            assert(observed.evidence_policy == parent.evidence_policy);
            assert(observed.action_commitment == parent.action_commitment);
            assert(observed.payout_commitment == parent.payout_commitment);
            assert(observed.receipt_key_commitment == parent.receipt_key_commitment);
            assert(observed.receipt_rho == parent.receipt_rho);
            assert(observed.valid_from <= valid_from);
            assert(valid_until <= observed.valid_until);
            assert(receipt_indexes[i] < snapshot.receipt_count);
            state::membership(receipt::receipt_commitment(observed), receipt_siblings[i],
                receipt_indexes[i], snapshot.receipt_root);
            for j in 0..64 {
                if j < snapshot.revoked_count { assert(observed.global_effect_id != revoked_entries[j]); }
            }
        } else {
            zero_predecessor(parent);
            zero_receipt(observed);
            assert(receipt_indexes[i] == 0);
            assert(receipt_siblings[i] == [[0; 32]; 6]);
        }
    }
}
