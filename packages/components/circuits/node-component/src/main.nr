// Representative non-recursive N' component. Public ABI: exactly four digest
// arrays (32 u32 words). The slot, active marker, local terms and full completion
// opening stay private. There is no child proof, verification key or host-valid
// boolean witness. Bool Local.active is authenticated by its typed E leaf.
//
// COMPONENT LIMITATION: E membership is under a synthetic/trusted authorization
// root until U and atomic S' admission exist. Membership alone does not prove
// owner authority, funding, capsule validity, native finality or full protocol
// acceptance. U must authenticate the complete envelope and active/padding
// prefix; a production caller must authenticate all four public commitments.
use flat_support::{framing, merkle};
use flat_support::types::{Domain, Core, Local, Completion};
use native_support::{receipt, state};
use graph_support::sha256::words_to_bytes;

// Exact zeroing of the original N51 ReceiptRead, including both time fields.
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
    domain_commitment: pub [u32; 8],
    authorization_root: pub [u32; 8],
    evidence_state: pub [u32; 8],
    completion_commitment: pub [u32; 8],
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
    completion: Completion,
    completion_blind: [u8; 32],
    state_opening: state::EvidenceState,
    own_receipt: receipt::ReceiptRead,
    receipt_spend_secret: [u8; 32],
    receipt_siblings: [[u8; 32]; 6],
    receipt_index: u32,
    revoked_entries: [[u8; 32]; 64],
) {
    let domain_digest = words_to_bytes(domain_commitment);
    let state_digest = words_to_bytes(evidence_state);
    // Authenticate the full seven-field deployment domain before its use.
    assert(framing::domain_commitment(domain) == domain_digest);
    // Depth six; helper rejects zero E and index >=64 before direction bits.
    state::membership(envelope, authorization_siblings, authorization_index,
        words_to_bytes(authorization_root));

    // Both exact typed leaves open under this same E. Their leaf-level framing
    // binds domain, fixed index, kind and nonzero blind as well as every field.
    merkle::envelope_membership(framing::core_leaf(domain_digest, core, core_blind),
        core_siblings, 0, envelope);
    assert(local.slot < 4);
    assert(completion.slot < 4);
    assert(local.slot == completion.slot);
    let local_index: u32 = 4 + (local.slot as u32);
    merkle::envelope_membership(framing::local_leaf(domain_digest, local, local_blind),
        local_siblings, local_index, envelope);

    // The old N51 statement is private, with every original field retained in M.
    assert(completion.hub_domain == domain.hub_domain);
    assert(completion.registry_commitment == domain.registry_commitment);
    assert(completion.evidence_state == state_digest);
    assert(completion.context == core.context);
    assert(completion.payout_commitment == local.payout_commitment);
    assert(local.payout_commitment != [0; 32]);
    assert(completion.valid_from < completion.valid_until);
    assert(completion.valid_until <= core.settle_before);
    let tag = completion.terminal_receipt_tag;
    assert(tag != [0; 32]);

    // Unchanged canonical EvidenceState bytes and GID revocation vector.
    // This authenticates the supplied state opening, not its real-world freshness.
    assert(state_opening.hub_domain == domain.hub_domain);
    assert(state_opening.registry_commitment == domain.registry_commitment);
    assert(state::evidence_state_digest(state_opening) == state_digest);
    assert(state::bounded_list_digest(0x32, domain.hub_domain, revoked_entries,
        state_opening.revoked_count) == state_opening.revoked_digest);

    if local.active {
        assert(own_receipt.hub_domain == domain.hub_domain);
        assert(own_receipt.registry_commitment == domain.registry_commitment);
        assert(own_receipt.scope == domain.scope);
        assert(own_receipt.policy == domain.policy);
        assert(own_receipt.local_commitment == local.local_commitment);
        assert(own_receipt.dispatch_id == local.dispatch_id);
        assert(own_receipt.chain_domain == local.chain_domain);
        assert(own_receipt.evidence_policy == local.evidence_policy);
        assert(own_receipt.action_commitment == local.action_commitment);
        assert(own_receipt.payout_commitment == local.payout_commitment);
        assert(own_receipt.receipt_key_commitment == local.receipt_key_commitment);
        assert(own_receipt.receipt_rho == local.receipt_rho);
        assert(own_receipt.valid_from <= completion.valid_from);
        assert(completion.valid_until <= own_receipt.valid_until);
        assert(receipt_index < state_opening.receipt_count);
        // Imported receipt_commitment enforces every nonzero ReceiptRead field
        // and its positive validity window. It preserves the old receipt bytes.
        let receipt_leaf = receipt::receipt_commitment(own_receipt);
        state::membership(receipt_leaf, receipt_siblings,
            receipt_index, state_opening.receipt_root);
        for i in 0..64 {
            if i < state_opening.revoked_count {
                assert(own_receipt.global_effect_id != revoked_entries[i]);
            }
        }
        // Explicit stable namespace; never implicitly substitute hub_domain.
        // The same secret opens K and derives this receipt's terminal tag.
        assert(framing::receipt_key_commitment(domain.ledger_namespace,
            receipt_spend_secret) == own_receipt.receipt_key_commitment);
        assert(tag == framing::terminal_receipt_tag(domain.ledger_namespace,
            receipt_spend_secret, receipt_leaf));
    } else {
        zero_receipt(own_receipt);
        assert(receipt_spend_secret == [0; 32]);
        assert(receipt_siblings == [[0; 32]; 6]);
        assert(receipt_index == 0);
        assert(tag == local.dummy_terminal_tag);
    }

    // E is inside M alongside domain and the complete statement. T' must open
    // this same E; an equal context cannot join completions from other envelopes.
    assert(framing::completion_commitment(domain_digest, envelope, completion,
        completion_blind) == words_to_bytes(completion_commitment));
}
