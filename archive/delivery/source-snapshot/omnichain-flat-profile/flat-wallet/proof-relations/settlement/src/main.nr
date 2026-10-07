// T: a source-only settlement relation with 138 public words. The contract
// MUST verify T and all FOUR pinned N proofs atomically, joining D/G/state/M.
// Opening M is not verification of N. No proof, VK or host-valid witness is
// accepted here. Full protocol acceptance and external audit remain pending.
use envelope_support::framing as envelope_framing;
use envelope_support::types::Settlement;
use poseidon_support::{encoding, framing, merkle};
use poseidon_support::types::{Domain, Core, Completion};
use graph_support::sha256::words_to_bytes;
use native_support::state as note_state;

fn main(
    domain_commitment: pub [u32; 8],
    authorization_root: pub [u32; 8],
    evidence_state: pub [u32; 8],
    pool_root: pub [u32; 8],
    reserve_nullifier: pub [u32; 8],
    outputs: pub [[u32; 8]; 4],
    terminal_tags: pub [[u32; 8]; 4],
    completion_commitments: pub [[u32; 8]; 4],
    valid_from: pub u64,
    valid_until: pub u64,
    domain: Domain,
    envelope: [u8; 32],
    authorization_siblings: [[u8; 32]; 6],
    authorization_index: u32,
    core: Core,
    core_blind: [u8; 32],
    core_siblings: [[u8; 32]; 4],
    settlement: Settlement,
    settlement_blind: [u8; 32],
    settlement_siblings: [[u8; 32]; 4],
    completions: [Completion; 4],
    completion_blinds: [[u8; 32]; 4],
    reserve_siblings: [[u8; 32]; 6],
    reserve_index: u32,
) {
    // All public digest words are bounded u32s. Check ORIGINAL scalar bytes
    // against Fr before reconstruction, including every M and private E.
    // poolRoot, reserveNF, payouts and terminal tags remain complete B32s.
    let domain_value = encoding::canonical_field(words_to_bytes(domain_commitment));
    let authorization_value = encoding::canonical_field(words_to_bytes(authorization_root));
    let state_digest = words_to_bytes(evidence_state);
    let _state_value = encoding::canonical_field(state_digest);
    let envelope_value = encoding::canonical_field(envelope);
    let mut completion_values: [Field; 4] = [0; 4];
    for i in 0..4 {
        completion_values[i] = encoding::canonical_field(words_to_bytes(completion_commitments[i]));
    }
    assert(domain_value != 0);
    assert(envelope_value != 0);
    assert(framing::domain_commitment(domain) == domain_value);

    // Purpose 7 is an occupied authorization leaf under tree kind 0/depth 6.
    // Both typed envelope openings use the SAME E, kind 1/depth 4. The frozen
    // membership helper checks path bounds and canonical sibling encodings.
    merkle::membership::<6>(domain_value, 0,
        framing::authorization_leaf(domain_value, envelope_value),
        authorization_siblings, authorization_index, authorization_value);
    merkle::membership::<4>(domain_value, 1,
        framing::core_leaf(domain_value, core, core_blind),
        core_siblings, 0, envelope_value);
    merkle::membership::<4>(domain_value, 1,
        envelope_framing::settlement_leaf(domain_value, settlement, settlement_blind),
        settlement_siblings, 3, envelope_value);

    // Core purpose 2 and Settlement purpose 13 must identify exactly the same
    // reservation and original cutoff. Settlement authenticates payout order.
    assert(settlement.context == core.context);
    assert(settlement.reserve_commitment == core.reserve_commitment);
    assert(settlement.reserve_nullifier == core.reserve_nullifier);
    assert(settlement.settle_before == core.settle_before);
    assert(settlement.reserve_nullifier == words_to_bytes(reserve_nullifier));
    assert(valid_from < valid_until);
    assert(valid_until <= core.settle_before);

    // The pool note tree retains its original SHA bytes and zero-leaf rule.
    // It is NOT a Poseidon receipt tree or an authorization tree. Recognition
    // of this pool root and reserveNF unspentness are atomic contract checks.
    note_state::membership(core.reserve_commitment, reserve_siblings,
        reserve_index, words_to_bytes(pool_root));

    for i in 0..4 {
        let completion = completions[i];
        let payout = words_to_bytes(outputs[i]);
        let terminal_tag = words_to_bytes(terminal_tags[i]);
        // Fixed positions prohibit omission, duplicates, reorderings and a
        // public active/padding mask. All four corresponding N proofs remain
        // mandatory, including the hidden padding branches enforced by N/U.
        assert(completion.slot == i as u8);
        assert(completion.hub_domain == domain.hub_domain);
        assert(completion.registry_commitment == domain.registry_commitment);
        assert(completion.context == core.context);
        assert(completion.evidence_state == state_digest);
        assert(settlement.outputs[i] == payout);
        assert(completion.payout_commitment == payout);
        assert(completion.terminal_receipt_tag == terminal_tag);
        assert(payout != [0; 32]);
        assert(terminal_tag != [0; 32]);
        // Preserve T131's pairwise payout and terminal-tag inequalities.
        for j in 0..4 {
            if j < i {
                assert(outputs[i] != outputs[j]);
                assert(terminal_tags[i] != terminal_tags[j]);
            }
        }

        // T's positive half-open interval is contained in EVERY N interval
        // and the original cutoff; its current-time check is external.
        assert(completion.valid_from < completion.valid_until);
        assert(completion.valid_until <= core.settle_before);
        assert(completion.valid_from <= valid_from);
        assert(valid_until <= completion.valid_until);

        // Purpose 4 includes D, this exact E, a nonzero blind and the COMPLETE
        // N statement. Equal contexts cannot splice different envelopes.
        assert(framing::completion_commitment(domain_value, envelope_value,
            completion, completion_blinds[i]) == completion_values[i]);
    }
}
