// N51 exposes one fixed slot and opaque payout/spend tag. C129 authenticates
// active vs padding, so neither a host flag nor an unchecked empty proof can
// omit an obligation. No graph nonce/count or predecessor data enters here.
use native_support::{capsule, capsule_framing, receipt, state};
use graph_support::sha256::words_to_bytes;

fn digest(inputs: [Field; 129], offset: u32) -> [u8; 32] {
    assert(offset <= 120);
    let mut words: [u32; 8] = [0; 8];
    for i in 0..8 {
        words[i] = inputs[offset + i] as u32;
        assert(words[i] as Field == inputs[offset + i]);
    }
    words_to_bytes(words)
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
    evidence_state: pub [u32; 8],
    context: pub [u32; 8],
    payout_commitment: pub [u32; 8],
    terminal_receipt_tag: pub [u32; 8],
    slot: pub u8,
    valid_from: pub u64,
    valid_until: pub u64,
    capsule_proof: [Field; 458],
    capsule_inputs: [Field; 129],
    local: capsule::LocalCapsule,
    state_opening: state::EvidenceState,
    own_receipt: receipt::ReceiptRead,
    receipt_spend_secret: [u8; 32],
    receipt_siblings: [[u8; 32]; 6],
    receipt_index: u32,
    revoked_entries: [[u8; 32]; 64],
) {
    approved_capsule::verify(capsule_proof, capsule_inputs);
    let hub = words_to_bytes(hub_domain);
    let registry = words_to_bytes(registry_commitment);
    let graph_context = words_to_bytes(context);
    assert(digest(capsule_inputs, 24) == hub);
    assert(digest(capsule_inputs, 32) == registry);
    assert(digest(capsule_inputs, 40) == graph_context);
    assert(slot < 4);
    assert(local.slot == slot);
    assert(capsule_framing::local_capsule(hub, registry, graph_context, local)
        == digest(capsule_inputs, 64 + (slot as u32) * 8));
    assert(local.payout_commitment == words_to_bytes(payout_commitment));
    assert(local.payout_commitment != [0; 32]);
    assert(valid_from < valid_until);
    let cutoff = capsule_inputs[128] as u64;
    assert(cutoff as Field == capsule_inputs[128]);
    assert(valid_until <= cutoff);
    assert(state_opening.hub_domain == hub);
    assert(state_opening.registry_commitment == registry);
    assert(state::evidence_state_digest(state_opening) == words_to_bytes(evidence_state));
    assert(state::bounded_list_digest(0x32, hub, revoked_entries, state_opening.revoked_count)
        == state_opening.revoked_digest);
    let tag = words_to_bytes(terminal_receipt_tag);
    assert(tag != [0; 32]);
    if local.active {
        assert(own_receipt.hub_domain == hub);
        assert(own_receipt.registry_commitment == registry);
        assert(own_receipt.scope == digest(capsule_inputs, 0));
        assert(own_receipt.policy == digest(capsule_inputs, 8));
        assert(own_receipt.local_commitment == local.local_commitment);
        assert(own_receipt.dispatch_id == local.dispatch_id);
        assert(own_receipt.chain_domain == local.chain_domain);
        assert(own_receipt.evidence_policy == local.evidence_policy);
        assert(own_receipt.action_commitment == local.action_commitment);
        assert(own_receipt.payout_commitment == local.payout_commitment);
        assert(own_receipt.receipt_key_commitment == local.receipt_key_commitment);
        assert(own_receipt.receipt_rho == local.receipt_rho);
        assert(own_receipt.valid_from <= valid_from);
        assert(valid_until <= own_receipt.valid_until);
        assert(receipt_index < state_opening.receipt_count);
        state::membership(receipt::receipt_commitment(own_receipt), receipt_siblings,
            receipt_index, state_opening.receipt_root);
        for i in 0..64 {
            if i < state_opening.revoked_count {
                assert(own_receipt.global_effect_id != revoked_entries[i]);
            }
        }
        assert(tag == receipt::receipt_nullifier(own_receipt, receipt_spend_secret));
    } else {
        zero_receipt(own_receipt);
        assert(receipt_spend_secret == [0; 32]);
        assert(receipt_siblings == [[0; 32]; 6]);
        assert(receipt_index == 0);
        assert(tag == local.dummy_terminal_tag);
    }
}
