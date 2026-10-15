// Bounded trusted-issuer funded-authority relation. Fixed-template leakage remains.
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


fn u64bytes(n: u64) -> [u8;8] { let mut b=[0;8]; for i in 0..8 { b[i]=((n >> (((7-i)*8) as u64)) & 255) as u8; } b }
fn u32bytes(n: u32) -> [u8;4] { let mut b=[0;4]; for i in 0..4 { b[i]=((n >> (((3-i)*8) as u32)) & 255) as u8; } b }
fn words_to_bytes(w: [u32;8]) -> [u8;32] { let mut b=[0;32]; for i in 0..8 { for j in 0..4 { b[i*4+j]=((w[i] >> (((3-j)*8) as u32)) & 255) as u8; } } b }
fn node_hash(a:[u8;32],b:[u8;32])->[u8;32] { let mut x:[u8;65]=[0;65];x[0]=1;for i in 0..32 {x[1+i]=a[i];x[33+i]=b[i];}sha256::<65,128>(x) }
fn membership(cm:[u8;32], siblings:[[u8;32];6], index:u32, root:[u32;8]) {assert(index<64);let mut h=cm;for d in 0..6 {h=if (index >> d)&1 == 0 {node_hash(h,siblings[d])}else{node_hash(siblings[d],h)};}assert(bytes_to_words(h)==root);}
fn current_absence(scope:[u8;32],kind:u8,entries:[[u8;32];64],count:u32,target:[u8;32],digest:[u32;8]) {assert(count<=64);let mut b:[u8;2085]=[0;2085];b[0]=kind;for i in 0..32{b[1+i]=scope[i];}let n=u32bytes(count);for i in 0..4{b[33+i]=n[i];}for j in 0..64{if j<count {assert(entries[j] != [0;32]);assert(entries[j]!=target);}else{assert(entries[j]==[0;32]);}for i in 0..32{b[37+j*32+i]=entries[j][i];}}assert(bytes_to_words(sha256::<2085,2112>(b))==digest);}

