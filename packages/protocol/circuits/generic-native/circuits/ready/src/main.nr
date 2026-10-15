// R98 joins an authenticated owner capsule with an opaque P50 prerequisite
// proof. This witness contains no predecessor receipt identity or spend key.
// Before signing, the native gate still authenticates the exact current hub
// checkpoint/time; historical membership alone is not fresh readiness.
use native_support::{capsule, capsule_framing, state};
use graph_support::sha256::{words_to_bytes, sha256, u32_bytes};

// The native gate authenticates this exact snapshot against the registered
// pool, whose append-only spent set enforces unique entries. Rechecking every
// pair of that already authenticated set inside R adds quadratic constraints
// without strengthening membership or freshness. Keep the complete canonical
// byte hash, bounds, zero padding and target absence. A duplicate or otherwise
// invented list still cannot match the current pool digest without a collision.
// This helper is local to R: it does not relax the general state codec used by
// independent relations, nor turn an arbitrary caller snapshot into authority.
fn assert_reserve_unspent(
    scope: [u8; 32], entries: [[u8; 32]; 64], count: u32,
    expected_digest: [u8; 32], target: [u8; 32],
) {
    assert(count <= 64);
    assert(target != [0; 32]);
    let mut message: [u8; 2085] = [0; 2085];
    message[0] = 0x02;
    for i in 0..32 { message[1 + i] = scope[i]; }
    let encoded_count = u32_bytes(count);
    for i in 0..4 { message[33 + i] = encoded_count[i]; }
    for i in 0..64 {
        if i < count {
            assert(entries[i] != [0; 32]);
            assert(entries[i] != target);
        } else { assert(entries[i] == [0; 32]); }
        for j in 0..32 { message[37 + i * 32 + j] = entries[i][j]; }
    }
    assert(sha256::<2085, 2112>(message) == expected_digest);
}

fn digest<let N: u32>(inputs: [Field; N], offset: u32) -> [u8; 32] {
    assert(offset + 8 <= N);
    let mut words: [u32; 8] = [0; 8];
    for i in 0..8 {
        words[i] = inputs[offset + i] as u32;
        assert(words[i] as Field == inputs[offset + i]);
    }
    words_to_bytes(words)
}

fn main(
    scope: pub [u32; 8],
    policy: pub [u32; 8],
    asset: pub [u32; 8],
    hub_domain: pub [u32; 8],
    registry_commitment: pub [u32; 8],
    snapshot_digest: pub [u32; 8],
    local_commitment: pub [u32; 8],
    dispatch_id: pub [u32; 8],
    chain_domain: pub [u32; 8],
    evidence_policy: pub [u32; 8],
    action_commitment: pub [u32; 8],
    payout_commitment: pub [u32; 8],
    ready_from: pub u64,
    ready_until: pub u64,
    capsule_proof: [Field; 458],
    capsule_inputs: [Field; 129],
    dependency_proof: [Field; 458],
    dependency_inputs: [Field; 50],
    local: capsule::LocalCapsule,
    action: capsule::Action,
    snapshot: state::Snapshot,
    reserve_siblings: [[u8; 32]; 6],
    reserve_index: u32,
    pool_spent_entries: [[u8; 32]; 64],
) {
    approved_capsule::verify(capsule_proof, capsule_inputs);
    approved_dependency::verify(dependency_proof, dependency_inputs);
    let hub = words_to_bytes(hub_domain);
    let registry = words_to_bytes(registry_commitment);
    let context = digest(capsule_inputs, 40);
    assert(digest(capsule_inputs, 0) == words_to_bytes(scope));
    assert(digest(capsule_inputs, 8) == words_to_bytes(policy));
    assert(digest(capsule_inputs, 16) == words_to_bytes(asset));
    assert(digest(capsule_inputs, 24) == hub);
    assert(digest(capsule_inputs, 32) == registry);
    assert(local.slot < 4);
    assert(local.active);
    assert(capsule_framing::local_capsule(hub, registry, context, local)
        == digest(capsule_inputs, 64 + (local.slot as u32) * 8));
    assert(digest(dependency_inputs, 0) == hub);
    assert(digest(dependency_inputs, 8) == registry);
    assert(digest(dependency_inputs, 16) == context);
    assert(digest(dependency_inputs, 24) == local.target_context);
    assert(digest(dependency_inputs, 32) == digest(capsule_inputs, 96 + (local.slot as u32) * 8));
    assert(digest(dependency_inputs, 40) == words_to_bytes(snapshot_digest));
    assert(dependency_inputs[48] == ready_from as Field);
    assert(dependency_inputs[49] == ready_until as Field);

    assert(local.local_commitment == words_to_bytes(local_commitment));
    assert(local.dispatch_id == words_to_bytes(dispatch_id));
    assert(local.chain_domain == words_to_bytes(chain_domain));
    assert(local.evidence_policy == words_to_bytes(evidence_policy));
    assert(local.action_commitment == words_to_bytes(action_commitment));
    assert(local.payout_commitment == words_to_bytes(payout_commitment));
    capsule::assert_action(action);
    assert(capsule_framing::native_transfer_action(action) == local.action_commitment);
    assert(action.chain_domain == local.chain_domain);
    assert(action.receipt_key_commitment == local.receipt_key_commitment);
    assert(action.receipt_rho == local.receipt_rho);
    assert(action.settle_before as Field == capsule_inputs[128]);
    assert(action.execution_from <= ready_from);
    assert(ready_from < ready_until);
    assert(ready_until <= action.execution_until);
    assert(ready_until <= action.settle_before);

    assert(snapshot.hub_domain == hub);
    assert(snapshot.registry_commitment == registry);
    assert(snapshot.scope == words_to_bytes(scope));
    assert(snapshot.policy == words_to_bytes(policy));
    assert(snapshot.asset_identity == words_to_bytes(asset));
    assert(snapshot.halt == 0);
    assert(ready_from <= snapshot.timestamp);
    assert(snapshot.timestamp < ready_until);
    assert(state::snapshot_digest(snapshot) == words_to_bytes(snapshot_digest));
    state::membership(digest(capsule_inputs, 48), reserve_siblings, reserve_index, snapshot.pool_root);
    assert_reserve_unspent(snapshot.scope, pool_spent_entries, snapshot.pool_spent_count,
        snapshot.pool_spent_digest, digest(capsule_inputs, 56));
}
