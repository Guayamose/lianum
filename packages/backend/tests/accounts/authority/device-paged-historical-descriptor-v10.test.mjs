/** Actual Authority factories and their private account registry. Lower journal
 * handles are HOST fixtures; no proof, grant, RPC or financial effect is issued. */
import test from 'node:test';
import assert from 'node:assert/strict';

test('historical and terminal metadata use retained descriptors without reopening financial access',async t=>{
 const runtime=Object.freeze({}),system=Object.freeze({}),rows=new WeakMap(),historicalToken=Object.freeze({}),terminalToken=Object.freeze({});let expected;
 const remember=kind=>{const handle=Object.freeze({});rows.set(handle,{kind,descriptor:expected,closed:false});return handle;};
 const read=(handle,kind)=>{const row=rows.get(handle);assert.ok(row&&!row.closed&&row.kind===kind);return{authority:{descriptor:row.descriptor}};};
 const close=(handle,kind)=>{read(handle,kind);rows.get(handle).closed=true;};
 const kernelURL=new URL('../../../src/operations/local/funded-graph-paged-public-kernel-v4.mjs',import.meta.url),kernel=await import(kernelURL.href);
 t.mock.module(kernelURL.href,{exports:{...kernel,
  async reopenOriginalPagedSepoliaHistoricalSourceJournalV5(r,s,_input,token){assert.strictEqual(r,runtime);assert.strictEqual(s,system);assert.strictEqual(token,historicalToken);return remember('historical');},
  async readOriginalPagedSepoliaHistoricalSourceJournalV5(handle){return read(handle,'historical');},
  closeOriginalPagedSepoliaHistoricalSourceJournalV5(handle){close(handle,'historical');},
  async reopenOriginalPagedSepoliaTerminalWithdrawalJournalV5(r,s,_input,token,ancestor){assert.strictEqual(r,runtime);assert.strictEqual(s,system);assert.strictEqual(token,terminalToken);read(ancestor,'historical');return remember('terminal');},
  async readOriginalPagedSepoliaTerminalWithdrawalJournalV5(handle){return read(handle,'terminal');},
  closeOriginalPagedSepoliaTerminalWithdrawalJournalV5(handle){close(handle,'terminal');},
 }});
 const A=await import('../../../src/accounts/authority/device-paged-note-authority-v3.mjs');
 for(const deadlineMs of [Date.now()-1,Date.now()+60000]){
  expected=Object.freeze({pairingId:'HOST-retained-'+deadlineMs,deadlineMs,origin:'https://localhost:23456',devicePublicKey:'04'+'11'.repeat(64)});
  const input={journal:{path:'/HOST/historical/journal.vault',password:'HOST-not-a-real-key'}},historical=await A.reopenOriginalDevicePagedPublicHistoricalSourceV5(runtime,system,input,historicalToken,Object.freeze({}));let terminal;
  try{
   assert.throws(()=>historical.descriptor(),/HISTORICAL_READ_ONLY/);assert.strictEqual(A.readOriginalDevicePagedStorageDescriptorV8(historical),expected);assert.equal(A.isOriginalDevicePagedExpiredStorageV8(historical),true);
   assert.throws(()=>A.readOriginalDevicePagedStorageDescriptorV8({...historical}),/STORAGE_CLOSED/);
   assert.throws(()=>A.assertOriginalDevicePagedGraphNoteAuthorityV3(historical,runtime,system));
   terminal=await A.reopenOriginalDevicePagedTerminalWithdrawalAuthorityV5(historical,system,input,terminalToken);
   assert.throws(()=>terminal.descriptor(),/TERMINAL_READ_ONLY/);assert.strictEqual(A.readOriginalDevicePagedStorageDescriptorV8(terminal),expected);assert.equal(A.isOriginalDevicePagedExpiredStorageV8(terminal),true);
   assert.throws(()=>A.readOriginalDevicePagedStorageDescriptorV8({...terminal}),/STORAGE_CLOSED/);
   assert.throws(()=>A.assertOriginalDevicePagedGraphNoteAuthorityV3(terminal,runtime,system));
  }finally{await terminal?.close();await historical.close();}
  assert.throws(()=>A.readOriginalDevicePagedStorageDescriptorV8(historical),/CLOSED/);assert.throws(()=>A.readOriginalDevicePagedStorageDescriptorV8(terminal),/CLOSED/);assert.throws(()=>A.isOriginalDevicePagedExpiredStorageV8(historical),/CLOSED/);assert.throws(()=>A.isOriginalDevicePagedExpiredStorageV8(terminal),/CLOSED/);
 }
});
