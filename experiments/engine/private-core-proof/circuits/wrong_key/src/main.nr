// Deliberately different relation with the same public-input count, for wrong-VK rejection.
fn main(scope: pub [u32; 8], owner_commitment: pub [u32; 8], graph_commitment: pub [u32; 8]) {
    assert(scope[0] == owner_commitment[0] + graph_commitment[0]);
}
