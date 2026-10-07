mod sha256;
mod wire;
use wire::{read16, read64, same32};

// PC5-QB-1 only: no signature/VRF/HPKE, note authority or effect validity flags.
fn main(
    menu_bytes: [u8; 538], leg_s: [u8; 344], leg_b: [u8; 337], result_salt: [u8; 32],
    scope: pub [u8; 32], session: pub [u8; 32], branch: pub u8,
    menu_binding: pub [u8; 32], c_s: pub [u8; 32], c_b: pub [u8; 32],
) {
    wire::check_menu(menu_bytes); wire::check_leg_s(leg_s); wire::check_leg_b(leg_b);
    assert(read16(menu_bytes, wire::MENU_VERSION) == 1);
    assert(read16(leg_s, wire::LEG_S_VERSION) == 1);
    assert(read16(leg_b, wire::LEG_B_VERSION) == 1);
    assert(menu_bytes[wire::MENU_TOPOLOGY] == 1);
    assert(branch < 2);
    assert(leg_s[wire::LEG_S_ROLE] == 1); assert(leg_b[wire::LEG_B_ROLE] == 2);
    assert(leg_s[wire::LEG_S_BRANCH] == branch); assert(leg_b[wire::LEG_B_BRANCH] == branch);
    same32(menu_bytes, wire::MENU_SCOPE, scope, 0); same32(menu_bytes, wire::MENU_SESSION, session, 0);
    same32(leg_s, wire::LEG_S_SCOPE, scope, 0); same32(leg_b, wire::LEG_B_SCOPE, scope, 0);
    assert(sha256::digest(menu_bytes) == menu_binding);
    assert(sha256::digest(leg_s) == c_s); assert(sha256::digest(leg_b) == c_b);
    let salt_commitment = sha256::digest(wire::salt_record(result_salt));
    same32(menu_bytes, wire::MENU_RESULT_SALT_COMMITMENT, salt_commitment, 0);
    same32(leg_s, wire::LEG_S_RESULT_SALT_COMMITMENT, salt_commitment, 0);
    assert(leg_b[wire::LEG_B_PARENT_RULE] == 1);
    same32(leg_b, wire::LEG_B_PARENT_CONSTRAINT, c_s, 0);

    let sd = wire::MENU_S_DESCRIPTOR; let bd = wire::MENU_B_DESCRIPTOR;
    same32(menu_bytes, sd, leg_s, wire::LEG_S_CHAIN_DOMAIN);
    same32(menu_bytes, sd + 32, leg_s, wire::LEG_S_RECIPIENT);
    same32(menu_bytes, sd + 64, leg_s, wire::LEG_S_ATTEMPT);
    same32(menu_bytes, sd + 96, leg_s, wire::LEG_S_POLICY);
    assert(read64(menu_bytes, sd + 128) == read64(leg_s, wire::LEG_S_NATIVE_FEE_CAP));
    same32(menu_bytes, bd, leg_b, wire::LEG_B_CHAIN_DOMAIN);
    for i in 0..20 { assert(menu_bytes[bd + 32 + i] == leg_b[wire::LEG_B_RECIPIENT_PROGRAM + i]); }
    same32(menu_bytes, bd + 52, leg_b, wire::LEG_B_ATTEMPT);
    same32(menu_bytes, bd + 84, leg_b, wire::LEG_B_POLICY);
    assert(read64(menu_bytes, bd + 116) == read64(leg_b, wire::LEG_B_NATIVE_FEE_CAP));
    let execute_by = read64(menu_bytes, wire::MENU_TIMING); let claim_by = read64(menu_bytes, wire::MENU_TIMING + 8);
    assert(execute_by > 0); assert(execute_by < claim_by);
    assert(read64(leg_s, wire::LEG_S_EXECUTE_BY) == execute_by); assert(read64(leg_b, wire::LEG_B_EXECUTE_BY) == execute_by);
    assert(read64(leg_s, wire::LEG_S_CLAIM_BY) == claim_by); assert(read64(leg_b, wire::LEG_B_CLAIM_BY) == claim_by);
    let q = wire::MENU_QUOTE;
    let budget = read64(menu_bytes, q); let fs = read64(menu_bytes, q + 8); let fb = read64(menu_bytes, q + 16);
    let ps = read64(menu_bytes, q + 24); let qs = read64(menu_bytes, q + 32);
    let pb = read64(menu_bytes, q + 40); let qb = read64(menu_bytes, q + 48);
    assert(budget > 0); assert(ps > 0); assert(qs > 0); assert(pb > 0); assert(qb > 0);
    let s0 = read64(menu_bytes, wire::MENU_OUTCOMES); let s1 = read64(menu_bytes, wire::MENU_OUTCOMES + 8);
    assert(s0 > 0); assert(s0 < s1);
    let max64: u128 = 18446744073709551615;
    for i in 0..2 {
        let amount_s = read64(menu_bytes, wire::MENU_OUTCOMES + i * 8);
        let numerator: u128 = (amount_s as u128) * (ps as u128);
        let cost: u128 = numerator / (qs as u128) + if numerator % (qs as u128) == 0 { 0 } else { 1 };
        assert(cost <= max64);
        let total: u128 = cost + (fs as u128) + (fb as u128); assert(total <= budget as u128);
        let residual: u128 = (budget as u128) - total;
        let amount_b: u128 = (residual * (qb as u128)) / (pb as u128);
        assert(amount_b > 0); assert(amount_b <= max64);
        let payout_s: u128 = cost + (fs as u128); let payout_b: u128 = (budget as u128) - payout_s;
        if branch == i as u8 {
            assert(read64(leg_s, wire::LEG_S_AMOUNT) == amount_s);
            assert(read64(leg_b, wire::LEG_B_AMOUNT) == amount_b as u64);
            assert(read64(leg_s, wire::LEG_S_PAYOUT_VALUE) == payout_s as u64);
            assert(read64(leg_b, wire::LEG_B_PAYOUT_VALUE) == payout_b as u64);
        }
    }
}
