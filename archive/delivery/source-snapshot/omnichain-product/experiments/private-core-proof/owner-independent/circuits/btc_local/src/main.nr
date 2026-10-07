// PC18 exact-template composition; source generated without private witnesses.

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


fn main(schema:pub [u32;8],scope:pub [u32;8],policy:pub [u32;8],local:pub [u32;8],effect:pub [u32;8],observed_at:pub u64,valid_from:pub u64,valid_until:pub u64,sol_policy_id:[u8;32],sol_namespace:[u8;32],sol_genesis:[u8;32],sol_issuer_x:[u8;32],sol_issuer_y:[u8;32],btc_policy_id:[u8;32],btc_namespace:[u8;32],btc_genesis:[u8;32],btc_issuer_x:[u8;32],btc_issuer_y:[u8;32],minimum_btc_confirmations:u32,btc_nonce:[u8;32],btc_source:[u8;32],btc_recipient:[u8;32],btc_payment:[u8;32],btc_amount:u64,btc_after:u64,btc_before:u64,btc_from:u64,btc_until:u64,btc_effect_txid:[u8;32],btc_effect_index:u32,btc_block_hash:[u8;32],btc_tip_hash:[u8;32],btc_tag:[u8;32],btc_finality:u64,btc_block_number:u64,btc_tip_number:u64,btc_observed_at:u64,btc_certificate_signature:[u8;64]){
assert(schema==[4214331083,1468730364,2541060267,3988759344,416195804,4092738002,1195476119,2617566558]);
let scope_bytes=words_to_bytes(scope);let policy_bytes=words_to_bytes(policy);assert(minimum_btc_confirmations>=6);
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
assert(btc_amount>0);assert(btc_after<btc_before);assert(btc_from<btc_until);assert(btc_from<=30744573456182586);assert(btc_until<=30744573456182586);assert(btc_after>=btc_from*600);assert(btc_before<=btc_until*600);assert(btc_source==[0;32]);let mut btc_local_frame:[u8;304]=[0,21,80,67,49,53,47,108,111,99,97,108,45,110,111,116,101,45,108,101,103,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
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
let epoch=btc_observed_at/600;
let mut btc_domain_frame:[u8;62]=[0,19,80,67,49,53,47,99,104,97,105,110,45,100,111,109,97,105,110,47,49,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..1{btc_domain_frame[25+i]=[2][i];}
for i in 0..32{btc_domain_frame[30+i]=btc_genesis[i];}
let mut btc_effect_frame:[u8;67]=[0,21,80,67,49,53,47,98,105,116,99,111,105,110,45,101,102,102,101,99,116,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,0];
for i in 0..32{btc_effect_frame[27+i]=btc_effect_txid[i];}
for i in 0..4{btc_effect_frame[63+i]=u32bytes(btc_effect_index)[i];}
let btc_profile:[u8;28]=[84,82,85,83,84,69,68,95,73,83,83,85,69,82,95,85,78,73,81,85,69,78,69,83,83,95,86,49];
let mut btc_cert_message_frame:[u8;584]=[0,25,80,67,49,53,47,110,97,116,105,118,101,45,99,101,114,116,105,102,105,99,97,116,101,47,49,0,0,0,2,0,0,0,0,0,28,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,62,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,67,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..2{btc_cert_message_frame[31+i]=[0,1][i];}
for i in 0..28{btc_cert_message_frame[37+i]=btc_profile[i];}
for i in 0..32{btc_cert_message_frame[69+i]=btc_policy_id[i];}
for i in 0..32{btc_cert_message_frame[105+i]=btc_namespace[i];}
for i in 0..62{btc_cert_message_frame[141+i]=btc_domain_frame[i];}
for i in 0..67{btc_cert_message_frame[207+i]=btc_effect_frame[i];}
for i in 0..32{btc_cert_message_frame[278+i]=btc_local[i];}
for i in 0..32{btc_cert_message_frame[314+i]=btc_source[i];}
for i in 0..32{btc_cert_message_frame[350+i]=btc_recipient[i];}
for i in 0..8{btc_cert_message_frame[386+i]=u64bytes(btc_amount)[i];}
for i in 0..1{btc_cert_message_frame[398+i]=[1][i];}
for i in 0..1{btc_cert_message_frame[403+i]=[2][i];}
for i in 0..8{btc_cert_message_frame[408+i]=u64bytes(btc_finality)[i];}
for i in 0..32{btc_cert_message_frame[420+i]=btc_block_hash[i];}
for i in 0..8{btc_cert_message_frame[456+i]=u64bytes(btc_block_number)[i];}
for i in 0..32{btc_cert_message_frame[468+i]=btc_tip_hash[i];}
for i in 0..8{btc_cert_message_frame[504+i]=u64bytes(btc_tip_number)[i];}
for i in 0..8{btc_cert_message_frame[516+i]=u64bytes(btc_observed_at)[i];}
for i in 0..8{btc_cert_message_frame[528+i]=u64bytes(btc_from)[i];}
for i in 0..8{btc_cert_message_frame[540+i]=u64bytes(btc_until)[i];}
for i in 0..32{btc_cert_message_frame[552+i]=btc_tag[i];}
let btc_cert_message=sha256::<584,640>(btc_cert_message_frame);
assert(std::ecdsa_secp256k1::verify_signature(btc_issuer_x,btc_issuer_y,btc_certificate_signature,btc_cert_message));assert(epoch>=btc_from);assert(epoch<btc_until);assert(epoch<=30744573456182585);assert(btc_observed_at>=btc_after);assert(btc_observed_at<btc_before);assert(btc_observed_at<(epoch+1)*600);assert(btc_tip_number>=btc_block_number);assert(btc_tag!=[0;32]);
assert(btc_finality>=(minimum_btc_confirmations as u64));assert((btc_tip_number as u128)==(btc_block_number as u128)+(btc_finality as u128)-1);
let mut btc_effect_nullifier_frame:[u8;165]=[0,25,80,67,49,53,47,101,102,102,101,99,116,45,99,111,110,115,117,109,112,116,105,111,110,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,62,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{btc_effect_nullifier_frame[31+i]=scope_bytes[i];}
for i in 0..62{btc_effect_nullifier_frame[67+i]=btc_domain_frame[i];}
for i in 0..32{btc_effect_nullifier_frame[133+i]=btc_tag[i];}
let btc_effect_nullifier=sha256::<165,192>(btc_effect_nullifier_frame);
assert(bytes_to_words(btc_local)==local);assert(bytes_to_words(btc_effect_nullifier)==effect);assert(btc_observed_at==observed_at);assert(btc_from==valid_from);assert(btc_until==valid_until);
}
