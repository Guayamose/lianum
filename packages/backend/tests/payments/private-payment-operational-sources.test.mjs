/** Read and archive current physical modules; no native processes or provers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {snapshotPrivatePaymentOperationalSources,assertPrivatePaymentSourcesUnchanged} from '../../src/payments/private-payment-engine.mjs';

test('operational snapshot hashes actual worker code and refuses altered or omitted evidence',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'lianum-active-proof-sources-'));
  try {
    const pins=await snapshotPrivatePaymentOperationalSources(directory);
    const file='active-source/proofs/execution/assembly-workers.mjs';
    const actual=await readFile(new URL('../../../proofs/src/execution/assembly-workers.mjs',import.meta.url));
    assert.deepEqual(await readFile(join(directory,file)),actual);
    assert.deepEqual(pins[file],{bytes:actual.length,sha256:createHash('sha256').update(actual).digest('hex')});
    assert.ok(Object.hasOwn(pins,'active-source/components/resources/private-verifier-crs.mjs'));
    assert.ok(Object.hasOwn(pins,'active-source/proofs/toolchain/note-prover.mjs'));
    await assertPrivatePaymentSourcesUnchanged(pins);
    await assert.rejects(assertPrivatePaymentSourcesUnchanged({...pins,[file]:{...pins[file],sha256:'0'.repeat(64)}}),/PC18_SOURCE_CHANGED_DURING_RUN/);
    const missing={...pins};delete missing[file];
    await assert.rejects(assertPrivatePaymentSourcesUnchanged(missing),/PC18_OPERATIONAL_SOURCE_REQUIRED/);
    await assert.rejects(assertPrivatePaymentSourcesUnchanged({...pins,'active-source/arbitrary.mjs':pins[file]}),/PC18_OPERATIONAL_SOURCE_UNKNOWN/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
