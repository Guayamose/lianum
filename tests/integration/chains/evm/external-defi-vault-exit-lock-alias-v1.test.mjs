/** Inert HOST lock discovery only: no claimed lock, worker or financial authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
const here=dirname(fileURLToPath(import.meta.url));
// These are the two fixed source layouts, never a caller-selected file.
const supervisor=here.endsWith('/tests/integration/chains/evm')?resolve(here,'../../native/native-flow-supervisor.mjs'):join(here,'native-flow-supervisor.mjs');
const source=readFileSync(supervisor,'utf8');
const begin=source.indexOf('  function assertOtherApplicationLocks() {');
const end=source.indexOf('\n  function resources()',begin);
assert.ok(begin>=0&&end>begin,'HOST_ORIGINAL_APPLICATION_LOCK_GUARD');
const guard=source.slice(begin,end).trim();
const beforeClaim=source.match(/^    assert.equal\(existsSync\(LOCK\), false, 'NATIVE_FLOW_LOCK_BUSY'\);$/m)?.[0];
assert.ok(beforeClaim&&source.indexOf(beforeClaim)<source.indexOf('lockIdentity = writeExclusive(LOCK'),'HOST_ORIGINAL_LOCK_ACQUISITION_BOUNDARY');
test('HOST original guard distinguishes its claimed shared path from every distinct busy lock',()=>{
 const root='/INERT_HOST_FIXED_ROOT',local=join(root,'.local/external-defi-owner-cycle-v1');
 const meta=Object.freeze({local}),aave=Object.freeze({local}),foreign=Object.freeze({local:join(root,'.local/foreign-fixed-profile')});
 const profiles=Object.freeze({meta,aave,foreign}),active=new Set(),LOCK=join(local,'active.lock');
 const port={assert,join,ROOT:root,FLOW_PROFILES:profiles,profile:meta,LOCK,existsSync:path=>active.has(path)};
 const check=runInNewContext('('+guard+')',port);
 runInNewContext(beforeClaim,port); // No original lock has been claimed yet.
 active.add(LOCK); // The original exclusive acquisition is modelled as a fixed inert boundary.
 assert.doesNotThrow(()=>check()); // Aave names exactly this already owned Meta lock.
 const old=guard.replace(" && join(other.local, 'active.lock') !== LOCK",'');
 assert.throws(()=>runInNewContext('('+old+')',port)(),/NATIVE_OTHER_APPLICATION_LOCK/); // Reproduce the original causal failure.
 active.add(join(foreign.local,'active.lock'));
 assert.throws(()=>check(),/NATIVE_OTHER_APPLICATION_LOCK/); // No distinct path can be skipped.
 active.delete(join(foreign.local,'active.lock'));
 assert.throws(()=>runInNewContext(beforeClaim,port),/NATIVE_FLOW_LOCK_BUSY/); // Same path is still rejected BEFORE acquisition.
 // This fixture does not grant EXCL, spawn, replay or lifecycle authority.
});
