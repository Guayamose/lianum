// Different valid circuit with the same eleven public-input positions.
fn main(x: Field, k: pub u64, payout_s: pub u64, payout_b: pub u64, digest: pub [u32; 8]) {
    let mut total = k as Field + payout_s as Field + payout_b as Field;
    for word in digest { total = total + word as Field; }
    assert(x == total);
}
