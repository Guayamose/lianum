/** Coexistence only inside the already-owned original wallet supervisor. This
 * reads its lock, ancestry and source capsule; it creates no new registry or
 * permission token and accepts no caller-selected profile or process IDs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, readFileSync, realpathSync, readdirSync, readlinkSync, lstatSync, existsSync } from 'node:fs';
import { join, resolve, relative, basename } from 'node:path';
import { ROOT, FLAT, GOLDEN } from '../../../../../../proofs/src/catalog.mjs';
import { PRIVATE_RESOURCE_POLICY } from '../../../../../../engine/src/crypto/private-resource-policy.mjs';
import { readOriginalTronProductChildBirthV1 } from './tron-aligned-child-opener-v1.mjs';
const BUDGET = 90 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROFILES = Object.freeze(['acceptance', 'preflight'].map(kind => Object.freeze({
 entry: join(ROOT, `integration/run-native-wallet-real-${kind}-v1.mjs`),
 worker: join(ROOT, `integration/native-wallet-real-${kind}-v1.mjs`),
 local: join(ROOT, `.local/native-wallet-real-${kind}-v1`),
 resources: `NATIVE_WALLET_REAL_${kind.toUpperCase()}_RESOURCES_V1`,
 lock: `NATIVE_WALLET_REAL_${kind.toUpperCase()}_LOCK_V1`,
})));
const PROOF_SCRIPTS = new Set(['worker.mjs','native-value-live-v2-worker.mjs','native-ingress-v3-worker.mjs',
 'native-claims-build-worker.mjs'].map(name => join(ROOT, 'proof-workers', name)));
PROOF_SCRIPTS.add(join(GOLDEN, 'src/paeg/proof-worker.mjs'));
const LOCKS = Object.freeze([[join(ROOT,'.local/proof-workers/active.lock'),'pid'],
 [join(ROOT,'.local/proof-workers-native-ingress-v3/active.lock'),'pid'],['/tmp/lianum-paeg-proof-host.lock','parentPID']]);
const MOBILE_PROTOCOL=resolve(FLAT,'../mobile-protocol');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const absent = error => ['ENOENT','ESRCH'].includes(error.code);
const same = (a,b) => a && b && a.pid === b.pid && a.start === b.start;
function regular(path, limit = 8 * 1024 * 1024) {
 assert.equal(realpathSync(path), resolve(path), 'TRON_PRODUCT_SCOPE_FILE_SYMLINK');
 const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
 try { const before = fstatSync(fd, {bigint:true});
  assert.ok(before.isFile() && before.uid === BigInt(process.getuid()) && before.size <= BigInt(limit), 'TRON_PRODUCT_SCOPE_FILE');
  const bytes = readFileSync(fd), after = fstatSync(fd, {bigint:true});
  assert.ok(bytes.length <= limit && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ino === after.ino,
   'TRON_PRODUCT_SCOPE_FILE_CHANGED'); return bytes;
 } finally { closeSync(fd); }
}
function proc(pid) {
 try {
  const base = `/proc/${pid}`, text = readFileSync(base+'/stat','utf8'), end = text.lastIndexOf(') '), fields = text.slice(end+2).split(/\s+/);
  assert.ok(Number.isSafeInteger(pid) && pid > 1 && text.startsWith(pid+' (') && end > 0 && /^[0-9]+$/.test(fields[19]), 'TRON_PRODUCT_SCOPE_PROC');
  const uid = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(readFileSync(base+'/status','utf8'));
  assert.ok(uid, 'TRON_PRODUCT_SCOPE_UID4');
  const row = {pid,parent:Number(fields[1]),group:Number(fields[2]),session:Number(fields[3]),start:fields[19],state:fields[0],
   uid:lstatSync(base).uid,uids:uid.slice(1).map(Number),executable:readlinkSync(base+'/exe'),
   argv:readFileSync(base+'/cmdline','utf8').split('\0').filter(Boolean),cwd:readlinkSync(base+'/cwd')};
  const after = readFileSync(base+'/stat','utf8'), again = after.slice(after.lastIndexOf(') ')+2).split(/\s+/);
  assert.equal(again[19],row.start,'TRON_PRODUCT_SCOPE_BIRTH_CHANGED'); assert.equal(Number(again[1]),row.parent);
  return row;
 } catch(error) { if(absent(error))return null; throw error; }
}
// Discovery matches the original candidate's comm/cmdline policy. It does
// not acquire an identity or authorize a child. Full /proc checks remain
// mandatory for every heavy process, proof-lock owner and admitted child.
function discover(pid) {
 try {
  const base=`/proc/${pid}`,text=readFileSync(base+'/stat','utf8'),end=text.lastIndexOf(') '),fields=text.slice(end+2).split(/\s+/);
  assert.ok(Number.isSafeInteger(pid)&&pid>0&&text.startsWith(pid+' (')&&end>0&&/^[0-9]+$/.test(fields[19]),'TRON_PRODUCT_SCOPE_PROC');
  if(['Z','X'].includes(fields[0]))return null;
  const comm=text.slice(text.indexOf('(')+1,end),status=readFileSync(base+'/status','utf8');
  const uid=/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);assert.ok(uid,'TRON_PRODUCT_SCOPE_UID4');
  const argv=readFileSync(base+'/cmdline','utf8').split('\0').filter(Boolean),name=basename(argv[0]??'');
  let heavy=/^(?:anvil|bitcoind|bitcoin-cli|solana-test-val|solana-validato|solana-test-validator|agave-validator|solana-keygen|bb|nargo|cargo|rustc|rust-lld|ld\.lld|cc1|cc1plus|javac|java)$/.test(comm)
   ||/^(?:anvil|bitcoind|bitcoin-cli|solana-test-validator|agave-validator|solana-keygen|bb|nargo|cargo|rustc|rust-lld|ld\.lld|cc1|cc1plus|javac|java)$/.test(name);
  if(comm==='node'||name==='node'){
   assert.ok(argv.length>0,'TRON_PRODUCT_NODE_DISCOVERY_UNKNOWN');const cwd=readlinkSync(base+'/cwd');
   heavy ||= argv.slice(1).some(value=>!value.startsWith('-')&&PROOF_SCRIPTS.has(resolve(cwd,value)));
  }
  const after=readFileSync(base+'/stat','utf8'),again=after.slice(after.lastIndexOf(') ')+2).split(/\s+/);
  assert.equal(again[19],fields[19],'TRON_PRODUCT_SCOPE_BIRTH_CHANGED');assert.equal(again[1],fields[1],'TRON_PRODUCT_SCOPE_BIRTH_CHANGED');
  return {pid,start:fields[19],uids:uid.slice(1).map(Number),heavy};
 }catch(error){if(absent(error))return null;throw error;}
}
function own(row) { assert.ok(row && !['Z','X'].includes(row.state),'TRON_PRODUCT_SCOPE_LIVE_IDENTITY');
 assert.ok(Number.isSafeInteger(row.pid)&&row.pid>1);assert.match(row.start,/^[0-9]+$/);
 assert.equal(row.uid,process.getuid()); assert.deepEqual(row.uids,Array(4).fill(process.getuid())); }
function script(row) { const value=row?.argv.slice(1).find(v=>!v.startsWith('-')&&v.endsWith('.mjs')); return value ? resolve(row.cwd,value) : null; }
/** Data-only joins for regression. Actual identities/files are always read by
 * the zero-option guard below; passing metadata never permits a process. */
