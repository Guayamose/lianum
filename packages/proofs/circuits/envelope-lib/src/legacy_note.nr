// Keep the existing depth-six SHA note tree byte-for-byte. This helper only
// converts the full raw B32 leaf to its eight big-endian u32 words and rejects
// zero padding as live membership; it does not authenticate root acceptance.
use generic_wrappers::membership;

pub fn digest_words(commitment: [u8; 32]) -> [u32; 8] {
    let mut words: [u32; 8] = [0; 8];
    for i in 0..8 {
        words[i] = (commitment[i * 4] as u32 << 24)
            | (commitment[i * 4 + 1] as u32 << 16)
            | (commitment[i * 4 + 2] as u32 << 8)
            | commitment[i * 4 + 3] as u32;
    }
    words
}

pub fn assert_member(
    commitment: [u8; 32],
    siblings: [[u8; 32]; 6],
    index: u32,
    root: [u32; 8],
) {
    assert(commitment != [0; 32]);
    assert(index < 64);
    membership::assert_member(digest_words(commitment), siblings, index, root);
}
