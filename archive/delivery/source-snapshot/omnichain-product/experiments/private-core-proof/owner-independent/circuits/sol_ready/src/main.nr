// PC18 exact-template composition; source generated without private witnesses.
mod bb_proof_verification;
mod approved_vk;
fn accepted_history(scope:[u8;32],entries:[[u8;32];65],count:u32,target:[u8;32],digest:[u32;8],latest:[u32;8]){assert(count>0);assert(count<=65);let mut b:[u8;2117]=[0;2117];b[0]=24;for i in 0..32{b[1+i]=scope[i];}let n=u32bytes(count);for i in 0..4{b[33+i]=n[i];}let mut found=false;for j in 0..65{if j<count {assert(entries[j]!=[0;32]);if entries[j]==target{found=true;}if j+1==count{assert(bytes_to_words(entries[j])==latest);}}else{assert(entries[j]==[0;32]);}for i in 0..32{b[37+j*32+i]=entries[j][i];}}assert(found);assert(bytes_to_words(sha256::<2117,2176>(b))==digest);}
fn field_u64(v:Field)->u64{let n=v as u64;assert(n as Field==v);n}
fn field_words(v:[Field;8])->[u32;8]{let mut result:[u32;8]=[0;8];for i in 0..8{result[i]=v[i] as u32;assert(result[i] as Field==v[i]);}result}

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


fn main(schema:pub [u32;8],scope:pub [u32;8],policy:pub [u32;8],epoch:pub u64,history_digest:pub [u32;8],history_count:pub u32,current_root:pub [u32;8],spent_digest:pub [u32;8],spent_count:pub u32,state_sequence:pub u64,local:pub [u32;8],coverage_halted:pub u8,a_vk:[Field;115],a_proof:[Field;458],a_inputs:[Field;81],history_entries:[[u8;32];65],spent_entries:[[u8;32];64]){
assert(schema==[2927361149,3304130059,2660919382,1967292480,4291868391,2359543055,1400245071,252494325]);
assert(a_vk==approved_vk::AUTHORIZATION_VK);bb_proof_verification::verify_honk_proof(a_vk,a_proof,a_inputs,approved_vk::AUTHORIZATION_HASH);
assert(field_words([a_inputs[0],a_inputs[1],a_inputs[2],a_inputs[3],a_inputs[4],a_inputs[5],a_inputs[6],a_inputs[7]])==[900382361,2607841152,2956819233,4005858787,198086193,3094419975,4282784581,729704267]);
assert(field_words([a_inputs[8],a_inputs[9],a_inputs[10],a_inputs[11],a_inputs[12],a_inputs[13],a_inputs[14],a_inputs[15]])==scope);
assert(field_words([a_inputs[16],a_inputs[17],a_inputs[18],a_inputs[19],a_inputs[20],a_inputs[21],a_inputs[22],a_inputs[23]])==policy);
assert(coverage_halted==0);assert(epoch<=30744573456182585);assert(epoch<field_u64(a_inputs[80]));let scope_bytes=words_to_bytes(scope);let a_root=words_to_bytes(field_words([a_inputs[24],a_inputs[25],a_inputs[26],a_inputs[27],a_inputs[28],a_inputs[29],a_inputs[30],a_inputs[31]]));let a_nf=words_to_bytes(field_words([a_inputs[32],a_inputs[33],a_inputs[34],a_inputs[35],a_inputs[36],a_inputs[37],a_inputs[38],a_inputs[39]]));accepted_history(scope_bytes,history_entries,history_count,a_root,history_digest,current_root);current_absence(scope_bytes,2,spent_entries,spent_count,a_nf,spent_digest);assert(state_sequence>=((history_count-1) as u64));assert(state_sequence>=(spent_count as u64));
assert(field_words([a_inputs[40],a_inputs[41],a_inputs[42],a_inputs[43],a_inputs[44],a_inputs[45],a_inputs[46],a_inputs[47]])==local);

}
