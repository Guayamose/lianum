// FIPS 180-4 fixed-byte-length padding and block composition. Compression is
// the installed official Noir SHA-256 black box, not a new hash primitive.
// No unconstrained computation, oracle or host validity input is used.
pub fn digest<let N: u32>(input: [u8; N]) -> [u8; 32] {
    let blocks: u32 = (N + 72) / 64;
    let mut padded: [u8; N + 72] = [0; N + 72];
    for i in 0..N { padded[i] = input[i]; }
    padded[N] = 128;
    let bit_length: u64 = (N as u64) * 8;
    for i in 0..8 {
        padded[blocks * 64 - 8 + i] = ((bit_length >> (((7 - i) * 8) as u64)) & 255) as u8;
    }
    let mut state: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    for b in 0..blocks {
        let mut block: [u32; 16] = [0; 16];
        for w in 0..16 {
            let offset = b * 64 + w * 4;
            block[w] = (padded[offset] as u32 << 24) | (padded[offset + 1] as u32 << 16)
                | (padded[offset + 2] as u32 << 8) | padded[offset + 3] as u32;
        }
        state = std::hash::sha256_compression(block, state);
    }
    let mut output = [0; 32];
    for w in 0..8 {
        for i in 0..4 { output[w * 4 + i] = ((state[w] >> ((3 - i) * 8)) & 255) as u8; }
    }
    output
}
