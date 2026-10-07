// Graph opening and obligation structure only. This is not spend authority.
// This does not establish owner signature, reserve membership, funds, native
// truth, readiness or settlement acceptance. See ../../../README.md.
use generic_graph::graph::{Statement, Witness, assert_graph};
use generic_graph::sha256::words_to_bytes;

fn main(
    scope: pub [u32; 8],
    policy: pub [u32; 8],
    operation_id: pub [u32; 8],
    graph_commitment: pub [u32; 8],
    expires_at: pub u64,
    reserved_commitment: pub [u32; 8],
    recovery_commitment: pub [u32; 8],
    tree_root: pub [u32; 8],
    witness: Witness,
) {
    let statement = Statement {
        scope: words_to_bytes(scope),
        policy: words_to_bytes(policy),
        operation_id: words_to_bytes(operation_id),
        graph_commitment: words_to_bytes(graph_commitment),
        expires_at,
        reserved_commitment: words_to_bytes(reserved_commitment),
        recovery_commitment: words_to_bytes(recovery_commitment),
    };
    let opening = assert_graph(statement, witness);
    assert(opening.tree_root == words_to_bytes(tree_root));
}
