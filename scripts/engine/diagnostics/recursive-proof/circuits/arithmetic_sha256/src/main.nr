// Tiny capability relation only; no authorization, chain facts, VRF or notes.
// SHA-256 of exactly 32 bytes uses the standard compression black box with
// fixed FIPS 180-4 initial state and one-block message padding (256 bits).
fn main(
    s: u64,
    salt: [u8; 24],
    k: pub u64,
    payout_s: pub u64,
    payout_b: pub u64,
    digest: pub [u32; 8],
) {
    assert((s == 3000000) | (s == 3500000));
    let cost: u64 = (s + 9) / 10;
    assert(k == (1000000 - 10000 - 15000 - cost) / 4);
    assert(payout_s == cost + 10000);
    assert(payout_b == 1000000 - payout_s);

    let mut message: [u8; 32] = [0; 32];
    for i in 0..8 {
        message[i] = ((s >> (((7 - i) * 8) as u64)) & 255) as u8;
    }
    for i in 0..24 { message[i + 8] = salt[i]; }
    let mut block: [u32; 16] = [0; 16];
    for i in 0..8 {
        block[i] = (message[i * 4] as u32 << 24)
            | (message[i * 4 + 1] as u32 << 16)
            | (message[i * 4 + 2] as u32 << 8)
            | (message[i * 4 + 3] as u32);
    }
    block[8] = 0x80000000;
    block[15] = 256;
    let initial: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    assert(std::hash::sha256_compression(block, initial) == digest);
}
