// PC23 ETH-only reusable balance; pinned legacy reserve c08bfd63453faff529c8cda734a81506807a73a052139d5491369db467e09112.
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


fn main(scope:pub [u32;8],policy:pub [u32;8],epoch:pub u64,amount:pub u64,output:pub [u32;8],rho:[u8;32],key_x:[u8;32],key_y:[u8;32],secret:[u8;32],signature:[u8;64]){
let scope_bytes=words_to_bytes(scope);let policy_bytes=words_to_bytes(policy);assert(amount>0);
let mut balance_commitment_frame:[u8;254]=[0,19,80,67,50,51,47,98,97,108,97,110,99,101,45,110,111,116,101,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{balance_commitment_frame[25+i]=scope_bytes[i];}
for i in 0..32{balance_commitment_frame[61+i]=policy_bytes[i];}
for i in 0..1{balance_commitment_frame[97+i]=[4][i];}
for i in 0..32{balance_commitment_frame[102+i]=rho[i];}
for i in 0..32{balance_commitment_frame[138+i]=key_x[i];}
for i in 0..32{balance_commitment_frame[174+i]=key_y[i];}
for i in 0..8{balance_commitment_frame[210+i]=u64bytes(amount)[i];}
for i in 0..32{balance_commitment_frame[222+i]=secret[i];}
let balance_commitment=sha256::<254,320>(balance_commitment_frame);
assert(balance_commitment!=[0;32]);assert(bytes_to_words(balance_commitment)==output);
let mut deposit_message_frame:[u8;156]=[0,22,80,67,50,51,47,98,97,108,97,110,99,101,45,100,101,112,111,115,105,116,47,49,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
for i in 0..32{deposit_message_frame[28+i]=scope_bytes[i];}
for i in 0..32{deposit_message_frame[64+i]=policy_bytes[i];}
for i in 0..8{deposit_message_frame[100+i]=u64bytes(epoch)[i];}
for i in 0..8{deposit_message_frame[112+i]=u64bytes(amount)[i];}
for i in 0..32{deposit_message_frame[124+i]=balance_commitment[i];}
let deposit_message=sha256::<156,192>(deposit_message_frame);
assert(std::ecdsa_secp256k1::verify_signature(key_x,key_y,signature,deposit_message));
}
