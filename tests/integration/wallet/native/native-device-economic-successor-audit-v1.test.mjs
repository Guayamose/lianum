/** HOST read-only successor audit. ABI decoder, receipt-tree checks and audit
 * are actual modules; Source/Authority/current-reader are inert WeakMap ports.
 * No prover, runtime, key, financial capability, signature or POST starts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeStatement} from '@lianum/components/encoding/statements';
import {encodeFlatTransaction} from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const h=value=>sha('HOST successor audit:'+value),word=value=>BigInt(value).toString(16).padStart(64,'0');
const sourcePorts=new WeakMap(),accountPorts=new WeakMap();
let audit;

test('actual successor AUDIT decodes canonical retained recovery wire and rejects reorg, replacement and noncanonical ABI; HOST only',async t=>{
 t.mock.module(new URL('../../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs',import.meta.url).href,{exports:{
  nativeValueOriginalRecoverySourceV1(runtime,system){const row=sourcePorts.get(runtime);assert.equal(row?.system,system,'HOST_SAME_SOURCE');row.sourceReads++;return row.changedSource&&row.sourceReads>1?h('changed-source'):h('source');}
 }});
 t.mock.module(new URL('../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs',import.meta.url).href,{exports:{
  async readDeviceOwnerExecutionStatusV1(account,bridge,parentJobId){const row=accountPorts.get(account);assert.ok(row,'HOST_SAME_ACCOUNT');assert.equal(bridge,row.bridge);assert.equal(parentJobId,row.parentJobId);row.statusReads++;return row.status;},
  async readOriginalNativeDeviceEconomicProofsV1(account){const row=accountPorts.get(account);assert.ok(row);return row.exits;}
 }});
 t.mock.module(new URL('../../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs',import.meta.url).href,{exports:{
  async createNativeValueSystemStateReader({runtime,system,poolIndex}){const row=sourcePorts.get(runtime);assert.equal(row?.system,system);assert.equal(poolIndex,0);return{async read(){row.readerReads++;return row.view;},async assertCurrent(view){assert.equal(view,row.view,'HOST_SAME_CURRENT_VIEW');row.currentChecks++;assert.equal(row.reorg,false,'HOST_CANONICAL_HEAD_CHANGED');}};}
 }});
 ({auditNativeDeviceEconomicSuccessorV1:audit}=await import('./native-device-economic-successor-audit-v1.mjs'));
 function fixture(){
  const statement={domainCommitment:word(1),authorizationRoot:word(2),poolRoot:word(3),reserveNullifier:word(4),recoveryCommitment:word(5),settleBefore:'1900002000'};
  const packet={proof:'ab'.repeat(32),publicInputs:[...encodeStatement('recovery',statement)]};
  const calldata=encodeFlatTransaction('recoverGeneric',packet),pool='0x'+'11'.repeat(20),terminalHash=h('terminal'),exitHash=h('exit');
  const terminalWire={transactionHash:'0x'+terminalHash,request:{to:pool,data:calldata}},exitWire={transactionHash:'0x'+exitHash,request:{to:pool,data:'0x0102'}};
  const receipts=new Map([terminalWire,exitWire].map(w=>[w.transactionHash,{transactionHash:w.transactionHash,blockHash:'0x'+h('head'),status:'0x1'}]));
  const empty=h('typed-empty'),leaves=[h('receipt'),...Array(63).fill(empty)];
  const snapshot={outcome:'RECOVERED',admittedReceipts:1},commitments=[word(6),word(5),word(7)];
  const view={head:{number:'7',hash:'0x'+h('head'),timestamp:'1900000900'},state:{receiptCount:'1',receiptRoot:h('receipt-root')},receiptLeaves:leaves,
   receiptTree:{count:1,leafCount:1,root:h('receipt-root'),emptyLeaf:empty,leaves},
   ledger:{publicState:{root:word(3)},commitments:commitments.map(v=>'0x'+v),nullifiers:['0x'+word(4)],tree:{path(index){return{root:'0x'+word(3),index,leaf:'0x'+commitments[index],siblings:['0x'+h('sibling')]};}}}};
  const system={pools:[{address:pool}]},bridge=Object.freeze({}),account={async ownerView(){return{balances:{available:'0'}};}};
  const status={outcome:'RECOVERED',executionSnapshot:snapshot,terminal:{transactionHash:terminalHash,calldataSHA256:sha(Buffer.from(calldata.slice(2),'hex'))},reservation:{statement:{changeCommitment:word(6),recoveryCommitment:word(5),reserveCommitment:word(7)}}};
  const counters={receiptReads:0,canonicalChecks:0,nativeCanonicalChecks:0,financialEffects:0};
  const runtime={transactions:[terminalWire,exitWire],accounts:['unused-a','unused-b','unused-c','receiver'],async receipt(hash){counters.receiptReads++;return receipts.get(hash)??null;},async checkReceipt(receipt){assert.equal(receipts.get(receipt.transactionHash),receipt,'HOST_SAME_RECEIPT');},async assertCanonical(receipt){counters.canonicalChecks++;assert.equal(receipt.blockHash,'0x'+h('head'),'HOST_CANONICAL_RECEIPT');},async balance(recipient){assert.equal(recipient,this.accounts[3]);return 0n;}};
  const nativeReceipt=Object.freeze({transactionHash:'0x'+h('native'),blockHash:'0x'+h('native-head')});
  const nativeWire={phase:'mined',request:{value:'1000000'},receipt:nativeReceipt};
  const nativeRuntime={transactions:[nativeWire],accounts:['sender','recipient'],async checkReceipt(receipt){assert.equal(receipt,nativeReceipt);},async assertCanonical(receipt){assert.equal(receipt,nativeReceipt);counters.nativeCanonicalChecks++;},async balance(account){assert.ok(this.accounts.includes(account));return account==='sender'?9000000n:1000000n;}};
  const owner={ownerView:{async summary(){return{notes:{source:{status:'UNISSUED'}}};}}},row={system,view,sourceReads:0,statusReads:0,readerReads:0,currentChecks:0,reorg:false,changedSource:false};
  sourcePorts.set(runtime,row);accountPorts.set(account,{bridge,parentJobId:'original-parent',status,exits:[{status:{observation:{transactionHash:exitHash,calldataSHA256:sha(Buffer.from('0102','hex'))}},label:'same-original-exit'}]});
  return{originals:{runtime,nativeRuntime,system,owner,account,nativeExecution:Object.freeze({})},service:{executionBridge:bridge,parentJobId:'original-parent'},row,status,terminalWire,exitWire,nativeWire,counters};
 }
 await t.test('same canonical terminal and exit receipts retain recovery, original paths and one native wire',async()=>{
  const f=fixture(),result=await audit(f.originals,f.service);
  assert.equal(result.profile,'ORIGINAL_NATIVE_ECONOMIC_SUCCESSOR_PUBLIC_AUDIT_V1');assert.deepEqual(result.counts,{receiver:2,native:1});
  assert.equal(result.terminal.decoded.kind,'recovery');assert.equal(result.terminal.decoded.statement.recoveryCommitment,word(5));
  assert.equal(result.terminal.wire,f.terminalWire);assert.equal(result.nativeWire,f.nativeWire);assert.equal(result.exits[0].wire,f.exitWire);
  assert.equal(Object.keys(result.ledger.paths).length,3);assert.equal(result.originalReceiptTreeValid,true);
  assert.equal(f.row.sourceReads,2);assert.equal(f.row.currentChecks,2);assert.deepEqual(f.counters,{receiptReads:2,canonicalChecks:2,nativeCanonicalChecks:1,financialEffects:0});
 });
 for(const [label,mutate,expected] of [
  ['duplicate original receipt wire',f=>f.originals.runtime.transactions.push(f.terminalWire),{code:'ERR_ASSERTION'}],
  ['changed terminal destination',f=>f.terminalWire.request.to='0x'+'22'.repeat(20),{code:'ERR_ASSERTION'}],
  ['noncanonical retained ABI despite matching hash',f=>{f.terminalWire.request.data+='00'.repeat(32);f.status.terminal.calldataSHA256=sha(Buffer.from(f.terminalWire.request.data.slice(2),'hex'));},/FLAT_TERMINAL_TRAILING_DATA/],
  ['current canonical head reorg',f=>f.row.reorg=true,/HOST_CANONICAL_HEAD_CHANGED/],
  ['Source replaced after read',f=>f.row.changedSource=true,{code:'ERR_ASSERTION'}],
  ['changed native transfer amount',f=>f.nativeWire.request.value='1000001',{code:'ERR_ASSERTION'}],
  ['changed original receipt padding',f=>f.row.view.receiptLeaves[1]=h('wrong-padding'),/DEVICE_FINAL_RECEIPT_TREE_PADDING/]
 ])await t.test(label,async()=>{const f=fixture();mutate(f);await assert.rejects(audit(f.originals,f.service),expected);assert.equal(f.counters.financialEffects,0);});
});
