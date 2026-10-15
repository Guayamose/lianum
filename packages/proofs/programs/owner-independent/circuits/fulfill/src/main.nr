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


fn main(scope:pub [u32;8],policy:pub [u32;8],epoch:pub u64,root:pub [u32;8],spent:pub [u32;8],effect_sol:pub [u32;8],effect_btc:pub [u32;8],output_sol:pub [u32;8],output_btc:pub [u32;8],j_vk:[Field;115],j_proof:[Field;458],j_inputs:[Field;100],btc_vk:[Field;115],btc_proof:[Field;458],btc_inputs:[Field;43]){
assert(j_vk==approved_vk::SOL_JOIN_VK);bb_proof_verification::verify_honk_proof(j_vk,j_proof,j_inputs,approved_vk::SOL_JOIN_HASH);
assert(field_words([j_inputs[0],j_inputs[1],j_inputs[2],j_inputs[3],j_inputs[4],j_inputs[5],j_inputs[6],j_inputs[7]])==[1201100476,1329701779,870777516,3976282299,2426728617,2126125984,1865716354,1149031447]);
let a_inputs:[Field;81]=[j_inputs[8],j_inputs[9],j_inputs[10],j_inputs[11],j_inputs[12],j_inputs[13],j_inputs[14],j_inputs[15],j_inputs[16],j_inputs[17],j_inputs[18],j_inputs[19],j_inputs[20],j_inputs[21],j_inputs[22],j_inputs[23],j_inputs[24],j_inputs[25],j_inputs[26],j_inputs[27],j_inputs[28],j_inputs[29],j_inputs[30],j_inputs[31],j_inputs[32],j_inputs[33],j_inputs[34],j_inputs[35],j_inputs[36],j_inputs[37],j_inputs[38],j_inputs[39],j_inputs[40],j_inputs[41],j_inputs[42],j_inputs[43],j_inputs[44],j_inputs[45],j_inputs[46],j_inputs[47],j_inputs[48],j_inputs[49],j_inputs[50],j_inputs[51],j_inputs[52],j_inputs[53],j_inputs[54],j_inputs[55],j_inputs[56],j_inputs[57],j_inputs[58],j_inputs[59],j_inputs[60],j_inputs[61],j_inputs[62],j_inputs[63],j_inputs[64],j_inputs[65],j_inputs[66],j_inputs[67],j_inputs[68],j_inputs[69],j_inputs[70],j_inputs[71],j_inputs[72],j_inputs[73],j_inputs[74],j_inputs[75],j_inputs[76],j_inputs[77],j_inputs[78],j_inputs[79],j_inputs[80],j_inputs[81],j_inputs[82],j_inputs[83],j_inputs[84],j_inputs[85],j_inputs[86],j_inputs[87],j_inputs[88]];
assert(field_words([a_inputs[0],a_inputs[1],a_inputs[2],a_inputs[3],a_inputs[4],a_inputs[5],a_inputs[6],a_inputs[7]])==[900382361,2607841152,2956819233,4005858787,198086193,3094419975,4282784581,729704267]);
assert(field_words([a_inputs[8],a_inputs[9],a_inputs[10],a_inputs[11],a_inputs[12],a_inputs[13],a_inputs[14],a_inputs[15]])==scope);
assert(field_words([a_inputs[16],a_inputs[17],a_inputs[18],a_inputs[19],a_inputs[20],a_inputs[21],a_inputs[22],a_inputs[23]])==policy);
assert(epoch<=30744573456182585);assert(epoch<field_u64(a_inputs[80]));let sol_at=field_u64(j_inputs[97]);let sol_from=field_u64(j_inputs[98]);let sol_until=field_u64(j_inputs[99]);assert(epoch>=sol_from);assert(epoch<sol_until);assert(sol_at<(epoch+1)*600);
assert(btc_vk==approved_vk::BTC_LOCAL_VK);bb_proof_verification::verify_honk_proof(btc_vk,btc_proof,btc_inputs,approved_vk::BTC_LOCAL_HASH);
assert(field_words([btc_inputs[0],btc_inputs[1],btc_inputs[2],btc_inputs[3],btc_inputs[4],btc_inputs[5],btc_inputs[6],btc_inputs[7]])==[4214331083,1468730364,2541060267,3988759344,416195804,4092738002,1195476119,2617566558]);
assert([btc_inputs[8],btc_inputs[9],btc_inputs[10],btc_inputs[11],btc_inputs[12],btc_inputs[13],btc_inputs[14],btc_inputs[15]]==[a_inputs[8],a_inputs[9],a_inputs[10],a_inputs[11],a_inputs[12],a_inputs[13],a_inputs[14],a_inputs[15]]);
assert([btc_inputs[16],btc_inputs[17],btc_inputs[18],btc_inputs[19],btc_inputs[20],btc_inputs[21],btc_inputs[22],btc_inputs[23]]==[a_inputs[16],a_inputs[17],a_inputs[18],a_inputs[19],a_inputs[20],a_inputs[21],a_inputs[22],a_inputs[23]]);
assert([btc_inputs[24],btc_inputs[25],btc_inputs[26],btc_inputs[27],btc_inputs[28],btc_inputs[29],btc_inputs[30],btc_inputs[31]]==[a_inputs[48],a_inputs[49],a_inputs[50],a_inputs[51],a_inputs[52],a_inputs[53],a_inputs[54],a_inputs[55]]);
let btc_at=field_u64(btc_inputs[40]);let btc_from=field_u64(btc_inputs[41]);let btc_until=field_u64(btc_inputs[42]);assert(epoch>=btc_from);assert(epoch<btc_until);assert(btc_at<(epoch+1)*600);
assert(btc_at>=sol_at);assert(field_words([a_inputs[24],a_inputs[25],a_inputs[26],a_inputs[27],a_inputs[28],a_inputs[29],a_inputs[30],a_inputs[31]])==root);
assert(field_words([a_inputs[32],a_inputs[33],a_inputs[34],a_inputs[35],a_inputs[36],a_inputs[37],a_inputs[38],a_inputs[39]])==spent);
assert(field_words([j_inputs[89],j_inputs[90],j_inputs[91],j_inputs[92],j_inputs[93],j_inputs[94],j_inputs[95],j_inputs[96]])==effect_sol);
assert(field_words([btc_inputs[32],btc_inputs[33],btc_inputs[34],btc_inputs[35],btc_inputs[36],btc_inputs[37],btc_inputs[38],btc_inputs[39]])==effect_btc);
assert(field_words([a_inputs[56],a_inputs[57],a_inputs[58],a_inputs[59],a_inputs[60],a_inputs[61],a_inputs[62],a_inputs[63]])==output_sol);
assert(field_words([a_inputs[64],a_inputs[65],a_inputs[66],a_inputs[67],a_inputs[68],a_inputs[69],a_inputs[70],a_inputs[71]])==output_btc);

}
