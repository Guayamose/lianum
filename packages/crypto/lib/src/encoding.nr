// Canonical encodings fixed by design/internal-hash-schema.md.
// B32 is never reduced to one field. F is checked on ORIGINAL bytes before
// any modular reconstruction. Every caller uses bounded u8/u32 ABI types.

pub global PROFILE: Field = 0x4c49414e554d5f504145475f50325f5631;

// Big-endian BN254 scalar modulus r, not the base-field modulus.
global SCALAR_MODULUS: [u8; 32] = [0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d, 0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01];

pub fn canonical_field(bytes: [u8; 32]) -> Field {
    let mut prefix_equal = true;
    let mut less = false;
    for i in 0..32 {
        less = less | (prefix_equal & (bytes[i] < SCALAR_MODULUS[i]));
        prefix_equal = prefix_equal & (bytes[i] == SCALAR_MODULUS[i]);
    }
    // This raw-byte comparison rejects r, x+r, and all larger aliases.
    assert(less);
    let mut value: Field = 0;
    for i in 0..32 { value = value * 256 + bytes[i] as Field; }
    value
}

pub fn raw_digest_limbs(bytes: [u8; 32]) -> [Field; 2] {
    // Each accumulator is an explicitly range-constrained u128. The 16
    // big-endian steps cannot overflow for 16 input bytes. Both limbs fit Fr.
    let mut high: u128 = 0;
    let mut low: u128 = 0;
    for i in 0..16 {
        high = high * 256 + bytes[i] as u128;
        low = low * 256 + bytes[16 + i] as u128;
    }
    [high as Field, low as Field]
}

