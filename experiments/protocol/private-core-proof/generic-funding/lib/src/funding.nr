use crate::framing;
use generic_graph::graph::{Statement as GraphStatement, Witness as GraphWitness, assert_graph};

// This statement belongs to the intermediate A0 proof only. Later wrappers
// must keep all of it private; it is not the onchain/native settlement ABI.
pub struct Statement {
    pub scope: [u8; 32],
    pub policy: [u8; 32],
    pub asset: [u8; 32],
    pub operation_id: [u8; 32],
    pub input_commitment: [u8; 32],
    pub input_nullifier: [u8; 32],
    pub reservation_intent: [u8; 32],
    pub graph_commitment: [u8; 32],
    pub tree_root: [u8; 32],
    pub reserve_commitment: [u8; 32],
    pub reserve_nullifier: [u8; 32],
    pub change_commitment: [u8; 32],
    pub outputs: [[u8; 32]; 4],
    pub recovery_commitment: [u8; 32],
    pub funding_not_before: u64,
    pub funding_valid_until: u64,
    pub settle_before: u64,
}

pub struct InputNote {
    pub kind: u8,
    // PC15 origin for type 2/3; PC23 rho for type 4.
    pub origin: [u8; 32],
    pub key_x: [u8; 32],
    pub key_y: [u8; 32],
    pub value: u64,
    pub secret: [u8; 32],
}
pub struct BalanceNote {
    pub rho: [u8; 32],
    pub key_x: [u8; 32],
    pub key_y: [u8; 32],
    pub value: u64,
    pub secret: [u8; 32],
}
pub struct Payout {
    pub randomness: [u8; 32],
    pub key_x: [u8; 32],
    pub key_y: [u8; 32],
    pub value: u64,
    pub secret: [u8; 32],
    pub invoice_signature: [u8; 64],
}
pub struct Witness {
    pub input_note: InputNote,
    pub change_note: BalanceNote,
    pub recovery_note: BalanceNote,
    pub budget: u64,
    pub reservation_nonce: [u8; 32],
    pub reserve_secret: [u8; 32],
    pub graph: GraphWitness,
    pub payouts: [Payout; 4],
    pub padding_salts: [[u8; 32]; 4],
    pub owner_signature: [u8; 64],
}

fn balance_commitment(scope: [u8; 32], policy: [u8; 32], note: BalanceNote) -> [u8; 32] {
    assert(note.value > 0);
    framing::legacy_balance(scope, policy, note.rho, note.key_x, note.key_y, note.value, note.secret)
}
fn assert_change(statement: Statement, witness: Witness) {
    let note = witness.change_note;
    if note.value > 0 {
        assert(balance_commitment(statement.scope, statement.policy, note) == statement.change_commitment);
    } else {
        // Send-max uses capacity-only padding, never a zero-value spendable note.
        assert(note.rho == [0; 32]);
        assert(note.key_x == [0; 32]);
        assert(note.key_y == [0; 32]);
        assert(note.secret == [0; 32]);
        let padding = framing::empty_change(statement.scope, statement.policy, statement.asset,
            statement.input_nullifier, statement.operation_id, witness.reservation_nonce);
        assert(padding == statement.change_commitment);
    }
}
fn assert_input(statement: Statement, note: InputNote) {
    assert((note.kind == 2) | (note.kind == 3) | (note.kind == 4));
    assert(note.value > 0);
    let commitment = if note.kind == 4 {
        framing::legacy_balance(statement.scope, statement.policy, note.origin, note.key_x, note.key_y, note.value, note.secret)
    } else {
        framing::legacy_payment(statement.scope, note.origin, [note.kind], note.key_x, note.key_y, note.value, note.secret)
    };
    assert(commitment == statement.input_commitment);
    // Deliberately no new profile, asset or policy field in the old nullifier.
    // Existing notes cannot become spendable twice under a new framing domain.
    assert(framing::legacy_nullifier(statement.scope, commitment, note.secret) == statement.input_nullifier);
}
fn assert_empty_payout(payout: Payout) {
    assert(payout.randomness == [0; 32]);
    assert(payout.key_x == [0; 32]);
    assert(payout.key_y == [0; 32]);
    assert(payout.value == 0);
    assert(payout.secret == [0; 32]);
    assert(payout.invoice_signature == [0; 64]);
}
fn assert_distinct_notes(statement: Statement) {
    let commitments = [statement.input_commitment, statement.reserve_commitment,
        statement.change_commitment, statement.recovery_commitment,
        statement.outputs[0], statement.outputs[1], statement.outputs[2], statement.outputs[3]];
    for i in 0..8 {
        assert(commitments[i] != [0; 32]);
        for j in 0..8 { if j < i { assert(commitments[i] != commitments[j]); } }
    }
}

