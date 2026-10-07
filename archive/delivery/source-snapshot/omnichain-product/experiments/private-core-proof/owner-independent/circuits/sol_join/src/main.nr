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


fn main(schema:pub [u32;8],authorization_inputs:pub [Field;81],effect_sol:pub [u32;8],observed_at:pub u64,valid_from:pub u64,valid_until:pub u64,a_vk:[Field;115],a_proof:[Field;458],a_inputs:[Field;81],sol_vk:[Field;115],sol_proof:[Field;458],sol_inputs:[Field;43]){
assert(schema==[1201100476,1329701779,870777516,3976282299,2426728617,2126125984,1865716354,1149031447]);
assert(a_vk==approved_vk::AUTHORIZATION_VK);bb_proof_verification::verify_honk_proof(a_vk,a_proof,a_inputs,approved_vk::AUTHORIZATION_HASH);
assert(field_words([a_inputs[0],a_inputs[1],a_inputs[2],a_inputs[3],a_inputs[4],a_inputs[5],a_inputs[6],a_inputs[7]])==[900382361,2607841152,2956819233,4005858787,198086193,3094419975,4282784581,729704267]);
assert(sol_vk==approved_vk::SOL_LOCAL_VK);bb_proof_verification::verify_honk_proof(sol_vk,sol_proof,sol_inputs,approved_vk::SOL_LOCAL_HASH);
assert(field_words([sol_inputs[0],sol_inputs[1],sol_inputs[2],sol_inputs[3],sol_inputs[4],sol_inputs[5],sol_inputs[6],sol_inputs[7]])==[170633239,1050715480,1371636528,2860154364,3925802882,2733889089,2055688898,3294356903]);
assert([sol_inputs[8],sol_inputs[9],sol_inputs[10],sol_inputs[11],sol_inputs[12],sol_inputs[13],sol_inputs[14],sol_inputs[15]]==[a_inputs[8],a_inputs[9],a_inputs[10],a_inputs[11],a_inputs[12],a_inputs[13],a_inputs[14],a_inputs[15]]);
assert([sol_inputs[16],sol_inputs[17],sol_inputs[18],sol_inputs[19],sol_inputs[20],sol_inputs[21],sol_inputs[22],sol_inputs[23]]==[a_inputs[16],a_inputs[17],a_inputs[18],a_inputs[19],a_inputs[20],a_inputs[21],a_inputs[22],a_inputs[23]]);
assert([sol_inputs[24],sol_inputs[25],sol_inputs[26],sol_inputs[27],sol_inputs[28],sol_inputs[29],sol_inputs[30],sol_inputs[31]]==[a_inputs[40],a_inputs[41],a_inputs[42],a_inputs[43],a_inputs[44],a_inputs[45],a_inputs[46],a_inputs[47]]);
assert(authorization_inputs==a_inputs);assert(field_words([sol_inputs[32],sol_inputs[33],sol_inputs[34],sol_inputs[35],sol_inputs[36],sol_inputs[37],sol_inputs[38],sol_inputs[39]])==effect_sol);
assert(field_u64(sol_inputs[40])==observed_at);assert(field_u64(sol_inputs[41])==valid_from);assert(field_u64(sol_inputs[42])==valid_until);
}