export function assertTronProductSupervisorEvidenceV1(value) {
 assert.equal(arguments.length,1); const {main,supervisor,lock,resources,profileIndex} = value;
 assert.ok(Number.isInteger(profileIndex) && profileIndex >= 0 && profileIndex < PROFILES.length);
 const profile = PROFILES[profileIndex]; own(main); own(supervisor);
 assert.equal(main.pid,process.pid); assert.equal(main.parent,supervisor.pid); assert.equal(main.group,main.pid); assert.equal(main.session,main.pid);
 assert.equal(main.argv.length,2); assert.equal(supervisor.argv.length,2);
 assert.equal(script(main),profile.worker); assert.equal(script(supervisor),profile.entry);
 const node = realpathSync(process.execPath); assert.equal(main.executable,node); assert.equal(supervisor.executable,node);
 assert.equal(lock.format,profile.lock); assert.equal(lock.pid,supervisor.pid); assert.equal(lock.supervisorStartTimeTicks,supervisor.start);
 assert.match(lock.runId,UUID); assert.equal(lock.attempt,`.local/native-wallet-real-${profileIndex===0?'acceptance':'preflight'}-v1/attempt-${lock.runId}`);
 assert.equal(resources.format,profile.resources); assert.equal(resources.runId,lock.runId); assert.equal(resources.phase,'running');
 assert.equal(resources.failure,null); assert.equal(resources.supervisorPID,supervisor.pid); assert.equal(resources.workerPID,main.pid);
 for(const [row,identity] of [[main,resources.workerIdentity],[supervisor,resources.supervisorIdentity]]) {
  assert.equal(identity?.pid,row.pid);assert.equal(identity?.startTimeTicks,row.start);assert.equal(identity?.ppid,row.parent);
  assert.equal(identity?.pgrp,row.group);assert.equal(identity?.session,row.session);
 }
 assert.equal(resources.ownedProcessGroup,main.pid); assert.equal(resources.detachedWorker,true);
 assert.equal(resources.limits?.totalMilliseconds,BUDGET); assert.equal(resources.publicNetwork,false); assert.equal(resources.hostLimitsChanged,false);
 assert.deepEqual(resources.resourcePolicy,PRIVATE_RESOURCE_POLICY);assert.equal(resources.proofPhaseTimeoutMilliseconds,600000);
 assert.equal(resources.resultAccepted,false);
 const started = Date.parse(resources.startedAt); assert.ok(Number.isFinite(started) && Date.now() >= started && Date.now()-started < BUDGET,
  'TRON_PRODUCT_SCOPE_ORIGINAL_DEADLINE');
 return true; // Metadata only, not a runtime/permission token.
}
function captureScope() {
 const main = proc(process.pid), supervisor = proc(process.ppid); own(main); own(supervisor);
 const index = PROFILES.findIndex(profile => script(main)===profile.worker);
 if(index < 0) { assert.equal(PROFILES.some(profile=>script(supervisor)===profile.entry),false,'TRON_PRODUCT_SCOPE_WORKER_REBOUND');
  for(const profile of PROFILES)assert.equal(existsSync(join(profile.local,'active.lock')),false,'TRON_PRODUCT_FOREIGN_WALLET_LIFETIME');
  return null;
 }
 const profile = PROFILES[index], lock = JSON.parse(regular(join(profile.local,'active.lock'),4096));
 const attempt = join(profile.local,'attempt-'+lock.runId), resources = JSON.parse(regular(join(attempt,'resources.json')));
 assertTronProductSupervisorEvidenceV1({main,supervisor,lock,resources,profileIndex:index});
 const pinsBytes = regular(join(attempt,'source-pins.json')), pins = JSON.parse(pinsBytes);
 assert.equal(sha(pinsBytes),resources.sourcePinsSHA256,'TRON_PRODUCT_SCOPE_SOURCE_RECEIPT');
 assert.ok(Array.isArray(pins.local),'TRON_PRODUCT_SCOPE_SOURCE_ROWS');
 const files = new Map();
 for(const row of pins.local) {
  assert.ok(row && typeof row.path==='string' && !row.path.includes('\0') && !row.path.startsWith('/'));
  const path=resolve(FLAT,row.path); assert.ok([ROOT,FLAT,GOLDEN,MOBILE_PROTOCOL].some(root=>path.startsWith(root+'/')));
  assert.equal(relative(FLAT,path),row.path); assert.ok(!files.has(path));
  assert.match(row.sha256,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>=0); files.set(path,row);
 }
 return {main,supervisor,lock,profile,attempt,files};
}
function assertCapturedScript(scope,path) {
 const row = scope.files.get(path); assert.ok(row,'TRON_PRODUCT_SCOPE_UNCAPTURED_EXECUTION_SOURCE');
 const bytes = regular(path); assert.equal(bytes.length,row.bytes); assert.equal(sha(bytes),row.sha256,'TRON_PRODUCT_SCOPE_SOURCE_CHANGED');
}
export function createTronProductHostGuardV1() {
 assert.equal(arguments.length,0,'TRON_PRODUCT_HOST_GUARD_NO_OPTIONS'); const original = captureScope(); let ownedTron;
 function check() {
  const scope = captureScope();
  if(original) {
   assert.ok(scope && same(scope.main,original.main) && same(scope.supervisor,original.supervisor) && scope.lock.runId===original.lock.runId,
    'TRON_PRODUCT_SCOPE_LIFETIME_CHANGED');
   assertCapturedScript(scope,scope.profile.entry); assertCapturedScript(scope,scope.profile.worker);
  } else assert.equal(scope,null,'TRON_PRODUCT_SCOPE_LIFETIME_CHANGED');
  for(const [path,field] of LOCKS) {
   if(!existsSync(path))continue;
   let lock; try { lock=JSON.parse(regular(path,4096)); }catch(error){if(absent(error))continue;throw error;}
   assert.ok(scope,'TRON_PRODUCT_FOREIGN_OR_STALE_PROOF_LOCK'); const owner=proc(lock[field]); own(owner);
   assert.ok(owner.group===scope.main.pid && owner.session===scope.main.pid,'TRON_PRODUCT_FOREIGN_OR_STALE_PROOF_LOCK');
   const after=proc(owner.pid); assert.ok(same(owner,after) && after.group===owner.group && after.session===owner.session,
    'TRON_PRODUCT_PROOF_LOCK_OWNER_CHANGED');
  }
  for(const name of readdirSync('/proc')) {
   if(!/^[1-9]\d*$/.test(name))continue;
   let row; try {const visible=discover(Number(name));if(!visible?.heavy)continue;row=proc(Number(name));
    if(row){assert.equal(row.start,visible.start,'TRON_PRODUCT_SCOPE_BIRTH_CHANGED');assert.deepEqual(row.uids,visible.uids,'TRON_PRODUCT_SCOPE_UID4_CHANGED');}}
   catch(error){if(absent(error))continue;throw error;}
   if(!row || ['Z','X'].includes(row.state))continue;
   const executable=basename(row.executable), path=script(row), proof=PROOF_SCRIPTS.has(path);
   const heavy=/^(?:anvil|bitcoind|bitcoin-cli|solana-test-validator|agave-validator|solana-keygen|bb|nargo|cargo|rustc|rust-lld|ld\.lld|cc1|cc1plus|javac|java)$/.test(executable)||proof;
   if(!heavy)continue;
   if(ownedTron && row.pid===ownedTron.pid) {
    own(row); assert.ok(same(row,ownedTron) && row.parent===process.pid && row.group===ownedTron.group && row.session===ownedTron.session, 'TRON_PRODUCT_CHILD_BIRTH_CHANGED');
    assert.equal(row.executable,join(GOLDEN,'.local/owned-tron-native-value-v1/jdk8/bin/java')); continue;
   }
   assert.ok(scope,'TRON_PRODUCT_PARALLEL_HEAVY_WORK'); own(row);
   assert.ok(row.group===scope.main.pid && row.session===scope.main.pid,'TRON_PRODUCT_FOREIGN_HEAVY_WORK');
   // Compiler/toolchain work is never part of this running wallet phase.
   assert.equal(/^(?:nargo|cargo|rustc|rust-lld|ld\.lld|cc1|cc1plus|javac)$/.test(executable),false,'TRON_PRODUCT_PARALLEL_COMPILATION');
   if(proof)assertCapturedScript(scope,path);
   assert.equal(executable==='java',false,'TRON_PRODUCT_FOREIGN_JAVA');
   const after=proc(row.pid); assert.ok(same(row,after) && after.group===row.group && after.session===row.session,'TRON_PRODUCT_HEAVY_IDENTITY_CHANGED');
  }
  // Other fixed application/compile locks are not waived by an owned PGID.
  const local=join(ROOT,'.local');
  for(const name of existsSync(local)?readdirSync(local):[]) {
   const path=join(local,name,'active.lock'); if(!existsSync(path))continue;
   if(scope && path===join(scope.profile.local,'active.lock'))continue;
   if(LOCKS.some(([allowed])=>allowed===path))continue;
   throw Error('TRON_PRODUCT_OTHER_APPLICATION_LOCK');
  }
  for(const name of ['envelope-constraints','native-constraints','completion-constraints','pinned-verification','verifier-compilation'])
   assert.equal(existsSync(join(ROOT,'.local/proof-workers',name+'.lock')),false,'TRON_PRODUCT_OTHER_COMPILATION_LOCK');
  return scope ? {scope:'ORIGINAL_NATIVE_WALLET_SUPERVISOR',runId:scope.lock.runId,supervisorPID:scope.supervisor.pid,
   supervisorStartTimeTicks:scope.supervisor.start,workerPID:scope.main.pid,workerStartTimeTicks:scope.main.start,
   startedAt:scope.lock.startedAt,originalTotalMilliseconds:BUDGET} : {scope:'EXCLUSIVE_LOCAL_DRIVER_NO_WALLET_AUTHORITY',originalTotalMilliseconds:BUDGET};
 }
 const evidence={...check(),originalFactoryIdentity:proc(process.pid)}; return Object.freeze({evidence:Object.freeze(evidence),assertActive:check,
  bindOriginalChild(handle) { assert.equal(arguments.length,1); assert.equal(ownedTron,undefined,'TRON_PRODUCT_ONE_ORIGINAL_CHILD');
   const birth=readOriginalTronProductChildBirthV1(handle), row=proc(birth.pid); own(row);
   assert.ok(same(row,birth) && row.parent===process.pid && row.group===birth.group && row.session===birth.session,'TRON_PRODUCT_CHILD_BIRTH_CHANGED');
   ownedTron=birth; check();
  },
 });
}
