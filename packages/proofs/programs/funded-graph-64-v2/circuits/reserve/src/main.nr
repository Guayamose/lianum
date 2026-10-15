use profile64::graph::{Witness,domain,assert_authorization,note_membership};
use graph_support::sha256::words_to_bytes;
fn main(domain_commitment:pub [u32;8],input_root:pub [u32;8],input_nullifier:pub [u32;8],authorization_root:pub [u32;8],reserve_nullifier:pub [u32;8],change_commitment:pub [u32;8],recovery_commitment:pub [u32;8],graph_root:pub [u32;8],output_root:pub [u32;8],funding_not_before:pub u64,funding_valid_until:pub u64,settle_before:pub u64,witness:Witness,input_siblings:[[u8;32];8],input_index:u32){
 let s=witness.statement;assert(domain(s)==words_to_bytes(domain_commitment));assert_authorization(witness);
 assert(s.input_nullifier==words_to_bytes(input_nullifier));assert(s.authorization_root==words_to_bytes(authorization_root));assert(s.reserve_nullifier==words_to_bytes(reserve_nullifier));assert(s.change_commitment==words_to_bytes(change_commitment));assert(s.recovery_commitment==words_to_bytes(recovery_commitment));assert(s.graph_root==words_to_bytes(graph_root));assert(s.output_root==words_to_bytes(output_root));assert(s.funding_not_before==funding_not_before);assert(s.funding_valid_until==funding_valid_until);assert(s.settle_before==settle_before);
 note_membership(s.input_commitment,input_siblings,input_index,words_to_bytes(input_root));
}
