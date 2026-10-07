/** HOST ONLY actual ECDSA/custody tests; no deployed verifier or proof claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createPublicKey,verify} from 'node:crypto';
import {createPrivateWalletCustody,recoverPrivateWalletCustody,validatePrivateWalletIdentity} from '../../../src/wallet/custody/private-wallet-custody.mjs';
import {derivePrivateWalletAssetIdentity} from '../../../src/wallet/notes/private-wallet-asset-binding.mjs';
import {derivePrivateAssetIdentity,derivePrivateAssetPoolScope} from '../../../src/notes/private-asset-runtime.mjs';
import {balanceDepositFrame,balanceWithdrawFrame,walletInputPublicWords} from '../../../src/wallet/notes/private-wallet-note-encoding.mjs';
import {PrivateNoteTree} from '../../../src/notes/private-note-tree.mjs';
const h=(n=32)=>randomBytes(n).toString('hex'),id=()=>h(16);
const pub=w=>createPublicKey({key:{kty:'EC',crv:'secp256k1',x:Buffer.from(w.key_x).toString('base64url'),y:Buffer.from(w.key_y).toString('base64url')},format:'jwk'});
const asset=(chainId='31337',address=h(20),codeHash=h())=>({kind:'ERC20',address,codeHash,identity:derivePrivateWalletAssetIdentity(chainId,address,codeHash)});
const snapshot=(leaves=[],spentNullifiers=[],sequence='0')=>({root:new PrivateNoteTree(leaves).root.slice(2),sequence,epoch:'1000',blockHash:h(),leaves,spentNullifiers});
async function fixture(t,{kind='ERC20'}={}){
 const directory=await mkdtemp(join(tmpdir(),'pc25-asset-custody-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const descriptor=kind==='NATIVE'?{...asset('31337','0'.repeat(40),'0'.repeat(64)),kind}:asset(),pool=h(20),domain=h(),scope=derivePrivateAssetPoolScope('31337','0x'+pool,'0x'+domain,'0x'+descriptor.identity).slice(2);
 const identity={walletId:id(),pool,scope,policy:h(),chainId:'31337',evmGenesis:h(),bitcoinGenesis:h(),solanaGenesis:h(),issuerLifetime:h(),deploymentHash:h(),verifierSetHash:h(),asset:descriptor};
 const cfg={path:join(directory,'balance.vault'),password:'synthetic-'+h(),identity},custody=await createPrivateWalletCustody(cfg);t.after(()=>custody.close());return{cfg,custody,domain};
}
function evidence(f,p,b,before){
 const st=p.statement,deposit=p.mode==='deposit_balance',after=snapshot([...before.leaves,...(deposit?[st.output]:[])],[...before.spentNullifiers,...(deposit?[]:[st.nullifier])],String(BigInt(before.sequence)+1n)),hash=h();
 return{assetIdentity:f.cfg.identity.asset.identity,transaction:{hash,to:f.cfg.identity.pool,value:deposit&&f.cfg.identity.asset.kind==='NATIVE'?st.amount:'0',method:deposit?'depositBalance':'withdrawBalance',calldataSHA256:b.calldataSHA256,proofSHA256:b.proofSHA256,publicInputs:p.publicInputs},receipt:{transactionHash:hash,blockHash:after.blockHash,status:1},snapshot:after,canonicalBlockHash:after.blockHash,canonicalBlockHashAfter:after.blockHash,transition:{preRoot:before.root,preSequence:before.sequence,postRoot:after.root,postSequence:after.sequence,insertedCommitments:deposit?[st.output]:[],spentNullifiers:deposit?[]:[st.nullifier],admissionTag:null,recipient:deposit?null:st.recipient,amount:st.amount}};
}
const binding=p=>({requestId:p.requestId,proofSHA256:h(),calldataSHA256:h(),publicInputs:p.publicInputs});

test('ERC20 descriptor matches deployment derivation and rejects malformed, substituted and extra fields',async t=>{
 const f=await fixture(t),original=f.cfg.identity;
 assert.equal('0x'+original.asset.identity,derivePrivateAssetIdentity(original.chainId,'0x'+original.asset.address,'0x'+original.asset.codeHash));
 assert.deepEqual(validatePrivateWalletIdentity(original),original);
 for(const change of [{kind:'ETH'},{address:'0x'+original.asset.address},{address:'A'.repeat(40)},{codeHash:'00'.repeat(32)},{identity:h()},{decimals:18}])assert.throws(()=>validatePrivateWalletIdentity({...original,asset:{...original.asset,...change}}),/ASSET/);
 assert.throws(()=>validatePrivateWalletIdentity({...original,chainId:'1'}),/ASSET_IDENTITY/);
 const checkpoint=f.custody.checkpoint();await assert.rejects(recoverPrivateWalletCustody({...f.cfg,identity:{...original,asset:asset()},checkpoint}),/IDENTITY/);
 const legacy={...original};delete legacy.asset;await assert.rejects(recoverPrivateWalletCustody({...f.cfg,identity:legacy,checkpoint}),/IDENTITY/);
});

test('token deposit retains genuine base-unit signature, refuses untyped/wrong-asset/value/amount evidence, and authenticates restart',async t=>{
 const f=await fixture(t),p=await f.custody.prepareTopUp({requestId:id(),amount:'900',epoch:'1000'}),w=await f.custody.depositInput({requestId:p.requestId}),key=pub(w);
 assert.deepEqual(walletInputPublicWords('deposit_balance',w),p.publicInputs);
 const frame=scope=>balanceDepositFrame(scope,f.cfg.identity.policy,'1000','900',p.outputCommitment);
 assert.equal(verify('sha256',frame(f.cfg.identity.scope),{key,dsaEncoding:'ieee-p1363'},Buffer.from(w.signature)),true);
 const other=asset(),otherScope=derivePrivateAssetPoolScope('31337','0x'+f.cfg.identity.pool,'0x'+f.domain,'0x'+other.identity).slice(2);
 assert.equal(verify('sha256',frame(otherScope),{key,dsaEncoding:'ieee-p1363'},Buffer.from(w.signature)),false);
 const b=binding(p);await f.custody.bindSubmission(b);const e=evidence(f,p,b,snapshot());
 for(const mutate of [o=>delete o.assetIdentity,o=>o.assetIdentity=other.identity,o=>o.transaction.value='900',o=>o.transition.amount='901']){const bad=structuredClone(e);mutate(bad);await assert.rejects(f.custody.reconcile({requestId:p.requestId,observation:bad}));assert.equal(f.custody.privateBalance().available,'0');}
 await f.custody.reconcile({requestId:p.requestId,observation:e});assert.equal(f.custody.privateBalance().available,'900');
 const restored=await recoverPrivateWalletCustody({...f.cfg,checkpoint:f.custody.checkpoint()});t.after(()=>restored.close());assert.equal(restored.privateBalance().available,'900');
 const recipient=h(20),withdraw=await restored.prepareWithdrawal({requestId:id(),inputCommitment:p.outputCommitment,recipient,epoch:'1000',snapshot:e.snapshot}),signed=await restored.withdrawalInput({requestId:withdraw.requestId});
 assert.equal(verify('sha256',balanceWithdrawFrame(f.cfg.identity.scope,f.cfg.identity.policy,p.outputCommitment,recipient,'900','1000'),{key:pub(signed),dsaEncoding:'ieee-p1363'},Buffer.from(signed.signature)),true);
 const wb=binding(withdraw);await restored.bindSubmission(wb);const we=evidence(f,withdraw,wb,e.snapshot);await assert.rejects(restored.reconcile({requestId:withdraw.requestId,observation:{...we,assetIdentity:other.identity}}),/ASSET_IDENTITY/);await restored.reconcile({requestId:withdraw.requestId,observation:we});assert.equal(restored.privateBalance().notes.length,0);
});

test('tracked native deposit binds typed native identity and still requires exact transaction funding',async t=>{
 const f=await fixture(t,{kind:'NATIVE'}),p=await f.custody.prepareTopUp({requestId:id(),amount:'900',epoch:'1000'});await f.custody.depositInput({requestId:p.requestId});const b=binding(p);await f.custody.bindSubmission(b);const e=evidence(f,p,b,snapshot());
 for(const mutate of [o=>delete o.assetIdentity,o=>o.assetIdentity=asset().identity,o=>o.transaction.value='0']){const bad=structuredClone(e);mutate(bad);await assert.rejects(f.custody.reconcile({requestId:p.requestId,observation:bad}));assert.equal(f.custody.privateBalance().available,'0');}
 await f.custody.reconcile({requestId:p.requestId,observation:e});assert.equal(f.custody.privateBalance().available,'900');
});
