/** Public release integrity checks only. No compiler, backend, node or prover. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';
import { assertDevelopmentEvmBuildBytes } from '../../../../src/operations/deployments/system/development-evm-build.mjs';
const bytes=readFileSync(join(ROOT,'wallet-platform/modules/fixtures/development-evm-build-v1.json'));
test('reviewed deterministic manifest retains twelve genuine role/key/ABI/source bindings',()=>{
  const value=assertDevelopmentEvmBuildBytes(bytes);
  assert.equal(value.contracts.length,12);
  assert.equal(value.historicalReportsRecreated,false);
  for(const row of value.contracts) {
    assert.match(row.sourceSHA256,/^[a-f0-9]{64}$/);
    assert.match(row.compiledSHA256,/^[a-f0-9]{64}$/);
    if(row.lineage.sourceVersion) {
      assert.match(row.lineage.abiSHA256,/^[a-f0-9]{64}$/);
      assert.match(row.lineage.bytecodeSHA256,/^[a-f0-9]{64}$/);
      assert.match(row.lineage.keySHA256,/^[a-f0-9]{64}$/);
      assert.equal(row.lineage.programSHA256,undefined);
    }
  }
});
test('caller-modified ledger, key, Solidity, width, role set or acceptance claim cannot replace the reviewed release',()=>{
  for(const change of [v=>v.ledgerSHA256='0'.repeat(64),v=>v.contracts[0].lineage.keySHA256='0'.repeat(64),
    v=>v.contracts[0].sourceSHA256='0'.repeat(64),v=>v.contracts[0].publicWords++,
    v=>v.contracts.pop(),v=>v.historicalReportsRecreated=true,v=>v.proofGenerated=true]) {
    const changed=JSON.parse(bytes);change(changed);
    assert.throws(()=>assertDevelopmentEvmBuildBytes(Buffer.from(JSON.stringify(changed,null,2)+'\n')),/DEVELOPMENT_EVM_MANIFEST_PIN/);
  }
});
