/** Regression of the authenticated Sup8 token shape observed in cloud.
 * Original receiver readiness is an explicit HOST stop: no RPC, vault birth,
 * financial permission or broker restoration is performed by this test. */
import test from 'node:test';
import assert from 'node:assert/strict';
const tokens=new WeakMap(),runtime=Object.freeze({}),target=Object.freeze({});
const system=Object.freeze({receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4',...Object.fromEntries(['pool','state','native','scope','domain','assetIdentity','registryCommitment'].map(k=>[k,k]))});
const input={origin:'https://lianum.example',devicePublicKey:'04'+'1'.repeat(128),journal:{path:'/tmp/lianum-host-schema-only/journal.vault',password:'HOST schema credential '.repeat(3)}};
let receiverChecks=0;
const stopped=Error('HOST_ORIGINAL_RECEIVER_READINESS_REACHED');
test('Source7 accepts retained empty broker metadata and still rejects foreign fields and malformed broker rows',async t=>{
 t.mock.module(new URL('../../src/operations/recovery/sepolia-defi-retention-v8.mjs',import.meta.url).href,{exports:{async consumeOriginalSepoliaDefiComponentV8(r,u,token,kind,protocol){assert.strictEqual(r,runtime);assert.strictEqual(u,target);assert.equal(kind,'mixedAuthority');assert.equal(protocol,null);const row=tokens.get(token);assert.ok(row&&!row.used,'HOST_ORIGINAL_RETENTION_TOKEN');row.used=true;return structuredClone(row.data);}}});
 const {buildPagedSepoliaSourceJournalDataV4}=await import('../../src/operations/local/funded-graph-paged-source-journal-data-v4.mjs');
 const producer=buildPagedSepoliaSourceJournalDataV4(Object.freeze({assertOriginalSystem(r,s){assert.strictEqual(r,runtime);assert.strictEqual(s,system);},readOriginalSystem(){assert.fail('HOST_STOP_BEFORE_VAULT_BIRTH');},async assertOriginalReceiverReady(){receiverChecks++;throw stopped;}}));
 const data={profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_AUTHORITY_RETENTION_V8',authority:{descriptor:{...system,origin:input.origin,devicePublicKey:input.devicePublicKey}},journalPath:input.journal.path};
 function token(extra){const token=Object.freeze(Object.create(null));tokens.set(token,{data:{...data,...extra},used:false});return token;}
 for(const extra of [{},{expiredWithdrawalsV10:[]}])await assert.rejects(producer.reopenDefiMixed(runtime,system,input,token(extra),target),error=>error===stopped);
 assert.equal(receiverChecks,2,'both old and current retained schemas reach the unchanged Original readiness guard');
 await assert.rejects(producer.reopenDefiMixed(runtime,system,input,token({expiredWithdrawalsV10:[],foreign:true}),target),/PAGED_DEPLOY_FIELDS/);
 for(const rows of [null,{},[{}],Array(513).fill({})])await assert.rejects(producer.reopenDefiMixed(runtime,system,input,token({expiredWithdrawalsV10:rows}),target));
 assert.equal(receiverChecks,2,'bad metadata fails before readiness or a journal birth');
 await assert.rejects(producer.reopenDefiMixed(runtime,system,input,{},target),/HOST_ORIGINAL_RETENTION_TOKEN/);
});
