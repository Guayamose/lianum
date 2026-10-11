/** HOST ONLY adapter and mocked-RPC lifecycle checks; proof verification is a
 * named fixture seam, not genuine verifier/deployment evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateWalletAuthority} from '../../../../backend/src/custody/wallet/private-wallet-engine.mjs';
import {privateWalletAssetBinding,derivePrivateWalletAssetIdentity} from '../../../src/wallet/notes/private-wallet-asset-binding.mjs';
import {recoverPrivateWalletCustody} from '../../../src/wallet/custody/private-wallet-custody.mjs';
import {decodeWalletProofCalldata} from '../../../../backend/src/custody/wallet/private-wallet-authority.mjs';
import {privateVerifierCalldata} from '../../../src/wallet/runtime/private-wallet-runtime.mjs';
import {derivePrivateAssetPoolScope} from '../../../src/notes/private-asset-runtime.mjs';
import {PrivateNoteTree,privateSpentDigest} from '../../../src/notes/private-note-tree.mjs';
const h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),word=n=>BigInt(n).toString(16).padStart(64,'0'),address=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const descriptor=kind=>{const token=kind==='ERC20'?address(9).slice(2):'0'.repeat(40),codeHash=kind==='ERC20'?h(8).slice(2):'0'.repeat(64);return{kind,address:token,codeHash,identity:derivePrivateWalletAssetIdentity('31337',token,codeHash)};};
const stateTopic='0x3d5d716b1a3d4959e2b29a1d38e0735b523cf62b1a1292d2a2870d669706653c',withdrawTopic='0x8c6afca18616d300c4fb7eff2f714229e89e93825b143dc4ecc04231972aa19f';
function bindingFixture(kind='ERC20'){
 const asset=descriptor(kind),pool={address:address(3),asset:'0x'+asset.address,assetCodeHash:'0x'+asset.codeHash,assetIdentity:'0x'+asset.identity};let recipient=10n,backing=900n,approvals=[];
 const shared={identity:{chainId:'31337',asset},pool,runtime:{balance:()=>{throw Error('NATIVE_BALANCE_MUST_NOT_BE_USED');}},assetAdapter:{descriptor:asset,balance:async()=>recipient,backingBalance:async()=>backing,fundingTransactionValue:amount=>kind==='ERC20'?'0x0':'0x'+BigInt(amount).toString(16),beforeDeposit:async(amount,from)=>approvals.push({amount,from})}};
 return{shared,approvals,withdraw:amount=>{backing-=amount;recipient+=amount;}};
}
test('explicit asset adapter keeps exact recipient and tracked-backing arithmetic distinct from native balance',async()=>{
 for(const kind of ['ERC20','NATIVE']){const f=bindingFixture(kind),b=privateWalletAssetBinding(f.shared);assert.equal(b.fundingTransactionValue('900'),kind==='ERC20'?0n:900n);const before=await b.balance(address(4));f.withdraw(900n);assert.equal(await b.balance(address(4))-before,900n);assert.equal(await b.backingBalance(),0n);await b.beforeDeposit('900',address(4));assert.deepEqual(f.approvals,[{amount:'900',from:address(4)}]);assert.equal(Object.isFrozen(b.descriptor),true);}
 const f=bindingFixture();for(const field of ['address','codeHash','identity']){const bad={...f.shared,assetAdapter:{...f.shared.assetAdapter,descriptor:{...f.shared.identity.asset,[field]:'1'.repeat(field==='address'?40:64)}}};assert.throws(()=>privateWalletAssetBinding(bad),/ASSET/);}
 assert.throws(()=>privateWalletAssetBinding({...f.shared,assetAdapter:undefined}),/ADAPTER_REQUIRED/);
 assert.throws(()=>privateWalletAssetBinding({...f.shared,identity:{chainId:'31337'}}),/UNEXPECTED_ASSET_ADAPTER/);
 const badValue=privateWalletAssetBinding({...f.shared,assetAdapter:{...f.shared.assetAdapter,fundingTransactionValue:()=>1n}});assert.throws(()=>badValue.fundingTransactionValue('900'),/FUNDING_VALUE/);
});

async function engineFixture(t,kind,{verify=true}={}){
 const local=await mkdtemp(join(tmpdir(),'pc25-asset-engine-'));t.after(()=>rm(local,{recursive:true,force:true}));
 const asset=descriptor(kind),poolAddress=address(3),deploymentDomain=h(50),scope=derivePrivateAssetPoolScope('31337',poolAddress,deploymentDomain,'0x'+asset.identity),policy=h(22);
 let height=0,sequence=0,backing=0n,recipient=0n,closed=false;const surplus=7n,leaves=[],spent=[],blocks=new Map(),snapshots=new Map(),receipts=new Map(),events=[],sent=[],audits=[];
 const snapshot=()=>({scope,policy,root:new PrivateNoteTree(leaves).root,stateSequence:String(sequence),epoch:'10',blockNumber:'0x'+height.toString(16),blockHash:h(100+height),blockTimestamp:'6000',leafCount:leaves.length,spentCount:spent.length,liveReservations:0,liveOutputNotes:leaves.length-spent.length,leaves:[...leaves],nullifiers:[...spent],backedAmount:backing.toString(),assetBalance:(backing+surplus).toString()});
 function capture(transactions=[]){const s=snapshot();blocks.set(s.blockNumber,{number:s.blockNumber,hash:s.blockHash,timestamp:'0x1770',transactions});snapshots.set(s.blockNumber,s);}
 capture();
 const selectors={'depositBalance(bytes,bytes32[])':'12345678','withdrawBalance(bytes,bytes32[])':'87654321'};
 const pool={address:poolAddress,scope,policy,deploymentDomain,asset:'0x'+asset.address,assetCodeHash:'0x'+asset.codeHash,assetIdentity:'0x'+asset.identity,selectors,receipts:[],snapshot:async(b='latest')=>structuredClone(b==='latest'?snapshot():snapshots.get(b)),proofData:(mode,proof,inputs)=>privateVerifierCalldata(mode==='deposit_balance'?'12345678':'87654321',proof,inputs),verify:async()=>{events.push('verify');return verify;},call:async()=>h(1),send:async(label,tx)=>{
  const mode=tx.data.slice(2,10)==='12345678'?'deposit_balance':'withdraw_balance',decoded=decodeWalletProofCalldata(tx.data,mode,tx.data.slice(2,10)),st=decoded.statement;events.push(mode);sent.push(tx);const amount=BigInt(st.amount);
  assert.equal(BigInt(tx.value),mode==='deposit_balance'&&kind==='NATIVE'?amount:0n);
  if(mode==='deposit_balance'){leaves.push(st.output);backing+=amount;}else{spent.push(st.nullifier);backing-=amount;recipient+=amount;}
  height++;sequence++;const blockNumber='0x'+height.toString(16),hash=h(200+height),blockHash=h(100+height),transaction={hash,to:poolAddress,value:tx.value,input:tx.data,blockNumber,blockHash};
  const logs=[{address:poolAddress,topics:[stateTopic,h(sequence)],data:'0x'+snapshot().root.slice(2)+privateSpentDigest(scope,spent,spent.length).slice(2)+word(leaves.length)+word(spent.length)}];
  if(mode==='withdraw_balance')logs.push({address:poolAddress,topics:[withdrawTopic,'0x'+'0'.repeat(24)+st.recipient.slice(2)],data:'0x'+word(amount)+st.nullifier.slice(2)});
  const receipt={status:'0x1',transactionHash:hash,to:poolAddress,blockNumber,blockHash,logs};capture([transaction]);receipts.set(hash,receipt);return receipt;
 }};
 const runtime={accounts:[address(4),address(5),address(6)],balance:async()=>{throw Error('NATIVE_BALANCE_MUST_NOT_BE_USED');},evm:async(method,args)=>{if(method==='eth_getTransactionReceipt')return receipts.get(args[0]);if(method==='eth_getBlockByNumber'){const b=structuredClone(blocks.get(args[0]));if(!args[1])b.transactions=b.transactions.map(tx=>tx.hash);return b;}throw Error(method);}};
 const identity={walletId:'a'.repeat(32),pool:poolAddress.slice(2),scope:scope.slice(2),policy:policy.slice(2),chainId:'31337',evmGenesis:h(1).slice(2),bitcoinGenesis:h(2).slice(2),solanaGenesis:h(3).slice(2),issuerLifetime:h(4).slice(2),deploymentHash:h(5).slice(2),verifierSetHash:h(6).slice(2),asset};
 const shared={pool,runtime,identity,local,assetAdapter:{descriptor:asset,balance:async()=>recipient,backingBalance:async()=>backing,fundingTransactionValue:amount=>kind==='ERC20'?'0x0':'0x'+BigInt(amount).toString(16),beforeDeposit:async(amount,from)=>{assert.equal(amount,'30');assert.equal(from,address(4));events.push('approval');height++;capture();}},heavy:async(l,f)=>f(),mutate:async(l,f)=>f(),tick:async()=>{events.push('tick');return 6000;},refreshClock:async()=>{events.push('refresh');return 6000;},prepareEpochWindow:async()=>6000,audit:async(l,data)=>audits.push(data),archiveReceipts:async()=>{},privateState:async()=>({snapshot:snapshot()}),close:async()=>{closed=true;}};
 const authority=createPrivateWalletAuthority({walletId:identity.walletId,profile:'PC23_SHARED_LOCAL_V1',onCheckpoint:async()=>{}},{createRuntime:async()=>shared,runSigner:async input=>{const c=await recoverPrivateWalletCustody(input.custody);try{const preparation=input.mode==='deposit_balance'?await c.prepareTopUp(input.request):await c.prepareWithdrawal(input.request);if(input.mode==='deposit_balance')await c.depositInput({requestId:input.request.requestId});else await c.withdrawalInput({requestId:input.request.requestId});return{preparation,checkpoint:c.checkpoint(),proof:{version:1,mode:input.mode,target:'evm',proofBase64:'AQ==',publicInputs:preparation.publicInputs}};}finally{c.close();}}});t.after(()=>authority.abort());
 await authority.action('open',{});return{authority,asset,events,sent,audits,get backing(){return backing;},get recipient(){return recipient;},get closed(){return closed;},surplus};
}
for(const kind of ['ERC20','NATIVE'])test(`${kind} scoped engine verifies before approval, uses typed base units, exits exact note and closes with surplus untouched`,async t=>{
 const f=await engineFixture(t,kind);assert.throws(()=>f.authority.privateStatus(),/ASSET_STATUS_REQUIRED/);
 await f.authority.action('prepareIntent',{intentId:'b'.repeat(32),kind:'topup',terms:{amount:'30'}});await f.authority.action('execute',{intentId:'b'.repeat(32),operationId:'c'.repeat(32)});
 assert.deepEqual(f.events.slice(0,5),['verify','approval','refresh','tick','deposit_balance']);
 const status=await f.authority.privateAssetStatus();assert.equal(status.availableBaseUnits,'30');assert.deepEqual(status.asset,f.asset);assert.equal(status.notes[0].amountBaseUnits,'30');assert.equal(JSON.stringify(status).includes('Wei'),false);
 assert.equal(f.backing,30n);assert.equal(f.audits.find(a=>a.kind==='private-exact-wallet-transition').evidence.assetIdentity,f.asset.identity);
 await f.authority.action('prepareIntent',{intentId:'d'.repeat(32),kind:'exit',terms:{noteId:status.notes[0].id}});await f.authority.action('execute',{intentId:'d'.repeat(32),operationId:'e'.repeat(32)});
 assert.equal(f.recipient,30n);assert.equal(f.backing,0n);assert.equal((await f.authority.privateAssetStatus()).availableBaseUnits,'0');assert.equal(f.events.filter(e=>e==='approval').length,1);
 await f.authority.close();assert.equal(f.closed,true);assert.equal(f.surplus,7n);
});
test('failed deposit proof verification cannot approve or dispatch token funds',async t=>{
 const f=await engineFixture(t,'ERC20',{verify:false});await f.authority.action('prepareIntent',{intentId:'b'.repeat(32),kind:'topup',terms:{amount:'30'}});await assert.rejects(f.authority.action('execute',{intentId:'b'.repeat(32),operationId:'c'.repeat(32)}),/GENUINE_VERIFIER_REJECTED/);assert.deepEqual(f.events,['verify']);assert.equal(f.sent.length,0);assert.equal(f.backing,0n);
});
