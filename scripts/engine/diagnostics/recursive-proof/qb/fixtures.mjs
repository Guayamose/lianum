import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { schemas, encode, decode, version, H, u64, amounts } from './wire.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
// Reproducible PUBLIC SYNTHETIC values. No user keys, real addresses or funds.
const id = label => H(Buffer.from('PC5-QB-1/public-synthetic-fixture/' + label));
export function fixtures() {
  const resultSalt = id('result-salt');
  const fields = {
    version, scope: id('scope'), session: id('session'), menuSalt: id('menu-salt'),
    quote: Buffer.concat([1000000n, 10000n, 15000n, 1n, 10n, 4n, 1n].map(u64)),
    outcomes: Buffer.concat([3000000n, 3500000n].map(u64)),
    sDescriptor: Buffer.concat([id('S-chain-domain'), id('S-recipient'), id('S-attempt'), id('S-policy'), u64(5000n)]),
    bDescriptor: Buffer.concat([id('B-chain-domain'), id('B-recipient-program').subarray(0, 20), id('B-attempt'), id('B-policy'), u64(300n)]),
    timing: Buffer.concat([1900000100n, 1900000900n].map(u64)),
    resultSaltCommitment: H(encode('resultSalt', { resultSalt })), topology: Buffer.from([1]),
  };
  const menu = encode('menu', fields), menuBinding = H(menu), branches = [];
  for (const branch of [0, 1]) {
    const a = amounts(fields, branch), s = fields.sDescriptor, b = fields.bDescriptor;
    const common = { version, scope: fields.scope, branch: Buffer.from([branch]), executeBy: fields.timing.subarray(0, 8), claimBy: fields.timing.subarray(8) };
    const legS = encode('legS', { ...common, salt: id(`S-salt-${branch}`), role: Buffer.from([1]), chainDomain: s.subarray(0, 32), recipient: s.subarray(32, 64), amount: u64(a.S), nativeFeeCap: s.subarray(128, 136), payoutValue: u64(a.PS), attempt: s.subarray(64, 96), policy: s.subarray(96, 128), resultSaltCommitment: fields.resultSaltCommitment });
    const cS = H(legS);
    const legB = encode('legB', { ...common, salt: id(`B-salt-${branch}`), role: Buffer.from([2]), chainDomain: b.subarray(0, 32), recipientProgram: b.subarray(32, 52), amount: u64(a.K), nativeFeeCap: b.subarray(116, 124), payoutValue: u64(a.PB), attempt: b.subarray(52, 84), policy: b.subarray(84, 116), parentRule: Buffer.from([1]), parentConstraint: cS });
    const statement = encode('statement', { version, scope: fields.scope, session: fields.session, branch: Buffer.from([branch]), menuBinding, C_S: cS, C_B: H(legB) });
    branches.push({ branch, amounts: a, legS, legB, statement });
  }
  return { menu, resultSalt, branches };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const f = fixtures(), out = resolve(root, '../.local/qb/owner'); mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'menu.bin'), f.menu); writeFileSync(resolve(out, 'result-salt.bin'), f.resultSalt);
  const records = [];
  for (const b of f.branches) {
    for (const key of ['legS', 'legB', 'statement']) writeFileSync(resolve(out, `${key}-${b.branch}.bin`), b[key]);
    records.push({ branch: b.branch, amounts: b.amounts, legSHex: b.legS.toString('hex'), legBHex: b.legB.toString('hex'), statementHex: b.statement.toString('hex'), commitments: { C_S: H(b.legS).toString('hex'), C_B: H(b.legB).toString('hex') } });
  }
  const record = { classification: 'PUBLIC_SYNTHETIC_CANONICAL_WIRE_FIXTURES_NOT_AUTHORIZATION', menuHex: f.menu.toString('hex'), resultSaltHex: f.resultSalt.toString('hex'), menuBinding: H(f.menu).toString('hex'), schemas: Object.fromEntries(Object.entries(schemas).map(([name, s]) => [name, { tag: s.tag, fields: s.fields, offsets: s.offsets, bytes: s.length }])), branches: records };
  writeFileSync(resolve(root, '../../../evidence/m8-qb-wire-fixtures.json'), JSON.stringify(record, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
  console.log(JSON.stringify({ schemas: Object.fromEntries(Object.entries(schemas).map(([name, s]) => [name, s.length])), menuBinding: record.menuBinding, branches: records.map(b => b.branch) }));
}
