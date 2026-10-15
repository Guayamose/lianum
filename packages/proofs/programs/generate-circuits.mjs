// Generate only fixed framing/padding around official Noir black boxes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { frame, SCOPE, TAGS, wordsBE } from './encoding.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
function circuit(name, source) {
  const dir = root + 'circuits/' + name;
  mkdirSync(dir + '/src', { recursive: true });
  writeFileSync(dir + '/Nargo.toml', `[package]\nname = "${name}"\ntype = "bin"\nauthors = ["PC15 local capability gate"]\n\n[dependencies]\n`);
  writeFileSync(dir + '/src/main.nr', source);
}
function framed(name, tag, fields) {
  const raw = frame(tag, fields.map(([, length]) => Buffer.alloc(length)));
  let out = `    let mut ${name}: [u8; ${raw.length}] = [${[...raw].join(', ')}];\n`;
  let offset = 2 + Buffer.byteLength(tag);
  for (const [field, length] of fields) { offset += 4; out += `    for i in 0..${length} { ${name}[${offset} + i] = ${field}[i]; }\n`; offset += length; }
  return { source: out, length: raw.length, padded: Math.ceil((raw.length + 9) / 64) * 64 };
}
const graph = framed('graph_frame', TAGS.graph, [['graph', 32], ['salt', 32]]);
const owner = framed('key_frame', TAGS.key, [['public_key_x', 32], ['public_key_y', 32]]);
const auth = framed('auth_frame', TAGS.authorization, [['scope_bytes', 32], ['version', 4], ['graph_digest', 32], ['economic_policy', 32]]);
const helpers = `// FIPS 180-4 padding, initial state and byte conversion only. Every round
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
`;
circuit('authorization', `// UNFUNDED CAPABILITY ONLY. Public signer commitment is not funded-note ownership.
// All witness bytes, keys, signatures and lengths are constrained. No host validity flag.
${helpers}
fn main(
    scope: pub [u32; 8], owner_commitment: pub [u32; 8], graph_commitment: pub [u32; 8],
    graph: [u8; 32], salt: [u8; 32], economic_policy: [u8; 32],
    public_key_x: [u8; 32], public_key_y: [u8; 32], signature: [u8; 64],
) {
    assert(scope == [${wordsBE(SCOPE).join(', ')}]);
    let scope_bytes: [u8; 32] = [${[...SCOPE].join(', ')}];
    let version: [u8; 4] = [0, 0, 0, 1];
${graph.source}    let graph_digest = sha256::<${graph.length}, ${graph.padded}>(graph_frame);
    assert(bytes_to_words(graph_digest) == graph_commitment);
${owner.source}    assert(bytes_to_words(sha256::<${owner.length}, ${owner.padded}>(key_frame)) == owner_commitment);
${auth.source}    let message_hash = sha256::<${auth.length}, ${auth.padded}>(auth_frame);
    assert(std::ecdsa_secp256k1::verify_signature(public_key_x, public_key_y, signature, message_hash));
}
`);
circuit('official_vector', `// Only reproduces the official pinned signature vector/negative solver behavior.
fn main(public_key_x: [u8; 32], public_key_y: [u8; 32], signature: [u8; 64], message_hash: [u8; 32], expected: pub bool) {
    assert(std::ecdsa_secp256k1::verify_signature(public_key_x, public_key_y, signature, message_hash) == expected);
}
`);
circuit('wrong_key', `// Deliberately different relation with the same public-input count, for wrong-VK rejection.
fn main(scope: pub [u32; 8], owner_commitment: pub [u32; 8], graph_commitment: pub [u32; 8]) {
    assert(scope[0] == owner_commitment[0] + graph_commitment[0]);
}
`);
console.log(JSON.stringify({ generated: ['authorization', 'official_vector', 'wrong_key'], frameLengths: { graph: graph.length, key: owner.length, authorization: auth.length } }));