fn main(scope:pub [u32;8],policy:pub [u32;8],epoch:pub u64,root:pub [u32;8],spent_digest:pub [u32;8],spent_count:pub u32,sol_effect_digest:pub [u32;8],sol_effect_count:pub u32,local:pub [u32;8],invocation:pub [u32;8],source:pub [u32;8],recipient:pub [u32;8],amount:pub u64,execute_after:pub u64,execute_before:pub u64,valid_from:pub u64,valid_until:pub u64,payout:pub [u32;8],siblings:[[u8;32];6],leaf_index:u32,spent_entries:[[u8;32];64],origin_seed:[u8;32],
graph_salt:[u8;32],
owner_x:[u8;32],
owner_y:[u8;32],
reserve_secret:[u8;32],
budget:u64,
numerator:u64,
denominator:u64,
claim_epoch:u64,
owner_signature:[u8;64],
sol_policy_id:[u8;32],
sol_namespace:[u8;32],
sol_genesis:[u8;32],
sol_issuer_x:[u8;32],
sol_issuer_y:[u8;32],
btc_policy_id:[u8;32],
btc_namespace:[u8;32],
btc_genesis:[u8;32],
btc_issuer_x:[u8;32],
btc_issuer_y:[u8;32],
minimum_btc_confirmations:u32,
sol_note_x:[u8;32],
sol_note_y:[u8;32],
sol_note_secret:[u8;32],
sol_payout:u64,
btc_note_x:[u8;32],
btc_note_y:[u8;32],
btc_note_secret:[u8;32],
btc_payout:u64,
recovery_note_x:[u8;32],
recovery_note_y:[u8;32],
recovery_note_secret:[u8;32],
sol_nonce:[u8;32],
sol_source:[u8;32],
sol_recipient:[u8;32],
sol_amount:u64,
sol_after:u64,
sol_before:u64,
sol_from:u64,
sol_until:u64,
btc_nonce:[u8;32],
btc_source:[u8;32],
btc_recipient:[u8;32],
btc_amount:u64,
btc_after:u64,
btc_before:u64,
btc_from:u64,
btc_until:u64,sol_effect_entries:[[u8;32];64],sol_effect_signature:[u8;64],sol_effect_index:u32,sol_block_hash:[u8;32],sol_tip_hash:[u8;32],sol_tag:[u8;32],sol_finality:u64,sol_block_number:u64,sol_tip_number:u64,sol_observed_at:u64,sol_certificate_signature:[u8;64]){
let scope_bytes=words_to_bytes(scope);let policy_bytes=words_to_bytes(policy);assert(minimum_btc_confirmations>=6);assert(denominator>0);assert(sol_amount>0);assert(btc_amount>0);assert(btc_source==[0;32]);assert(sol_payout>0);assert(btc_payout>0);assert((sol_payout as u128)+(btc_payout as u128)==(budget as u128));assert((sol_amount as u128)*(numerator as u128)/(denominator as u128)==(btc_amount as u128));assert(claim_epoch>0);assert(claim_epoch<=30744573456182586);
let mut policy_digest_frame:[u8;400]=[0,18,80,67,49,53,47,110,111,116,101,45,112,111,108,105,99,121,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0];
for i in 0..32{policy_digest_frame[24+i]=sol_policy_id[i];}
for i in 0..32{policy_digest_frame[60+i]=sol_namespace[i];}
for i in 0..32{policy_digest_frame[96+i]=sol_genesis[i];}
for i in 0..32{policy_digest_frame[132+i]=sol_issuer_x[i];}
for i in 0..32{policy_digest_frame[168+i]=sol_issuer_y[i];}
for i in 0..32{policy_digest_frame[204+i]=btc_policy_id[i];}
for i in 0..32{policy_digest_frame[240+i]=btc_namespace[i];}
for i in 0..32{policy_digest_frame[276+i]=btc_genesis[i];}
for i in 0..32{policy_digest_frame[312+i]=btc_issuer_x[i];}
for i in 0..32{policy_digest_frame[348+i]=btc_issuer_y[i];}
for i in 0..4{policy_digest_frame[384+i]=u32bytes(minimum_btc_confirmations)[i];}
for i in 0..8{policy_digest_frame[392+i]=u64bytes(600)[i];}
let policy_digest=sha256::<400,448>(policy_digest_frame);
assert(bytes_to_words(policy_digest)==policy);
let mut sol_origin_frame:[u8;97]=[0,18,80,67,49,53,47,110,111,116,101,45,111,114,105,103,105,110,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0];
for i in 0..32{sol_origin_frame[24+i]=scope_bytes[i];}
for i in 0..32{sol_origin_frame[60+i]=origin_seed[i];}
for i in 0..1{sol_origin_frame[96+i]=[1][i];}
let sol_origin=sha256::<97,128>(sol_origin_frame);
let mut sol_payment_frame:[u8;218]=[0,19,80,67,49,53,47,112,97,121,109,101,110,116,45,110,111,116,101,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{sol_payment_frame[25+i]=scope_bytes[i];}
for i in 0..32{sol_payment_frame[61+i]=sol_origin[i];}
for i in 0..1{sol_payment_frame[97+i]=[2][i];}
for i in 0..32{sol_payment_frame[102+i]=sol_note_x[i];}
for i in 0..32{sol_payment_frame[138+i]=sol_note_y[i];}
for i in 0..8{sol_payment_frame[174+i]=u64bytes(sol_payout)[i];}
for i in 0..32{sol_payment_frame[186+i]=sol_note_secret[i];}
let sol_payment=sha256::<218,256>(sol_payment_frame);
let mut btc_origin_frame:[u8;97]=[0,18,80,67,49,53,47,110,111,116,101,45,111,114,105,103,105,110,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0];
for i in 0..32{btc_origin_frame[24+i]=scope_bytes[i];}
for i in 0..32{btc_origin_frame[60+i]=origin_seed[i];}
for i in 0..1{btc_origin_frame[96+i]=[2][i];}
let btc_origin=sha256::<97,128>(btc_origin_frame);
let mut btc_payment_frame:[u8;218]=[0,19,80,67,49,53,47,112,97,121,109,101,110,116,45,110,111,116,101,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{btc_payment_frame[25+i]=scope_bytes[i];}
for i in 0..32{btc_payment_frame[61+i]=btc_origin[i];}
for i in 0..1{btc_payment_frame[97+i]=[2][i];}
for i in 0..32{btc_payment_frame[102+i]=btc_note_x[i];}
for i in 0..32{btc_payment_frame[138+i]=btc_note_y[i];}
for i in 0..8{btc_payment_frame[174+i]=u64bytes(btc_payout)[i];}
for i in 0..32{btc_payment_frame[186+i]=btc_note_secret[i];}
let btc_payment=sha256::<218,256>(btc_payment_frame);
let mut recovery_origin_frame:[u8;97]=[0,18,80,67,49,53,47,110,111,116,101,45,111,114,105,103,105,110,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0];
for i in 0..32{recovery_origin_frame[24+i]=scope_bytes[i];}
for i in 0..32{recovery_origin_frame[60+i]=origin_seed[i];}
for i in 0..1{recovery_origin_frame[96+i]=[3][i];}
let recovery_origin=sha256::<97,128>(recovery_origin_frame);
let mut recovery_payment_frame:[u8;218]=[0,19,80,67,49,53,47,112,97,121,109,101,110,116,45,110,111,116,101,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{recovery_payment_frame[25+i]=scope_bytes[i];}
for i in 0..32{recovery_payment_frame[61+i]=recovery_origin[i];}
for i in 0..1{recovery_payment_frame[97+i]=[3][i];}
for i in 0..32{recovery_payment_frame[102+i]=recovery_note_x[i];}
for i in 0..32{recovery_payment_frame[138+i]=recovery_note_y[i];}
for i in 0..8{recovery_payment_frame[174+i]=u64bytes(budget)[i];}
for i in 0..32{recovery_payment_frame[186+i]=recovery_note_secret[i];}
let recovery_payment=sha256::<218,256>(recovery_payment_frame);
assert(sol_payment!=btc_payment);
assert(sol_after<sol_before);assert(sol_before<=claim_epoch*600);assert(sol_from<sol_until);assert(sol_until<=claim_epoch);assert(sol_from<=30744573456182586);assert(sol_until<=30744573456182586);assert(sol_after>=sol_from*600);assert(sol_before<=sol_until*600);
let mut sol_local_frame:[u8;304]=[0,21,80,67,49,53,47,108,111,99,97,108,45,110,111,116,101,45,108,101,103,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{sol_local_frame[27+i]=scope_bytes[i];}
for i in 0..32{sol_local_frame[63+i]=policy_bytes[i];}
for i in 0..1{sol_local_frame[99+i]=[1][i];}
for i in 0..32{sol_local_frame[104+i]=sol_nonce[i];}
for i in 0..32{sol_local_frame[140+i]=sol_source[i];}
for i in 0..32{sol_local_frame[176+i]=sol_recipient[i];}
for i in 0..8{sol_local_frame[212+i]=u64bytes(sol_amount)[i];}
for i in 0..8{sol_local_frame[224+i]=u64bytes(sol_after)[i];}
for i in 0..8{sol_local_frame[236+i]=u64bytes(sol_before)[i];}
for i in 0..8{sol_local_frame[248+i]=u64bytes(sol_from)[i];}
for i in 0..8{sol_local_frame[260+i]=u64bytes(sol_until)[i];}
for i in 0..32{sol_local_frame[272+i]=sol_payment[i];}
let sol_local=sha256::<304,320>(sol_local_frame);
assert(btc_after<btc_before);assert(btc_before<=claim_epoch*600);assert(btc_from<btc_until);assert(btc_until<=claim_epoch);assert(btc_from<=30744573456182586);assert(btc_until<=30744573456182586);assert(btc_after>=btc_from*600);assert(btc_before<=btc_until*600);
let mut btc_local_frame:[u8;304]=[0,21,80,67,49,53,47,108,111,99,97,108,45,110,111,116,101,45,108,101,103,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{btc_local_frame[27+i]=scope_bytes[i];}
for i in 0..32{btc_local_frame[63+i]=policy_bytes[i];}
for i in 0..1{btc_local_frame[99+i]=[2][i];}
for i in 0..32{btc_local_frame[104+i]=btc_nonce[i];}
for i in 0..32{btc_local_frame[140+i]=btc_source[i];}
for i in 0..32{btc_local_frame[176+i]=btc_recipient[i];}
for i in 0..8{btc_local_frame[212+i]=u64bytes(btc_amount)[i];}
for i in 0..8{btc_local_frame[224+i]=u64bytes(btc_after)[i];}
for i in 0..8{btc_local_frame[236+i]=u64bytes(btc_before)[i];}
for i in 0..8{btc_local_frame[248+i]=u64bytes(btc_from)[i];}
for i in 0..8{btc_local_frame[260+i]=u64bytes(btc_until)[i];}
for i in 0..32{btc_local_frame[272+i]=btc_payment[i];}
let btc_local=sha256::<304,320>(btc_local_frame);
let mut graph_digest_frame:[u8;391]=[0,17,80,67,49,53,47,110,111,116,101,45,103,114,97,112,104,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0];
for i in 0..32{graph_digest_frame[23+i]=scope_bytes[i];}
for i in 0..32{graph_digest_frame[59+i]=policy_bytes[i];}
for i in 0..32{graph_digest_frame[95+i]=origin_seed[i];}
for i in 0..32{graph_digest_frame[131+i]=graph_salt[i];}
for i in 0..32{graph_digest_frame[167+i]=owner_x[i];}
for i in 0..32{graph_digest_frame[203+i]=owner_y[i];}
for i in 0..32{graph_digest_frame[239+i]=sol_local[i];}
for i in 0..32{graph_digest_frame[275+i]=btc_local[i];}
for i in 0..32{graph_digest_frame[311+i]=recovery_payment[i];}
for i in 0..8{graph_digest_frame[347+i]=u64bytes(budget)[i];}
for i in 0..8{graph_digest_frame[359+i]=u64bytes(numerator)[i];}
for i in 0..8{graph_digest_frame[371+i]=u64bytes(denominator)[i];}
for i in 0..8{graph_digest_frame[383+i]=u64bytes(claim_epoch)[i];}
let graph_digest=sha256::<391,448>(graph_digest_frame);
let mut note_commitment_frame:[u8;262]=[0,20,80,67,49,53,47,114,101,115,101,114,118,101,100,45,110,111,116,101,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0];
for i in 0..32{note_commitment_frame[26+i]=scope_bytes[i];}
for i in 0..32{note_commitment_frame[62+i]=origin_seed[i];}
for i in 0..32{note_commitment_frame[98+i]=owner_x[i];}
for i in 0..32{note_commitment_frame[134+i]=owner_y[i];}
for i in 0..8{note_commitment_frame[170+i]=u64bytes(budget)[i];}
for i in 0..32{note_commitment_frame[182+i]=graph_digest[i];}
for i in 0..32{note_commitment_frame[218+i]=reserve_secret[i];}
for i in 0..8{note_commitment_frame[254+i]=u64bytes(claim_epoch)[i];}
let note_commitment=sha256::<262,320>(note_commitment_frame);
let mut owner_message_frame:[u8;131]=[0,21,80,67,49,53,47,110,111,116,101,45,97,117,116,104,111,114,105,122,101,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{owner_message_frame[27+i]=scope_bytes[i];}
for i in 0..32{owner_message_frame[63+i]=policy_bytes[i];}
for i in 0..32{owner_message_frame[99+i]=graph_digest[i];}
let owner_message=sha256::<131,192>(owner_message_frame);
assert(std::ecdsa_secp256k1::verify_signature(owner_x,owner_y,owner_signature,owner_message));
let mut note_nullifier_frame:[u8;127]=[0,17,80,67,49,53,47,110,111,116,101,45,115,112,101,110,100,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{note_nullifier_frame[23+i]=scope_bytes[i];}
for i in 0..32{note_nullifier_frame[59+i]=note_commitment[i];}
for i in 0..32{note_nullifier_frame[95+i]=reserve_secret[i];}
let note_nullifier=sha256::<127,192>(note_nullifier_frame);
membership(note_commitment,siblings,leaf_index,root);
assert(epoch<claim_epoch);current_absence(scope_bytes,2,spent_entries,spent_count,note_nullifier,spent_digest);assert(bytes_to_words(btc_local)==local);assert(bytes_to_words(btc_nonce)==invocation);assert(bytes_to_words(btc_source)==source);assert(bytes_to_words(btc_recipient)==recipient);assert(btc_amount==amount);assert(btc_after==execute_after);assert(btc_before==execute_before);assert(btc_from==valid_from);assert(btc_until==valid_until);assert(epoch>=valid_from);assert(epoch<valid_until);assert(bytes_to_words(btc_payment)==payout);let mut sol_domain_frame:[u8;62]=[0,19,80,67,49,53,47,99,104,97,105,110,45,100,111,109,97,105,110,47,49,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..1{sol_domain_frame[25+i]=[1][i];}
for i in 0..32{sol_domain_frame[30+i]=sol_genesis[i];}
let mut sol_effect_frame:[u8;98]=[0,20,80,67,49,53,47,115,111,108,97,110,97,45,101,102,102,101,99,116,47,49,0,0,0,64,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,0];
for i in 0..64{sol_effect_frame[26+i]=sol_effect_signature[i];}
for i in 0..4{sol_effect_frame[94+i]=u32bytes(sol_effect_index)[i];}
let sol_profile:[u8;28]=[84,82,85,83,84,69,68,95,73,83,83,85,69,82,95,85,78,73,81,85,69,78,69,83,83,95,86,49];
let mut sol_cert_message_frame:[u8;615]=[0,25,80,67,49,53,47,110,97,116,105,118,101,45,99,101,114,116,105,102,105,99,97,116,101,47,49,0,0,0,2,0,0,0,0,0,28,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,62,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,98,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..2{sol_cert_message_frame[31+i]=[0,1][i];}
for i in 0..28{sol_cert_message_frame[37+i]=sol_profile[i];}
for i in 0..32{sol_cert_message_frame[69+i]=sol_policy_id[i];}
for i in 0..32{sol_cert_message_frame[105+i]=sol_namespace[i];}
for i in 0..62{sol_cert_message_frame[141+i]=sol_domain_frame[i];}
for i in 0..98{sol_cert_message_frame[207+i]=sol_effect_frame[i];}
for i in 0..32{sol_cert_message_frame[309+i]=sol_local[i];}
for i in 0..32{sol_cert_message_frame[345+i]=sol_source[i];}
for i in 0..32{sol_cert_message_frame[381+i]=sol_recipient[i];}
for i in 0..8{sol_cert_message_frame[417+i]=u64bytes(sol_amount)[i];}
for i in 0..1{sol_cert_message_frame[429+i]=[1][i];}
for i in 0..1{sol_cert_message_frame[434+i]=[1][i];}
for i in 0..8{sol_cert_message_frame[439+i]=u64bytes(sol_finality)[i];}
for i in 0..32{sol_cert_message_frame[451+i]=sol_block_hash[i];}
for i in 0..8{sol_cert_message_frame[487+i]=u64bytes(sol_block_number)[i];}
for i in 0..32{sol_cert_message_frame[499+i]=sol_tip_hash[i];}
for i in 0..8{sol_cert_message_frame[535+i]=u64bytes(sol_tip_number)[i];}
for i in 0..8{sol_cert_message_frame[547+i]=u64bytes(sol_observed_at)[i];}
for i in 0..8{sol_cert_message_frame[559+i]=u64bytes(sol_from)[i];}
for i in 0..8{sol_cert_message_frame[571+i]=u64bytes(sol_until)[i];}
for i in 0..32{sol_cert_message_frame[583+i]=sol_tag[i];}
let sol_cert_message=sha256::<615,640>(sol_cert_message_frame);
assert(std::ecdsa_secp256k1::verify_signature(sol_issuer_x,sol_issuer_y,sol_certificate_signature,sol_cert_message));assert(epoch>=sol_from);assert(epoch<sol_until);assert(epoch<=30744573456182585);assert(sol_observed_at>=sol_after);assert(sol_observed_at<sol_before);assert(sol_observed_at<(epoch+1)*600);assert(sol_tip_number>=sol_block_number);assert(sol_tag!=[0;32]);
assert(sol_effect_index==0);assert(sol_finality==1);assert(sol_tip_hash==[0;32]);
let mut sol_effect_nullifier_frame:[u8;165]=[0,25,80,67,49,53,47,101,102,102,101,99,116,45,99,111,110,115,117,109,112,116,105,111,110,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,62,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{sol_effect_nullifier_frame[31+i]=scope_bytes[i];}
for i in 0..62{sol_effect_nullifier_frame[67+i]=sol_domain_frame[i];}
for i in 0..32{sol_effect_nullifier_frame[133+i]=sol_tag[i];}
let sol_effect_nullifier=sha256::<165,192>(sol_effect_nullifier_frame);
current_absence(scope_bytes,3,sol_effect_entries,sol_effect_count,sol_effect_nullifier,sol_effect_digest);
}
