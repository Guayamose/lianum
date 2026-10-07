// UNFUNDED CAPABILITY ONLY. Public signer commitment is not funded-note ownership.
// All witness bytes, keys, signatures and lengths are constrained. No host validity flag.
// FIPS 180-4 padding, initial state and byte conversion only. Every round
// is performed by the pinned official SHA-256 compression black box.
fn sha256<let N: u32, let P: u32>(message: [u8; N]) -> [u8; 32] {
    assert(P == ((N + 9 + 63) / 64) * 64);
    let mut padded: [u8; P] = [0; P];
    for i in 0..N { padded[i] = message[i]; }
    padded[N] = 128;
    let bit_length: u64 = (N as u64) * 8;
    for i in 0..8 { padded[P - 8 + i] = ((bit_length >> (((7 - i) * 8) as u64)) & 255) as u8; }
    let mut state: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    for b in 0..P / 64 {
        let mut block: [u32; 16] = [0; 16];
        for i in 0..16 {
            let o = b * 64 + i * 4;
            block[i] = (padded[o] as u32 << 24) | (padded[o + 1] as u32 << 16) | (padded[o + 2] as u32 << 8) | padded[o + 3] as u32;
        }
        state = std::hash::sha256_compression(block, state);
    }
    let mut digest: [u8; 32] = [0; 32];
    for i in 0..8 { for j in 0..4 { digest[i * 4 + j] = ((state[i] >> (((3 - j) * 8) as u32)) & 255) as u8; } }
    digest
}
fn bytes_to_words(digest: [u8; 32]) -> [u32; 8] {
    let mut words: [u32; 8] = [0; 8];
    for i in 0..8 { words[i] = (digest[i * 4] as u32 << 24) | (digest[i * 4 + 1] as u32 << 16) | (digest[i * 4 + 2] as u32 << 8) | digest[i * 4 + 3] as u32; }
    words
}

fn main(
    scope: pub [u32; 8], owner_commitment: pub [u32; 8], graph_commitment: pub [u32; 8],
    graph: [u8; 32], salt: [u8; 32], economic_policy: [u8; 32],
    public_key_x: [u8; 32], public_key_y: [u8; 32], signature: [u8; 64],
) {
    assert(scope == [4114231421, 1562370314, 2739474341, 576017507, 615388818, 2224173925, 325053030, 2956731330]);
    let scope_bytes: [u8; 32] = [245, 58, 48, 125, 93, 31, 225, 10, 163, 73, 15, 165, 34, 85, 84, 99, 36, 174, 22, 146, 132, 146, 51, 101, 19, 95, 234, 102, 176, 60, 35, 194];
    let version: [u8; 4] = [0, 0, 0, 1];
    let mut graph_frame: [u8; 92] = [0, 18, 80, 67, 49, 53, 47, 109, 105, 99, 114, 111, 45, 103, 114, 97, 112, 104, 47, 49, 0, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for i in 0..32 { graph_frame[24 + i] = graph[i]; }
    for i in 0..32 { graph_frame[60 + i] = salt[i]; }
    let graph_digest = sha256::<92, 128>(graph_frame);
    assert(bytes_to_words(graph_digest) == graph_commitment);
    let mut key_frame: [u8; 90] = [0, 16, 80, 67, 49, 53, 47, 111, 119, 110, 101, 114, 45, 107, 101, 121, 47, 49, 0, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for i in 0..32 { key_frame[22 + i] = public_key_x[i]; }
    for i in 0..32 { key_frame[58 + i] = public_key_y[i]; }
    assert(bytes_to_words(sha256::<90, 128>(key_frame)) == owner_commitment);
    let mut auth_frame: [u8; 144] = [0, 26, 80, 67, 49, 53, 47, 111, 119, 110, 101, 114, 45, 97, 117, 116, 104, 111, 114, 105, 122, 97, 116, 105, 111, 110, 47, 49, 0, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for i in 0..32 { auth_frame[32 + i] = scope_bytes[i]; }
    for i in 0..4 { auth_frame[68 + i] = version[i]; }
    for i in 0..32 { auth_frame[76 + i] = graph_digest[i]; }
    for i in 0..32 { auth_frame[112 + i] = economic_policy[i]; }
    let message_hash = sha256::<144, 192>(auth_frame);
    assert(std::ecdsa_secp256k1::verify_signature(public_key_x, public_key_y, signature, message_hash));
}
