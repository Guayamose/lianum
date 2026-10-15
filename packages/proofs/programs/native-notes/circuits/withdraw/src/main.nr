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

fn main(scope:pub [u32;8],policy:pub [u32;8],epoch:pub u64,root:pub [u32;8],spent:pub [u32;8],amount:pub u64,recipient:pub [u32;5],siblings:[[u8;32];6],leaf_index:u32,note_type:u8,note_origin:[u8;32],key_x:[u8;32],key_y:[u8;32],value:u64,secret:[u8;32],signature:[u8;64]){
let scope_bytes=words_to_bytes(scope);let policy_bytes=words_to_bytes(policy);assert((note_type==2) | (note_type==3));assert(value>0);assert(amount==value);let kind:[u8;1]=[note_type];
let mut note_commitment_frame:[u8;218]=[0,19,80,67,49,53,47,112,97,121,109,101,110,116,45,110,111,116,101,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{note_commitment_frame[25+i]=scope_bytes[i];}
for i in 0..32{note_commitment_frame[61+i]=note_origin[i];}
for i in 0..1{note_commitment_frame[97+i]=kind[i];}
for i in 0..32{note_commitment_frame[102+i]=key_x[i];}
for i in 0..32{note_commitment_frame[138+i]=key_y[i];}
for i in 0..8{note_commitment_frame[174+i]=u64bytes(value)[i];}
for i in 0..32{note_commitment_frame[186+i]=secret[i];}
let note_commitment=sha256::<218,256>(note_commitment_frame);
membership(note_commitment,siblings,leaf_index,root);
let mut note_nullifier_frame:[u8;127]=[0,17,80,67,49,53,47,110,111,116,101,45,115,112,101,110,100,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{note_nullifier_frame[23+i]=scope_bytes[i];}
for i in 0..32{note_nullifier_frame[59+i]=note_commitment[i];}
for i in 0..32{note_nullifier_frame[95+i]=secret[i];}
let note_nullifier=sha256::<127,192>(note_nullifier_frame);
assert(bytes_to_words(note_nullifier)==spent);let mut recipient_bytes:[u8;20]=[0;20];for i in 0..5{let b=u32bytes(recipient[i]);for j in 0..4{recipient_bytes[i*4+j]=b[j];}}
let mut withdraw_message_frame:[u8;178]=[0,20,80,67,49,53,47,110,111,116,101,45,119,105,116,104,100,114,97,119,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,20,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0];
for i in 0..32{withdraw_message_frame[26+i]=scope_bytes[i];}
for i in 0..32{withdraw_message_frame[62+i]=policy_bytes[i];}
for i in 0..32{withdraw_message_frame[98+i]=note_commitment[i];}
for i in 0..20{withdraw_message_frame[134+i]=recipient_bytes[i];}
for i in 0..8{withdraw_message_frame[158+i]=u64bytes(amount)[i];}
for i in 0..8{withdraw_message_frame[170+i]=u64bytes(epoch)[i];}
let withdraw_message=sha256::<178,192>(withdraw_message_frame);
assert(std::ecdsa_secp256k1::verify_signature(key_x,key_y,signature,withdraw_message));
}
