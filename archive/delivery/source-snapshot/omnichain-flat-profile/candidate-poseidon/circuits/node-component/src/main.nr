// Isolated Poseidon2 internal-hash N' candidate. ABI remains four [u32;8]
// arrays and the exact original private shapes. Internal F values use canonical
// 32-byte big-endian serialization with raw-byte modulus checks before decoding.
// No child proof, VK or host-valid boolean witness. Local.active stays hidden.
// SHA ReceiptRead -> ReceiptCM, native K and terminal-tag bytes remain unchanged.
//
// COMPONENT LIMITATION: E membership is under a synthetic/trusted authorization
// root until U and atomic S' admission exist. Membership alone does not prove
// owner authority, funding, capsule validity, native finality or full protocol
// acceptance. U must authenticate the complete envelope and active/padding
// prefix; a production caller must authenticate all four public commitments.
use poseidon_support::{encoding, framing, merkle};
use poseidon_support::state as internal_state;
use poseidon_support::types::{Domain, Core, Local, Completion};
use original_flat_support::framing as external_framing;
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
    // Public words retain u32 range checks through their original ABI types.
    // Check the original 32 bytes < Fr before any field reconstruction.
    let domain_value = encoding::canonical_field(domain_digest);
    let authorization_value = encoding::canonical_field(words_to_bytes(authorization_root));
    let state_value = encoding::canonical_field(state_digest);
    let completion_value = encoding::canonical_field(words_to_bytes(completion_commitment));
    let envelope_value = encoding::canonical_field(envelope);
    assert(domain_value != 0);
    assert(envelope_value != 0);
    assert(framing::domain_commitment(domain) == domain_value);
    // E is an occupied purpose-7 authorization leaf, not a raw/empty scalar.
    merkle::membership::<6>(domain_value, 0,
        framing::authorization_leaf(domain_value, envelope_value),
        authorization_siblings, authorization_index, authorization_value);

    // Both exact typed leaves open under this same E. Their leaf-level framing
    // binds domain, fixed index, kind and nonzero blind as well as every field.
    merkle::membership::<4>(domain_value, 1,
        framing::core_leaf(domain_value, core, core_blind),
        core_siblings, 0, envelope_value);
    assert(local.slot < 4);
    assert(completion.slot < 4);
    assert(local.slot == completion.slot);
    let local_index: u32 = 4 + (local.slot as u32);
    merkle::membership::<4>(domain_value, 1,
        framing::local_leaf(domain_value, local, local_blind),
        local_siblings, local_index, envelope_value);

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

    // Same EvidenceState shape, counts and canonical GID-vector predicates;
    // purpose-5/6 internal digests replace SHA. Freshness remains external.
    assert(state_opening.hub_domain == domain.hub_domain);
    assert(state_opening.registry_commitment == domain.registry_commitment);
    assert(internal_state::evidence_state_digest(domain_value, state_opening) == state_value);
    let (revoked_digest, revoked_limbs) = internal_state::bounded_list_digest(
        domain_value, domain.hub_domain, revoked_entries, state_opening.revoked_count);
    assert(revoked_digest == encoding::canonical_field(state_opening.revoked_digest));

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
        let receipt_commitment = receipt::receipt_commitment(own_receipt);
        // Hash the SHA receipt exactly once. Its B32 limbs feed the internal
        // purpose-8 leaf; the same original SHA bytes feed the terminal tag.
        merkle::membership::<6>(domain_value, 2,
            framing::receipt_leaf(domain_value, receipt_commitment), receipt_siblings,
            receipt_index, encoding::canonical_field(state_opening.receipt_root));
        let own_gid_limbs = encoding::raw_digest_limbs(own_receipt.global_effect_id);
        for i in 0..64 {
            if i < state_opening.revoked_count {
                // The exact same constrained B32 pairs used by the vector hash.
                assert(own_gid_limbs != revoked_limbs[i]);
            }
        }
        // Explicit stable namespace; never implicitly substitute hub_domain.
        // The same secret opens K and derives this receipt's terminal tag.
        assert(external_framing::receipt_key_commitment(domain.ledger_namespace,
            receipt_spend_secret) == own_receipt.receipt_key_commitment);
        assert(tag == external_framing::terminal_receipt_tag(domain.ledger_namespace,
            receipt_spend_secret, receipt_commitment));
    } else {
        zero_receipt(own_receipt);
        assert(receipt_spend_secret == [0; 32]);
        assert(receipt_siblings == [[0; 32]; 6]);
        assert(receipt_index == 0);
        assert(tag == local.dummy_terminal_tag);
    }

    // E is inside M alongside domain and the complete statement. T' must open
    // this same E; an equal context cannot join completions from other envelopes.
    assert(framing::completion_commitment(domain_value, envelope_value, completion,
        completion_blind) == completion_value);
}
