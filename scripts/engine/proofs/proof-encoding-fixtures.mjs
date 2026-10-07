import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// PC4 section 3 framing only. This is not a complete graph/circuit ABI.
export function enc(tag, fields) {
  if (typeof tag !== 'string' || !/^[\x00-\x7f]*$/.test(tag) || tag.length > 65535)
    throw new Error('ASCII tag must fit u16');
  if (!Array.isArray(fields)) throw new Error('Ordered byte fields required');
  const t = Buffer.from(tag, 'ascii');
  const prefix = Buffer.alloc(2); prefix.writeUInt16BE(t.length);
  const chunks = [prefix, t];
  for (const f of fields) {
    if (!(f instanceof Uint8Array) || f.byteLength > 0xffffffff)
      throw new Error('Each field must be bytes with u32 length');
    const length = Buffer.alloc(4); length.writeUInt32BE(f.byteLength);
    chunks.push(length, Buffer.from(f));
  }
  return Buffer.concat(chunks);
}

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
function u64(value) {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX)
    throw new Error('Unsigned 64-bit bigint required');
  return value;
}
export function u64be(value) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(u64(value)); return b;
}
function mul128(a, b) {
  const result = a * b;
  if (result > U128_MAX) throw new Error('Intermediate overflow');
  return result;
}
export function economics({ B, FS, FB, pS, qS, pB, qB, S }) {
  [B, FS, FB, pS, qS, pB, qB, S].forEach(u64);
  if (qS === 0n || pB === 0n) throw new Error('Zero denominator');
  const x = mul128(S, pS);
  const cost = u64(x / qS + (x % qS === 0n ? 0n : 1n));
  if (FS + FB + cost > B) throw new Error('Negative residual');
  const K = u64(mul128(B - FS - FB - cost, qB) / pB);
  const PS = u64(cost + FS), PB = u64(B - PS);
  return { S, cost, K, PS, PB };
}

export function fixtures() {
  const frames = [
    { name: 'empty', tag: '', fieldsHex: [] },
    { name: 'binary-and-empty', tag: 't', fieldsHex: ['0102', ''] },
    { name: 'non-text-bytes', tag: 'PC4/fixture/1', fieldsHex: ['00ff80', '0000000000000001'] },
  ].map(f => {
    const bytes = enc(f.tag, f.fieldsHex.map(x => Buffer.from(x, 'hex')));
    return { ...f, encodedHex: bytes.toString('hex'), sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const terms = { B: 1000000n, FS: 10000n, FB: 15000n, pS: 1n, qS: 10n, pB: 4n, qB: 1n };
  const branches = [3000000n, 3500000n].map((S, branch) => {
    const result = economics({ ...terms, S });
    return { branch, ...result, u64be: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, u64be(v).toString('hex')])) };
  });
  return {
    classification: 'ENCODING_AND_INTEGER_FIXTURES_ONLY_NOT_CIRCUIT_OR_PROOF',
    proofCount: 0,
    framing: 'u16be ASCII tag length; tag; ordered u32be byte lengths and byte fields',
    exclusions: ['No graph/note/receipt schema or public-input ABI', 'No VRF/signature/ciphertext/proof verification', 'Synthetic terms, no market/capital evidence'],
    frames, terms, branches,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = fixtures();
  output.sourceSHA256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
  writeFileSync('evidence/m6-proof-encoding-fixtures.json', JSON.stringify(output, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n');
  console.log('3 framing vectors; 2 synthetic outcomes; real proofs: 0');
}
