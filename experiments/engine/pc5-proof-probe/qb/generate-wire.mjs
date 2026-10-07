import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemas } from './wire.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(root, 'circuits/quote_binding/src'); mkdirSync(out, { recursive: true });
let text = '// Generated canonical framing constants; compare independent Python vectors.\n';
for (const [name, schema] of Object.entries(schemas)) {
  if (name === 'statement') continue;
  const id = name.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
  text += `pub global ${id.toUpperCase()}_LEN: u32 = ${schema.length};\n`;
  for (const [field] of schema.fields) text += `pub global ${id.toUpperCase()}_${field.replace(/[A-Z]/g, c => '_' + c.toLowerCase()).toUpperCase()}: u32 = ${schema.offsets[field]};\n`;
  text += `pub fn check_${id}(bytes: [u8; ${schema.length}]) {\n    let prefix: [u8; ${schema.prefix.length}] = [${[...schema.prefix]}];\n    for i in 0..${schema.prefix.length} { assert(bytes[i] == prefix[i]); }\n`;
  for (const [field, length] of schema.fields) {
    const offset = schema.offsets[field] - 4, encoded = Buffer.alloc(4); encoded.writeUInt32BE(length);
    for (let i = 0; i < 4; i++) text += `    assert(bytes[${offset + i}] == ${encoded[i]});\n`;
  }
  text += '}\n';
}
const saltSchema = schemas.resultSalt, saltPrefix = Buffer.alloc(saltSchema.offsets.resultSalt);
saltSchema.prefix.copy(saltPrefix); saltPrefix.writeUInt32BE(32, saltPrefix.length - 4);
text += `pub fn salt_record(salt: [u8; 32]) -> [u8; ${saltSchema.length}] {\n    let mut out = [0; ${saltSchema.length}];\n    let prefix: [u8; ${saltPrefix.length}] = [${[...saltPrefix]}];\n    for i in 0..${saltPrefix.length} { out[i] = prefix[i]; }\n    for i in 0..32 { out[i + ${saltPrefix.length}] = salt[i]; }\n    out\n}\n`;
text += `pub fn read16<let N: u32>(bytes: [u8; N], offset: u32) -> u16 { (bytes[offset] as u16 << 8) | bytes[offset + 1] as u16 }\npub fn read64<let N: u32>(bytes: [u8; N], offset: u32) -> u64 {\n    let mut value: u64 = 0;\n    for i in 0..8 { value = (value << 8) | bytes[offset + i] as u64; }\n    value\n}\npub fn same32<let A: u32, let B: u32>(a: [u8; A], ai: u32, b: [u8; B], bi: u32) { for i in 0..32 { assert(a[ai + i] == b[bi + i]); } }\n`;
writeFileSync(resolve(out, 'wire.nr'), text); console.log('Generated framing constants for the four typed input records.');