// Real rootless owner authorization: no membership, epoch, sequence, base root,
// projected root, child proof, or witness-supplied accepted verification key.
pub fn assert_authorization(statement: Statement, witness: Witness) {
    assert(statement.asset != [0; 32]);
    assert(statement.funding_not_before < statement.funding_valid_until);
    assert(statement.funding_valid_until <= statement.settle_before);
    assert(witness.budget > 0);
    assert(witness.reservation_nonce != [0; 32]);
    assert(witness.reserve_secret != [0; 32]);
    assert_input(statement, witness.input_note);
    assert_change(statement, witness);
    assert(balance_commitment(statement.scope, statement.policy, witness.recovery_note) == statement.recovery_commitment);
    assert(witness.recovery_note.value == witness.budget);
    assert((witness.input_note.value as u128) == (witness.budget as u128) + (witness.change_note.value as u128));

    let intent = framing::reservation_intent(statement.scope, statement.policy, statement.asset,
        statement.operation_id, witness.reservation_nonce, witness.budget,
        statement.settle_before, statement.recovery_commitment, witness.reserve_secret);
    assert(intent == statement.reservation_intent);
    let graph_statement = GraphStatement {
        scope: statement.scope, policy: statement.policy, operation_id: statement.operation_id,
        graph_commitment: statement.graph_commitment, expires_at: statement.settle_before,
        // The graph's legacy field name denotes I, NEVER the inserted leaf R.
        reserved_commitment: intent, recovery_commitment: statement.recovery_commitment,
    };
    let graph_opening = assert_graph(graph_statement, witness.graph);
    assert(graph_opening.tree_root == statement.tree_root);
    let reserve = framing::reserved_note(statement.scope, statement.policy, statement.asset,
        intent, statement.graph_commitment);
    assert(reserve == statement.reserve_commitment);
    assert(framing::legacy_nullifier(statement.scope, reserve, witness.reserve_secret) == statement.reserve_nullifier);

    let mut payout_sum: u128 = 0;
    for slot in 0..4 {
        let payout = witness.payouts[slot];
        if slot < witness.graph.active_count as u32 {
            assert(witness.padding_salts[slot] == [0; 32]);
            assert(payout.value > 0);
            let rho = framing::payout_origin(statement.scope, statement.policy, statement.asset,
                statement.operation_id, [slot as u8], payout.randomness);
            let payout_commitment = framing::legacy_balance(statement.scope, statement.policy,
                rho, payout.key_x, payout.key_y, payout.value, payout.secret);
            assert(payout_commitment == witness.graph.payout_commitments[slot]);
            assert(payout_commitment == statement.outputs[slot]);
            let invoice = framing::invoice(statement.scope, statement.policy, statement.asset,
                statement.operation_id, [slot as u8], witness.graph.chain_domains[slot],
                witness.graph.evidence_policies[slot], witness.graph.action_commitments[slot],
                payout_commitment, statement.settle_before);
            // Every active transfer quote requires its recipient's signature.
            assert(std::ecdsa_secp256k1::verify_signature(payout.key_x, payout.key_y, payout.invoice_signature, invoice));
            payout_sum = payout_sum + payout.value as u128;
        } else {
            assert_empty_payout(payout);
            assert(witness.padding_salts[slot] != [0; 32]);
            assert(framing::empty_payout(statement.scope, statement.policy, statement.asset,
                statement.graph_commitment, [slot as u8], witness.padding_salts[slot]) == statement.outputs[slot]);
        }
    }
    assert(payout_sum == witness.budget as u128);
    assert_distinct_notes(statement);
    let owner_message = framing::owner_authorization(statement.scope, statement.policy, statement.asset,
        statement.operation_id, statement.input_commitment, statement.input_nullifier,
        statement.reservation_intent, statement.graph_commitment, statement.tree_root,
        statement.reserve_commitment, statement.reserve_nullifier, statement.change_commitment,
        statement.outputs[0], statement.outputs[1], statement.outputs[2], statement.outputs[3],
        statement.recovery_commitment, statement.funding_not_before, statement.funding_valid_until, statement.settle_before);
    assert(std::ecdsa_secp256k1::verify_signature(witness.input_note.key_x,
        witness.input_note.key_y, witness.owner_signature, owner_message));
}
