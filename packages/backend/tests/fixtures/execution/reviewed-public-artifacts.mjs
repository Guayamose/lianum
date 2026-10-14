/** Read-only schema fixtures from the reviewed public development build.
 * No compiler, proof, witness, process, source adoption or release is created.
 * ABI/ACIR bytes stay bound to the existing fixed manifest; pointer UUIDs only
 * locate bytes and cannot choose a different accepted schema. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {ROOT,CANDIDATE} from '@lianum/proofs/catalog';
import {readDevelopmentEvmBuild,DEVELOPMENT_EVM_DIRECTORY,DEVELOPMENT_EVM_BUILD_PIN} from '../../../src/operations/deployments/system/development-evm-build.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const checkedHex=value=>{assert.match(value,/^[0-9a-f]{64}$/);return value;};
const checkedId=value=>{assert.match(value,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);return value;};
const read=path=>JSON.parse(readFileSync(path));
export function readReviewedRelationABI(role){
  assert.ok(['admission','settlement','node'].includes(role));
  const published=readDevelopmentEvmBuild(),row=published.contracts.find(value=>value.relation===role);
  assert.ok(row);let program;
  if(role==='node'){
    const directory=join(CANDIDATE,'.local/component'),pointer=read(join(directory,'compiled.json'));
    const artifact=join(directory,'compiled',checkedHex(pointer.manifestSHA256));
    const manifestBytes=readFileSync(join(artifact,'manifest.json'));assert.equal(hash(manifestBytes),pointer.manifestSHA256);
    const manifest=JSON.parse(manifestBytes),bytes=readFileSync(join(artifact,'program.json'));
    assert.equal(hash(bytes),checkedHex(pointer.programSHA256));assert.equal(manifest.programSHA256,pointer.programSHA256);
    assert.equal(manifest.publicWords,32);program=JSON.parse(bytes);
  }else{
    const directory=join(ROOT,'.local/proof-workers/relations',role,checkedHex(row.lineage.sourceVersion));
    const pointer=read(join(directory,'compiled.json')),artifact=join(directory,'compiled',checkedId(pointer.artifactId));
    const manifestBytes=readFileSync(join(artifact,'manifest.json'));assert.equal(hash(manifestBytes),checkedHex(pointer.manifestSHA256));
    const manifest=JSON.parse(manifestBytes),bytes=readFileSync(join(artifact,'program.json'));
    assert.equal(manifest.relation,role);assert.equal(manifest.sourceVersion,row.lineage.sourceVersion);
    assert.equal(hash(bytes),checkedHex(manifest.programSHA256));program=JSON.parse(bytes);
  }
  assert.equal(hash(JSON.stringify(program.abi)),checkedHex(row.lineage.abiSHA256));
  assert.equal(hash(Buffer.from(program.bytecode,'base64')),checkedHex(row.lineage.bytecodeSHA256));
  return program.abi;
}
export function readReviewedLedgerABI(){
  const published=readDevelopmentEvmBuild(),bytes=readFileSync(join(DEVELOPMENT_EVM_DIRECTORY,'ledger/compiled.json'));
  assert.equal(hash(bytes),DEVELOPMENT_EVM_BUILD_PIN.ledgerSHA256);assert.equal(published.ledgerSHA256,hash(bytes));
  return JSON.parse(bytes).contracts;
}
