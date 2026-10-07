/** HOST ONLY: encrypted local custody + actual host ECDSA. No node, network,
 * funding, witness execution, genuine proof or deployed verifier evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,verify,createPublicKey} from 'node:crypto';
import {Vault} from '../src/vault.mjs';
import {encryptJson} from '../src/privacy.mjs';
import {freshKey,createGraph,reserveInput,nullifier} from '../src/private-note-encoding.mjs';
import {reserveFromNoteFrame,balanceDepositFrame,balanceWithdrawFrame,walletInputPublicWords} from '../src/private-wallet-note-encoding.mjs';
import {PrivateNoteTree} from '../src/private-note-tree.mjs';
import {createPrivateWalletCustody,recoverPrivateWalletCustody} from '../src/private-wallet-custody.mjs';
const h=(n=32)=>randomBytes(n).toString('hex');
const req=()=>`request_${h()}`;
const terms={budget:'300',solCompensation:'150',amountSol:'3000000',numerator:'1',denominator:'30'};
const snap=(leaves=[],spentNullifiers=[],sequence='0')=>({root:new PrivateNoteTree(leaves).root.slice(2),sequence,epoch:'1000',blockHash:h(),leaves,spentNullifiers});
async function fixture(t,options={}) {
  const directory=await mkdtemp(join(tmpdir(),'pc23-custody-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const policy={minimumBtcConfirmations:6};for(const role of ['sol','btc']){const k=freshKey();policy[role]={policyId:h(),identityNamespace:h(),genesis:h(),x:k.x.toString('hex'),y:k.y.toString('hex')};}
  const plan={scope:h(),policy,epoch:'1000',sourceSol:h(),recipientSol:h(),recipientBtc:h(),claimEpoch:'1012',budget:terms.budget,amountSol:terms.amountSol,numerator:terms.numerator,denominator:terms.denominator};
  const graph=createGraph(plan),identity={walletId:`wallet_${h()}`,pool:h(20),scope:plan.scope,policy:graph.policy.toString('hex'),chainId:'31337',evmGenesis:h(),bitcoinGenesis:h(),solanaGenesis:h(),issuerLifetime:h(),deploymentHash:h(),verifierSetHash:h()};
  const cfg={path:join(directory,'owner.wallet.vault'),password:`synthetic-${h()}`,identity};const custody=await createPrivateWalletCustody(cfg,options);t.after(()=>custody.close());return {directory,cfg,custody,graph,plan};
}
const binding=(p)=>({requestId:p.requestId,proofSHA256:h(),calldataSHA256:h(),publicInputs:p.publicInputs});
function evidence(f,p,b,before,status=1) {
  const st=p.statement,mode=p.mode;let leaves=[...before.leaves],spent=[...before.spentNullifiers],inserts=[],spends=[];
  if(status===1){if(mode==='deposit_balance')inserts=[st.output];else if(mode==='reserve_from_note'){inserts=[st.output,st.change];spends=[st.nullifier];}else spends=[st.nullifier];leaves.push(...inserts);spent.push(...spends);}
  const after=snap(leaves,spent,(BigInt(before.sequence)+BigInt(status)).toString());const txHash=h();
  return {transaction:{hash:txHash,to:f.cfg.identity.pool,value:mode==='deposit_balance'?st.amount:'0',method:{deposit_balance:'depositBalance',reserve_from_note:'reserveFromNoteGuarded',withdraw_balance:'withdrawBalance'}[mode],calldataSHA256:b.calldataSHA256,proofSHA256:b.proofSHA256,publicInputs:p.publicInputs},receipt:{transactionHash:txHash,blockHash:after.blockHash,status},snapshot:after,canonicalBlockHash:after.blockHash,canonicalBlockHashAfter:after.blockHash,
    transition:{preRoot:before.root,preSequence:before.sequence,postRoot:after.root,postSequence:after.sequence,insertedCommitments:inserts,spentNullifiers:spends,admissionTag:status===1&&mode==='reserve_from_note'?st.admissionTag:null,recipient:status===1&&mode==='withdraw_balance'?st.recipient:null,amount:status===1&&mode!=='reserve_from_note'?st.amount:null}};
}
async function funded(t,options) {
  const f=await fixture(t,options),initial=snap(),p=await f.custody.prepareTopUp({requestId:req(),amount:'900',epoch:'1000'}),w=await f.custody.depositInput({requestId:p.requestId}),b=binding(p);assert.deepEqual(walletInputPublicWords(p.mode,w),p.publicInputs);
  assert.equal((await f.custody.bindSubmission(b)).dispatchAllowed,true);const e=evidence(f,p,b,initial);await f.custody.reconcile({requestId:p.requestId,observation:e});return {...f,note:p.outputCommitment,snapshot:e.snapshot,topup:p};
}
async function prepared(t,options) {
  const f=await funded(t,options),input={requestId:req(),operationId:`operation_${h()}`,inputCommitment:f.note,approvedGraph:reserveInput(f.graph,'1000'),snapshot:f.snapshot,terms};const p=await f.custody.prepareSpend(input);return {...f,input,p};
}
const signInput=f=>({requestId:f.p.requestId,graph:f.graph,epoch:'1000',path:f.p.inputPath,expectedBaseRoot:f.p.expectedBaseRoot,expectedSequence:f.p.expectedSequence,expectedPostRoot:f.p.expectedPostRoot});
const pub=(x,y)=>createPublicKey({key:{kty:'EC',crv:'secp256k1',x:Buffer.from(x).toString('base64url'),y:Buffer.from(y).toString('base64url')},format:'jwk'});

test('HOST ONLY original encrypted deposit key/opening authenticates before proof/send and reopens only exact checkpoint',async t=>{
  const f=await fixture(t),request={requestId:req(),amount:'900',epoch:'1000'},p=await f.custody.prepareTopUp(request),w=await f.custody.depositInput({requestId:p.requestId});
  assert.deepEqual(Object.keys(f.custody),[]);assert.equal(f.custody.sign,undefined);assert.equal(f.custody.opening,undefined);
  assert.equal(verify('sha256',balanceDepositFrame(f.cfg.identity.scope,f.cfg.identity.policy,'1000','900',p.outputCommitment),{key:pub(w.key_x,w.key_y),dsaEncoding:'ieee-p1363'},Buffer.from(w.signature)),true);
  const ciphertext=await readFile(f.cfg.path,'utf8'),plain=(await new Vault(f.cfg.path).read(f.cfg.password)).data;
  for(const secret of [plain.notes[0].opening.secret,plain.notes[0].opening.rho,plain.notes[0].privateKeyPem,'privateKeyPem',f.cfg.password])assert.equal(ciphertext.includes(secret),false);
  assert.equal((await stat(f.cfg.path)).mode&0o777,0o600);
  assert.deepEqual(await f.custody.prepareTopUp(request),p);await assert.rejects(f.custody.prepareTopUp({...request,amount:'901'}),/REQUEST_REUSE/);
  const checkpoint=f.custody.checkpoint(),restored=await recoverPrivateWalletCustody({...f.cfg,checkpoint});t.after(()=>restored.close());
  assert.deepEqual(restored.projection(p.requestId),p);const w2=await restored.depositInput({requestId:p.requestId});for(const key of ['rho','key_x','key_y','secret','output'])assert.deepEqual(w2[key],w[key]);
  await assert.rejects(recoverPrivateWalletCustody({...f.cfg,checkpoint:{...checkpoint,stateSHA256:h()}}),/CHECKPOINT/);
  await assert.rejects(recoverPrivateWalletCustody({...f.cfg,password:'wrong',checkpoint}));
  await assert.rejects(recoverPrivateWalletCustody({...f.cfg,identity:{...f.cfg.identity,pool:h(20)},checkpoint}),/IDENTITY/);
  assert.equal(f.custody.privateBalance().available,'0');assert.equal(f.custody.summary().pending,true);
  const summary=JSON.stringify(f.custody.summary());for(const hidden of [p.outputCommitment,'900','opening','terms','proofSHA256'])assert.equal(summary.includes(hidden),false);
});

test('HOST ONLY pending spend locks original input and withholds original change until exact canonical signed transition',async t=>{
  const f=await prepared(t),p=f.p;assert.equal(f.custody.privateBalance().available,'0');assert.equal(f.custody.privateBalance().pending,'900');assert.equal(f.custody.privateBalance().unavailable,'0');
  assert.equal(p.publicInputs.length,74);assert.equal(p.reservationPath.root,`0x${p.expectedPostRoot}`);
  assert.notEqual(p.inputPath.root,p.reservationPath.root);assert.deepEqual(await f.custody.prepareSpend(f.input),p);
  await assert.rejects(f.custody.prepareSpend({...f.input,requestId:req()}),/PENDING/);
  const witness=await f.custody.reserveInput(signInput(f));assert.equal(witness.input_value,'900');assert.equal(witness.change_value,'600');assert.deepEqual(walletInputPublicWords(p.mode,witness),p.publicInputs);
  assert.equal(verify('sha256',reserveFromNoteFrame(p.statement,p.inputCommitment),{key:pub(witness.input_x,witness.input_y),dsaEncoding:'ieee-p1363'},Buffer.from(witness.input_signature)),true);
  const b=binding(p);assert.deepEqual(await f.custody.bindSubmission(b),{dispatchAllowed:true,stage:'SUBMITTING'});assert.deepEqual(await f.custody.bindSubmission(b),{dispatchAllowed:false,stage:'SUBMITTING'});
  await assert.rejects(f.custody.reserveInput(signInput(f)),/SIGNING_STAGE/);await f.custody.markUnknown(p.requestId);
  assert.equal(f.custody.privateBalance().available,'0');const e=evidence(f,p,b,f.snapshot);assert.equal((await f.custody.reconcile({requestId:p.requestId,observation:e})).stage,'CONFIRMED');
  assert.equal(f.custody.privateBalance().available,'600');assert.equal(f.custody.privateBalance().pending,'0');
  assert.equal((await f.custody.reconcile({requestId:p.requestId,observation:e})).stage,'CONFIRMED');assert.equal((await f.custody.bindSubmission(b)).dispatchAllowed,false);
  const checkpoint=f.custody.checkpoint(),restored=await recoverPrivateWalletCustody({...f.cfg,checkpoint});t.after(()=>restored.close());assert.deepEqual(restored.privateBalance(),f.custody.privateBalance());
  const g2=createGraph(f.plan),i2={requestId:req(),operationId:`operation_${h()}`,inputCommitment:p.changeCommitment,approvedGraph:reserveInput(g2,'1000'),snapshot:e.snapshot,terms};const second=await restored.prepareSpend(i2);
  assert.equal(second.inputCommitment,p.changeCommitment);assert.notEqual(second.changeCommitment,p.changeCommitment);assert.notEqual(second.reservedCommitment,p.reservedCommitment);
});

test('HOST ONLY S74 signer rejects substituted graph, value, path, epoch and every signed guard',async t=>{
  const f=await prepared(t),input=signInput(f);
  for(const field of ['expectedBaseRoot','expectedPostRoot'])await assert.rejects(f.custody.reserveInput({...input,[field]:h()}),/SIGNING_MISMATCH/);
  await assert.rejects(f.custody.reserveInput({...input,expectedSequence:'2'}),/SIGNING_MISMATCH/);
  await assert.rejects(f.custody.reserveInput({...input,epoch:'1001'}),/GRAPH_MISMATCH/);
  await assert.rejects(f.custody.reserveInput({...input,path:{...input.path,index:1}}),/SIGNING_MISMATCH/);
  await assert.rejects(f.custody.reserveInput({...input,graph:createGraph(f.plan)}),/GRAPH_MISMATCH/);
  await assert.rejects(f.custody.prepareSpend({...f.input,terms:{...terms,budget:'301'}}),/GRAPH_TERMS/);
  const w=await f.custody.reserveInput(input),key=pub(w.input_x,w.input_y),sig=Buffer.from(w.input_signature);
  for(const field of Object.keys(f.p.statement)){const changed={...f.p.statement,[field]:['epoch','expectedSequence'].includes(field)?'123':h()};assert.equal(verify('sha256',reserveFromNoteFrame(changed,f.p.inputCommitment),{key,dsaEncoding:'ieee-p1363'},sig),false,field);}
  assert.equal(verify('sha256',reserveFromNoteFrame(f.p.statement,h()),{key,dsaEncoding:'ieee-p1363'},sig),false);
  assert.equal(verify('sha256',reserveFromNoteFrame(f.p.statement,f.p.inputCommitment),{key:f.graph.owner.publicKey,dsaEncoding:'ieee-p1363'},sig),false);
});

test('HOST ONLY exact positive budget/change and authentic graph signatures gate input locking',async t=>{
  const f=await funded(t),base={requestId:req(),operationId:`operation_${h()}`,inputCommitment:f.note,approvedGraph:reserveInput(f.graph,'1000'),snapshot:f.snapshot,terms};
  for(const field of ['owner_signature','sol_invoice_signature','btc_invoice_signature']){const w=structuredClone(base.approvedGraph);w[field][0]^=1;await assert.rejects(f.custody.prepareSpend({...base,approvedGraph:w}),/GRAPH_SIGNATURE/);}
  const w=structuredClone(base.approvedGraph);w.owner_x=Array(32).fill(0);await assert.rejects(f.custody.prepareSpend({...base,approvedGraph:w}));
  for(const amount of ['900','901']){const g=createGraph({...f.plan,budget:amount}),t2={...terms,budget:amount,solCompensation:(BigInt(amount)/2n).toString()};await assert.rejects(f.custody.prepareSpend({...base,approvedGraph:reserveInput(g,'1000'),terms:t2}),/POSITIVE_CHANGE/);}
  const stale={...base.snapshot,spentNullifiers:[nullifier(f.cfg.identity.scope,f.note,(await new Vault(f.cfg.path).read(f.cfg.password)).data.notes[0].opening.secret).toString('hex')]};await assert.rejects(f.custody.prepareSpend({...base,snapshot:stale}),/MEMBERSHIP/);
  assert.equal(f.custody.privateBalance().available,'900');
});

test('HOST ONLY exact canonical failure or pre-send rejection releases input; uncertain submission never does',async t=>{
  const f=await prepared(t);await f.custody.rejectBeforeSubmission(f.p.requestId);assert.equal(f.custody.privateBalance().available,'900');assert.equal((await f.custody.rejectBeforeSubmission(f.p.requestId)).stage,'REJECTED');
  const p=await f.custody.prepareSpend({...f.input,requestId:req()}),b=binding(p);await f.custody.bindSubmission(b);await f.custody.markUnknown(p.requestId);
  await assert.rejects(f.custody.rejectBeforeSubmission(p.requestId),/SUBMISSION_AMBIGUOUS/);await f.custody.reconcile({requestId:p.requestId,observation:null});assert.equal(f.custody.privateBalance().available,'0');
  const churn=snap([...f.snapshot.leaves,h()],f.snapshot.spentNullifiers,'2');const e=evidence(f,p,b,churn,0);const wrong=structuredClone(e);wrong.transaction.calldataSHA256=h();await assert.rejects(f.custody.reconcile({requestId:p.requestId,observation:wrong}),/EXACT_TRANSACTION/);
  assert.equal(f.custody.privateBalance().available,'0');assert.equal((await f.custody.reconcile({requestId:p.requestId,observation:e})).stage,'REJECTED');assert.equal(f.custody.privateBalance().available,'900');
});

test('HOST ONLY copied exact success reconciles, spent-only/changed public proof/incorrect append order/header never releases change',async t=>{
  const f=await prepared(t),p=f.p,b=binding(p);await f.custody.bindSubmission(b);await f.custody.markUnknown(p.requestId);const original=evidence(f,p,b,f.snapshot);
  const mutations=[o=>{o.transaction.proofSHA256=h();},o=>{o.transaction.to=h(20);},o=>{o.transaction.value='1';},o=>{o.transaction.publicInputs[16]='1001';},o=>{o.transition.insertedCommitments.reverse();},o=>{o.transition.preSequence='0';},o=>{o.transition.postRoot=h();},o=>{o.canonicalBlockHashAfter=h();},o=>{o.transition.spentNullifiers=[];},o=>{o.receipt.transactionHash=h();},o=>{o.transition.admissionTag=h();}];
  for(const mutate of mutations){const changed=structuredClone(original);mutate(changed);await assert.rejects(f.custody.reconcile({requestId:p.requestId,observation:changed}));assert.equal(f.custody.privateBalance().available,'0');}
  const copied=structuredClone(original),hash=h();copied.transaction.hash=hash;copied.receipt.transactionHash=hash;assert.equal((await f.custody.reconcile({requestId:p.requestId,observation:copied})).stage,'CONFIRMED');assert.equal(f.custody.privateBalance().available,'600');
});

test('HOST ONLY explicit withdrawal binds exact original note,value,destination,epoch and canonical shared NF',async t=>{
  const f=await funded(t),request={requestId:req(),inputCommitment:f.note,recipient:h(20),epoch:'1000',snapshot:f.snapshot},p=await f.custody.prepareWithdrawal(request),w=await f.custody.withdrawalInput({requestId:p.requestId});
  const key=pub(w.key_x,w.key_y),signature=Buffer.from(w.signature),frame=(cm,recipient,amount,epoch)=>balanceWithdrawFrame(f.cfg.identity.scope,f.cfg.identity.policy,cm,recipient,amount,epoch);
  assert.equal(verify('sha256',frame(f.note,request.recipient,'900','1000'),{key,dsaEncoding:'ieee-p1363'},signature),true);
  for(const args of [[h(),request.recipient,'900','1000'],[f.note,h(20),'900','1000'],[f.note,request.recipient,'899','1000'],[f.note,request.recipient,'900','1001']])assert.equal(verify('sha256',frame(...args),{key,dsaEncoding:'ieee-p1363'},signature),false);
  const plain=(await new Vault(f.cfg.path).read(f.cfg.password)).data.notes[0];assert.equal(p.statement.nullifier,nullifier(f.cfg.identity.scope,f.note,plain.opening.secret).toString('hex'));
  const b=binding(p);await f.custody.bindSubmission(b);const e=evidence(f,p,b,f.snapshot);const bad=structuredClone(e);bad.transition.recipient=h(20);await assert.rejects(f.custody.reconcile({requestId:p.requestId,observation:bad}),/WITHDRAWAL_TRANSITION/);assert.equal(f.custody.privateBalance().available,'0');
  assert.equal((await f.custody.reconcile({requestId:p.requestId,observation:e})).stage,'CONFIRMED');assert.equal(f.custody.privateBalance().notes.length,0);
});

test('HOST ONLY authenticated original key/type/opening substitution and stale checkpoint reject reopen',async t=>{
  const f=await funded(t),checkpoint=f.custody.checkpoint(),vault=new Vault(f.cfg.path),record=await vault.read(f.cfg.password),original=await readFile(f.cfg.path);
  for(const mutate of [s=>{s.notes[0].opening.type=2;},s=>{s.notes[0].opening.secret=h();},s=>{s.notes[0].privateKeyPem=freshKey().privateKey.export({type:'pkcs8',format:'pem'});},s=>{s.identity.issuerLifetime=h();}]){
    const changed=structuredClone(record);mutate(changed.data);await writeFile(f.cfg.path,JSON.stringify(encryptJson(changed,f.cfg.password)));await assert.rejects(f.custody.authenticate(),/NOTE_TYPE|NOTE_SUBSTITUTION|KEY|IDENTITY/);await assert.rejects(recoverPrivateWalletCustody({...f.cfg,checkpoint}),/CHECKPOINT/);
  }
  await writeFile(f.cfg.path,original);await f.custody.authenticate();
  await f.custody.prepareWithdrawal({requestId:req(),inputCommitment:f.note,recipient:h(20),epoch:'1000',snapshot:f.snapshot});await assert.rejects(recoverPrivateWalletCustody({...f.cfg,checkpoint}),/CHECKPOINT/);
});

test('HOST ONLY failed-before-write and failed-after-rename require authenticated reread; no substituted key or automatic send',async t=>{
  let backend,failMode=null,captures=[];const factory=path=>{backend=new Vault(path);return {create:(...a)=>backend.create(...a),read:(...a)=>backend.read(...a),async update(password,revision,transform){const capture=transform((await backend.read(password)).data);captures.push(structuredClone(capture));if(failMode==='before')throw new Error('SYNTHETIC_WRITE');const value=await backend.update(password,revision,()=>capture);if(failMode==='after')throw new Error('SYNTHETIC_DIRECTORY_FSYNC');return value;}};};
  const f=await fixture(t,{vaultFactory:factory}),request={requestId:req(),amount:'900',epoch:'1000'};failMode='after';await assert.rejects(f.custody.prepareTopUp(request),/WRITE_UNCERTAIN/);assert.throws(()=>f.custody.checkpoint(),/WRITE_UNCERTAIN/);assert.throws(()=>f.custody.privateBalance(),/WRITE_UNCERTAIN/);await assert.rejects(f.custody.depositInput({requestId:request.requestId}),/WRITE_UNCERTAIN/);
  failMode=null;await f.custody.authenticate();const p=await f.custody.prepareTopUp(request);assert.equal(p.outputCommitment,captures[0].notes[0].commitment);assert.equal(captures.length,1);
  const b=binding(p);failMode='before';await assert.rejects(f.custody.bindSubmission(b),/WRITE_UNCERTAIN/);failMode=null;await f.custody.authenticate();assert.equal(f.custody.projection(p.requestId).stage,'PREPARED');
  failMode='after';await assert.rejects(f.custody.bindSubmission(b),/WRITE_UNCERTAIN/);failMode=null;await f.custody.authenticate();assert.equal(f.custody.projection(p.requestId).stage,'SUBMITTING');assert.equal((await f.custody.bindSubmission(b)).dispatchAllowed,false);
});

test('HOST ONLY failed confirmation durability freezes state, rereads known truth and never resurrects spent input',async t=>{
  let failWrite=false;const factory=path=>{const v=new Vault(path);return {create:(...a)=>v.create(...a),read:(...a)=>v.read(...a),async update(...a){const r=await v.update(...a);if(failWrite)throw new Error('SYNTHETIC_FSYNC');return r;}};};
  const f=await prepared(t,{vaultFactory:factory}),b=binding(f.p);await f.custody.bindSubmission(b);const e=evidence(f,f.p,b,f.snapshot);failWrite=true;await assert.rejects(f.custody.reconcile({requestId:f.p.requestId,observation:e}),/WRITE_UNCERTAIN/);
  assert.throws(()=>f.custody.privateBalance(),/WRITE_UNCERTAIN/);failWrite=false;await f.custody.authenticate();assert.equal(f.custody.privateBalance().available,'600');assert.equal((await f.custody.bindSubmission(b)).dispatchAllowed,false);assert.equal((await f.custody.reconcile({requestId:f.p.requestId,observation:e})).stage,'CONFIRMED');
});

test('HOST ONLY cooperative competing instance, encrypted tampering, unsafe path and unknown fields fail closed',async t=>{
  const f=await fixture(t),checkpoint=f.custody.checkpoint(),other=await recoverPrivateWalletCustody({...f.cfg,checkpoint});t.after(()=>other.close());await f.custody.prepareTopUp({requestId:req(),amount:'900',epoch:'1000'});
  await assert.rejects(other.prepareTopUp({requestId:req(),amount:'901',epoch:'1000'}),/RELOAD_MISMATCH/);
  const encrypted=JSON.parse(await readFile(f.cfg.path,'utf8'));encrypted.ciphertext=`${encrypted.ciphertext[0]==='0'?'1':'0'}${encrypted.ciphertext.slice(1)}`;await writeFile(f.cfg.path,JSON.stringify(encrypted));await assert.rejects(f.custody.authenticate());
  await assert.rejects(createPrivateWalletCustody({...f.cfg,unknown:true}),/FIELDS/);
});


test('HOST ONLY status0 live signed S and pre-send signed package stay locked until stale; copied winner overrides local revert',async t=>{
  const f=await prepared(t);await f.custody.reserveInput(signInput(f));
  await assert.rejects(f.custody.rejectBeforeSubmission(f.p.requestId),/FIELDS/);
  const staleRead=s=>({requestId:f.p.requestId,observation:{snapshot:s,canonicalBlockHash:s.blockHash,canonicalBlockHashAfter:s.blockHash}});
  await assert.rejects(f.custody.rejectBeforeSubmission(staleRead(f.snapshot)),/AUTHORIZATION_STILL_LIVE/);
  assert.equal(f.custody.privateBalance().available,'0');
  const b=binding(f.p);await f.custody.bindSubmission(b);await assert.rejects(f.custody.reconcile({requestId:f.p.requestId,observation:evidence(f,f.p,b,f.snapshot,0)}),/AUTHORIZATION_STILL_LIVE/);
  const winner=evidence(f,f.p,b,f.snapshot),localRevert=evidence(f,f.p,b,winner.snapshot,0);
  await assert.rejects(f.custody.reconcile({requestId:f.p.requestId,observation:localRevert}),/REVERT_CONFLICT/);
  assert.equal(f.custody.privateBalance().available,'0');assert.equal((await f.custody.reconcile({requestId:f.p.requestId,observation:winner})).stage,'CONFIRMED');assert.equal(f.custody.privateBalance().available,'600');
});

test('HOST ONLY signed S stale pre-send release and W epoch-expired exact failure are the only safe release paths',async t=>{
  const f=await prepared(t);await f.custody.reserveInput(signInput(f));const churn=snap([...f.snapshot.leaves,h()],f.snapshot.spentNullifiers,'2');
  await f.custody.rejectBeforeSubmission({requestId:f.p.requestId,observation:{snapshot:churn,canonicalBlockHash:churn.blockHash,canonicalBlockHashAfter:churn.blockHash}});assert.equal(f.custody.privateBalance().available,'900');
  const p=await f.custody.prepareWithdrawal({requestId:req(),inputCommitment:f.note,recipient:h(20),epoch:'1000',snapshot:churn});await f.custody.withdrawalInput({requestId:p.requestId});const b=binding(p);await f.custody.bindSubmission(b);
  await assert.rejects(f.custody.reconcile({requestId:p.requestId,observation:evidence(f,p,b,churn,0)}),/AUTHORIZATION_STILL_LIVE/);
  const e=evidence(f,p,b,churn,0);e.snapshot.epoch='1001';assert.equal((await f.custody.reconcile({requestId:p.requestId,observation:e})).stage,'REJECTED');assert.equal(f.custody.privateBalance().available,'900');
});

test('HOST ONLY owner-private current balance checks authenticated custody and canonical owned-note availability',async t=>{
  const f=await funded(t);assert.equal(f.custody.privateBalance().currentCanonicalObservation,false);
  assert.equal((await f.custody.observeBalance({snapshot:f.snapshot})).currentCanonicalObservation,true);
  const record=(await new Vault(f.cfg.path).read(f.cfg.password)).data,n=record.notes[0];const observed=snap(f.snapshot.leaves,[nullifier(f.cfg.identity.scope,n.commitment,n.opening.secret).toString('hex')],'2');
  const balance=await f.custody.observeBalance({snapshot:observed});assert.equal(balance.available,'0');assert.equal(balance.unavailable,'900');assert.equal(balance.notes[0].status,'UNAVAILABLE');
  const original=await readFile(f.cfg.path);await writeFile(f.cfg.path,'invalid ciphertext');await assert.rejects(f.custody.authenticate());assert.equal(f.custody.summary().unavailable,true);assert.throws(()=>f.custody.privateBalance(),/AUTHENTICATION_REQUIRED/);
  await writeFile(f.cfg.path,original);await f.custody.authenticate();assert.equal(f.custody.summary().unavailable,false);
});


test('HOST ONLY signer write/readback failure cannot release authorization and preserves immutable original key on retry',async t=>{
  let failSigning=false,reads=0,failReadAt=0;const factory=path=>{const v=new Vault(path);return {create:(...a)=>v.create(...a),async read(...a){reads++;if(reads===failReadAt)throw new Error('SYNTHETIC_READBACK');return v.read(...a);},async update(password,revision,transform){const r=await v.update(password,revision,transform);if(failSigning&&r.data.actions.some(a=>a.authorizationReleased))throw new Error('SYNTHETIC_AUTHORIZATION_FSYNC');return r;}};};
  const f=await fixture(t,{vaultFactory:factory}),p=await f.custody.prepareTopUp({requestId:req(),amount:'900',epoch:'1000'}),plain=(await new Vault(f.cfg.path).read(f.cfg.password)).data;
  failSigning=true;await assert.rejects(f.custody.depositInput({requestId:p.requestId}),/WRITE_UNCERTAIN/);assert.throws(()=>f.custody.checkpoint(),/WRITE_UNCERTAIN/);failSigning=false;await f.custody.authenticate();
  const w=await f.custody.depositInput({requestId:p.requestId});assert.equal(Buffer.from(w.key_x).toString('hex'),plain.notes[0].opening.x);assert.equal(Buffer.from(w.secret).toString('hex'),plain.notes[0].opening.secret);
  const b=binding(p);failReadAt=reads+3;await assert.rejects(f.custody.bindSubmission(b),/WRITE_UNCERTAIN/);failReadAt=0;await f.custody.authenticate();assert.equal((await f.custody.bindSubmission(b)).dispatchAllowed,false);
});

test('HOST ONLY revision CAS conflict quarantines an instance rather than adopting another writer or re-signing',async t=>{
  let conflict=false;const factory=path=>{const v=new Vault(path);return {create:(...a)=>v.create(...a),read:(...a)=>v.read(...a),async update(password,revision,transform){if(conflict)await v.update(password,revision,s=>s);return v.update(password,revision,transform);}};};
  const f=await fixture(t,{vaultFactory:factory});conflict=true;await assert.rejects(f.custody.prepareTopUp({requestId:req(),amount:'900',epoch:'1000'}),/WRITE_UNCERTAIN/);await assert.rejects(f.custody.authenticate(),/RELOAD_MISMATCH/);assert.equal(f.custody.summary().unavailable,true);assert.throws(()=>f.custody.privateBalance(),/WRITE_UNCERTAIN/);
});
