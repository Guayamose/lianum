// FIPS 180-4 byte padding around Noir's official SHA-256 compression black box.
// Adapted from ../owner-independent/circuits/authorization/src/main.nr and
// ../native-notes/generate.mjs. The bounded-length variant below is new here.
// No external package, substitute digest, or unconstrained implementation.

fn initial_state() -> [u32; 8] {
    [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
     0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
}

fn compress<let P: u32>(padded: [u8; P], block_index: u32, state: [u32; 8]) -> [u32; 8] {
    let mut block: [u32; 16] = [0; 16];
    for i in 0..16 {
        let offset = block_index * 64 + i * 4;
        block[i] = (padded[offset] as u32 << 24)
            | (padded[offset + 1] as u32 << 16)
            | (padded[offset + 2] as u32 << 8)
            | padded[offset + 3] as u32;
    }
    std::hash::sha256_compression(block, state)
}

pub fn words_to_bytes(words: [u32; 8]) -> [u8; 32] {
    let mut bytes: [u8; 32] = [0; 32];
    for i in 0..8 {
        for j in 0..4 {
            bytes[i * 4 + j] = ((words[i] >> (((3 - j) * 8) as u32)) & 255) as u8;
        }
    }
    bytes
}

pub fn u32_bytes(value: u32) -> [u8; 4] {
    let mut bytes: [u8; 4] = [0; 4];
    for i in 0..4 { bytes[i] = ((value >> (((3 - i) * 8) as u32)) & 255) as u8; }
    bytes
}

pub fn u64_bytes(value: u64) -> [u8; 8] {
    let mut bytes: [u8; 8] = [0; 8];
    for i in 0..8 { bytes[i] = ((value >> (((7 - i) * 8) as u64)) & 255) as u8; }
    bytes
}

pub fn sha256<let N: u32, let P: u32>(message: [u8; N]) -> [u8; 32] {
    assert(P == ((N + 9 + 63) / 64) * 64);
    let mut padded: [u8; P] = [0; P];
    for i in 0..N { padded[i] = message[i]; }
    padded[N] = 128;
    let bit_length = u64_bytes((N as u64) * 8);
    for i in 0..8 { padded[P - 8 + i] = bit_length[i]; }
    let mut state = initial_state();
    for b in 0..P / 64 { state = compress(padded, b, state); }
    words_to_bytes(state)
}

// Only node IDs have a private encoded length. All loop bounds and the maximum
// number of compression calls remain compile-time constants for the profile.
pub fn sha256_bounded<let N: u32, let P: u32>(message: [u8; N], length: u32) -> [u8; 32] {
    assert(length <= N);
    assert(P == ((N + 9 + 63) / 64) * 64);
    let padded_length = ((length + 9 + 63) / 64) * 64;
    let mut padded: [u8; P] = [0; P];
    for i in 0..N {
        if i < length { padded[i] = message[i]; }
        else { assert(message[i] == 0); }
    }
    padded[length] = 128;
    let bit_length = u64_bytes((length as u64) * 8);
    for i in 0..8 { padded[padded_length - 8 + i] = bit_length[i]; }
    let mut state = initial_state();
    for b in 0..P / 64 {
        let next = compress(padded, b, state);
        if b * 64 < padded_length { state = next; }
    }
    words_to_bytes(state)
}
