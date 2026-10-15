// A0 is generated owner-side before funding. These 139 intermediate public
// fields must remain PRIVATE witnesses inside later onchain/native wrappers.
use generic_graph::sha256::words_to_bytes;
use generic_funding::funding::{Statement, Witness, assert_authorization};

fn main(
    scope: pub [u32; 8],
    policy: pub [u32; 8],
    asset: pub [u32; 8],
    operation_id: pub [u32; 8],
    input_commitment: pub [u32; 8],
    input_nullifier: pub [u32; 8],
    reservation_intent: pub [u32; 8],
    graph_commitment: pub [u32; 8],
    tree_root: pub [u32; 8],
    reserve_commitment: pub [u32; 8],
    reserve_nullifier: pub [u32; 8],
    change_commitment: pub [u32; 8],
    outputs: pub [[u32; 8]; 4],
    recovery_commitment: pub [u32; 8],
    funding_not_before: pub u64,
    funding_valid_until: pub u64,
    settle_before: pub u64,
    witness: Witness,
) {
    let statement = Statement {
        scope: words_to_bytes(scope), policy: words_to_bytes(policy), asset: words_to_bytes(asset),
        operation_id: words_to_bytes(operation_id), input_commitment: words_to_bytes(input_commitment),
        input_nullifier: words_to_bytes(input_nullifier), reservation_intent: words_to_bytes(reservation_intent),
        graph_commitment: words_to_bytes(graph_commitment), tree_root: words_to_bytes(tree_root),
        reserve_commitment: words_to_bytes(reserve_commitment), reserve_nullifier: words_to_bytes(reserve_nullifier),
        change_commitment: words_to_bytes(change_commitment),
        outputs: [words_to_bytes(outputs[0]), words_to_bytes(outputs[1]), words_to_bytes(outputs[2]), words_to_bytes(outputs[3])],
        recovery_commitment: words_to_bytes(recovery_commitment), funding_not_before, funding_valid_until, settle_before,
    };
    assert_authorization(statement, witness);
}
