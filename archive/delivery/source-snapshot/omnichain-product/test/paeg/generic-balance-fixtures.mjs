/** Synthetic HOST fixtures. Never passed off as chain/proof acceptance. */
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Vault} from '../../src/vault.mjs';
import {derivePrivateWalletAssetIdentity} from '../../src/private-wallet-asset-binding.mjs';
import {derivePrivateAssetPoolScope} from '../../src/private-asset-runtime.mjs';
import {PrivateNoteTree,privateSpentDigest,ZERO_NOTE_HASH} from '../../src/private-note-tree.mjs';
import {freshKey,signature,wordsBE} from '../../src/private-note-encoding.mjs';
import {genericProofCalldata} from '../../src/paeg/local-deployment.mjs';
import {objectDigest,openTrustedOwnerDraft,recoverUncommittedOwnerDraft,OBSERVATION_TRUST} from '../../src/paeg/generic-balance-custody.mjs';

export const h=x=>createHash('sha256').update(String(x)).digest('hex');
export const artifact={abi:[
  {type:'function',name:'depositBalance',inputs:[{type:'bytes'},{type:'bytes32[]'}]},
  {type:'function',name:'reserveGenericGuarded',inputs:[{type:'bytes'},{type:'bytes32[]'},{type:'uint64'},{type:'bytes32'}]},
  {type:'function',name:'withdrawBalance',inputs:[{type:'bytes'},{type:'bytes32[]'}]},
  {type:'function',name:'recoverGeneric',inputs:[{type:'bytes'},{type:'bytes32[]'}]},
],evm:{methodIdentifiers:{'depositBalance(bytes,bytes32[])':'4d62f43f','reserveGenericGuarded(bytes,bytes32[],uint64,bytes32)':'474df794',
  'withdrawBalance(bytes,bytes32[])':'6e359c06','recoverGeneric(bytes,bytes32[])':'a1bd17e9'}}};
export function identity(){const id={walletId:'draft-wallet-one',chainId:'31337',pool:'11'.repeat(20),asset:{kind:'NATIVE',address:'0'.repeat(40),codeHash:'0'.repeat(64),identity:''},backing:'SYNTHETIC_LOCAL_POOL_ASSET',poolAbiSHA256:objectDigest(artifact)};
  for(const k of ['evmGenesis','bitcoinGenesis','solanaGenesis','poolCodeHash','policy','deploymentDomain','verifierSetHash','issuerLifetime','hubDomain','registryCommitment'])id[k]=h(k);
  id.asset.identity=derivePrivateWalletAssetIdentity(id.chainId,id.asset.address,id.asset.codeHash);
  id.scope=derivePrivateAssetPoolScope(id.chainId,'0x'+id.pool,'0x'+id.deploymentDomain,'0x'+id.asset.identity).slice(2);return id;}
const word=x=>BigInt(x).toString(16).padStart(64,'0');
const words=xs=>'0x'+xs.map(word).join('');
export function ledger(id,{commitments=[],nullifiers=[],sequence='0',reservations=0,outputs=0,backing='0',roots=null,blockHash=h('block-'+sequence),timestamp='6000'}={}){
  const root=new PrivateNoteTree(commitments).root;
  roots??=[root];const count=Buffer.alloc(4);count.writeUInt32BE(roots.length);
  const history='0x'+createHash('sha256').update(Buffer.concat([Buffer.from([0x18]),Buffer.from(id.scope,'hex'),count,
    ...[...roots,...Array(65-roots.length).fill(ZERO_NOTE_HASH)].map(x=>Buffer.from(x.slice(2),'hex'))])).digest('hex');
  return {identitySHA256:objectDigest(id),blockHash,canonicalBlockHashBefore:blockHash,canonicalBlockHashAfter:blockHash,timestamp,
    rawState:words([root,privateSpentDigest('0x'+id.scope,nullifiers),sequence,commitments.length,nullifiers.length,reservations,outputs,
      ...commitments,...Array(64-commitments.length).fill(ZERO_NOTE_HASH),...nullifiers,...Array(64-nullifiers.length).fill(ZERO_NOTE_HASH)]),
    rawHistory:words([sequence,history,roots.length,...roots,...Array(65-roots.length).fill(ZERO_NOTE_HASH)]),
    rawBacking:words([sequence,backing,backing,0,0,0])};}
export async function setup(t,options={}) {
  const directory=await mkdtemp(join(tmpdir(),'generic-balance-draft-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const id=identity(),path=join(directory,'owner.vault'),password='synthetic-host-fixture-password';
  let current=ledger(id),observations=new Map(),keeper=null,fault=null,readFail=false,lostCandidate=null;
  const vault=new Vault(path);
  const proxy={create:(...args)=>vault.create(...args),read:async(...args)=>{if(readFail){readFail=false;throw Error('fixture lost readback');}return vault.read(...args);},
    update:async(...args)=>{if(fault==='before'){fault=null;throw Error('fixture before write');}
      if(fault==='before-signed-result'){
        const old=await vault.read(password);if(old.data.operations.at(-1)?.stage==='SIGNING'){
          lostCandidate=structuredClone(args[2](old.data));fault=null;throw Error('fixture signed result not committed');}}
      const r=await vault.update(...args);if(fault==='after'||(fault==='after-signed-result'&&r.data.operations.at(-1)?.stage==='AUTHORIZED')){
        fault=null;throw Error('fixture after rename');}if(fault==='readback'){fault=null;readFail=true;}return r;}};
  const deps={observer:{trust:OBSERVATION_TRUST,readSnapshot:async()=>structuredClone(current),readTransaction:async q=>structuredClone(observations.get(q.ownerOperationRef)??null)},
    onCheckpoint:async cp=>{keeper=structuredClone(cp);if(fault==='keeper-ack'&&cp.pending===null){fault=null;throw Error('fixture keeper acknowledgement');}},
    vaultFactory:()=>proxy};
  const config={path,password,identity:id,poolArtifact:artifact,create:true,checkpoint:null};
  let opened=await openTrustedOwnerDraft(config,deps);
  const f={id,path,password,vault,deps,config,get owner(){return opened.owner;},get publicView(){return opened.publicView;},
    get checkpoint(){return structuredClone(keeper);},get snapshot(){return structuredClone(current);},
    get lostCandidate(){return structuredClone(lostCandidate);},
    set snapshot(s){current=structuredClone(s);},setFault(mode){fault=mode;},observe(ref,o){observations.set(ref,structuredClone(o));},
    async reopen(overrides={}){opened.owner.close();opened=await openTrustedOwnerDraft({...config,create:false,checkpoint:keeper,...overrides},deps);return opened;},
    async recoverAbsent(overrides={}){opened.owner.close();opened=await recoverUncommittedOwnerDraft({...config,create:false,checkpoint:keeper,...overrides},deps);return opened;}};
  t.after(()=>f.owner.close());return f;
}
export function submission(f,reference,kind='S66') {
  const p=f.owner.ownerPlan(reference),proofHex='c0ffee'; // deliberately NOT a valid proof
  return {ownerOperationRef:reference,proofHex,publicInputs:p.publicInputs,
    calldata:genericProofCalldata(artifact,kind==='S66'?'reserveGenericGuarded(bytes,bytes32[],uint64,bytes32)':kind==='D26'?'depositBalance(bytes,bytes32[])':'withdrawBalance(bytes,bytes32[])',
      Buffer.from(proofHex,'hex'),p.publicInputs,p.guards),authorizationSHA256:p.authorizationSHA256??null};
}
export function success(f,reference,request,kind='S66') {
  const before=f.snapshot,p=f.owner.ownerPlan(reference),raw=before.rawState.slice(2).match(/.{64}/g).map(x=>'0x'+x),
    hr=before.rawHistory.slice(2).match(/.{64}/g).map(x=>'0x'+x),bk=before.rawBacking.slice(2).match(/.{64}/g).map(x=>'0x'+x);
  const commitments=raw.slice(7,7+Number(BigInt(raw[3]))),nullifiers=raw.slice(71,71+Number(BigInt(raw[4]))),
    roots=hr.slice(3,3+Number(BigInt(hr[2]))),seq=String(BigInt(raw[2])+1n),d=kind==='D26',w=kind==='W39';
  const inserts=d?[p.statement.output]:w?[]:[p.statement.reserveCommitment,p.statement.changeCommitment],spends=d?[]:[w?p.statement.nullifier:p.statement.inputNullifier];
  commitments.push(...inserts.map(x=>'0x'+x));nullifiers.push(...spends.map(x=>'0x'+x));if(!w)roots.push(new PrivateNoteTree(commitments).root);
  const after=ledger(f.id,{commitments,nullifiers,roots,sequence:seq,reservations:Number(BigInt(raw[5]))+(d||w?0:1),
    outputs:Number(BigInt(raw[6]))+(d?1:w?-1:0),backing:String(BigInt(bk[1])+(d?BigInt(p.statement.amount):w?-BigInt(p.statement.amount):0n)),timestamp:before.timestamp});
  const hash=h('tx-'+reference),state=after.rawState.slice(2).match(/.{64}/g).map(x=>'0x'+x);
  return {identitySHA256:objectDigest(f.id),transaction:{hash,to:f.id.pool,value:d?p.statement.amount:'0',calldata:request.calldata},
    receipt:{transactionHash:hash,blockHash:after.blockHash,status:1},before,after,
    stateAdvanced:{address:f.id.pool,transactionHash:hash,blockHash:after.blockHash,sequence:seq,root:state[0],spent:state[1],
      leaves:commitments.length,consumed:nullifiers.length},
    transition:{insertedCommitments:inserts,spentNullifiers:spends,admissionTag:d||w?null:p.statement.admissionTag},
    ...(w?{withdrawal:{address:f.id.pool,transactionHash:hash,blockHash:after.blockHash,recipient:p.statement.recipient,
      amount:p.statement.amount,nullifier:p.statement.nullifier}}:{})};
}
export async function fund(f) {
  const ref='funding-reference';await f.owner.prepareFunding({ownerOperationRef:ref,identitySHA256:objectDigest(f.id),amount:'50000',epoch:'10'});
  await f.owner.depositInput(ref);const req=submission(f,ref,'D26');await f.owner.bindSubmission(req);
  const o=success(f,ref,req,'D26');f.observe(ref,o);await f.owner.reconcile(ref);f.snapshot=o.after;
  return f.owner.privateBalance().notes.find(n=>n.status==='AVAILABLE');
}
export function terms(reference,budget) {
  const key=freshKey();return {key,terms:{operationId:h(reference),budget:String(budget),fundingNotBefore:'5900',fundingValidUntil:'6200',settleBefore:'6300',
    nodes:[{id:'transfer-one',chainDomain:h('chain'),evidencePolicy:h('policy'),actionCommitment:h('action-'+reference),dependsOn:[],
      payout:{x:key.x.toString('hex'),y:key.y.toString('hex'),value:String(budget),secret:h('payout-secret-'+reference),randomness:h('payout-random-'+reference)}}]}};
}
export async function prepare(f,note,reference,budget) {
  const {key,terms:t}=terms(reference,budget),request={ownerOperationRef:reference,identitySHA256:objectDigest(f.id),sourceNoteId:note.noteId,terms:t};
  await f.owner.prepareOperation(request);const invoices=f.owner.invoiceRequests(reference);
  const authorization={ownerOperationRef:reference,invoiceSignatures:invoices.map(r=>signature(key,Buffer.from(r.message,'hex')).toString('hex'))};
  const signed=await f.owner.authorizeOperation(authorization);return {request,authorization,signed,submission:submission(f,reference)};
}

/** F51 HOST observation with deliberately invalid proof bytes. Real Vault note
 * commitments are used, but this fixture proves no native/chain acceptance. */
export async function recoverySuccess(f, reference, options = {}) {
  const original = options.authorizationStatement
    ?? (await f.vault.read(f.password)).data.operations.find(value => value.ownerOperationRef === reference).authorizationStatement;
  const before = structuredClone(f.snapshot), raw = before.rawState.slice(2).match(/.{64}/g).map(value => '0x' + value);
  const history = before.rawHistory.slice(2).match(/.{64}/g).map(value => '0x' + value);
  const backing = before.rawBacking.slice(2).match(/.{64}/g).map(value => '0x' + value);
  const commitments = raw.slice(7, 7 + Number(BigInt(raw[3]))), nullifiers = raw.slice(71, 71 + Number(BigInt(raw[4])));
  const roots = history.slice(3, 3 + Number(BigInt(history[2]))), sequence = String(BigInt(raw[2]) + 1n);
  const recovery = {scope: f.id.scope, policy: f.id.policy, asset: f.id.asset.identity,
    acceptedRoot: options.acceptedRoot ?? raw[0].slice(2), reserveNullifier: original.reserveNullifier,
    recoveryCommitment: original.recoveryCommitment, settleBefore: original.settleBefore,
    validFrom: options.validFrom ?? original.settleBefore, validUntil: options.validUntil ?? '6900'};
  const publicInputs = ['scope', 'policy', 'asset', 'acceptedRoot', 'reserveNullifier', 'recoveryCommitment']
    .flatMap(key => wordsBE(Buffer.from(recovery[key], 'hex')).map(String))
    .concat(recovery.settleBefore, recovery.validFrom, recovery.validUntil);
  const calldata = genericProofCalldata(artifact, 'recoverGeneric(bytes,bytes32[])', Buffer.from('c0ffee', 'hex'), publicInputs);
  commitments.push('0x' + recovery.recoveryCommitment); nullifiers.push('0x' + recovery.reserveNullifier);
  roots.push(new PrivateNoteTree(commitments).root);
  const after = ledger(f.id, {commitments, nullifiers, roots, sequence,
    reservations: Number(BigInt(raw[5])) - 1, outputs: Number(BigInt(raw[6])) + 1, backing: String(BigInt(backing[1])),
    timestamp: options.timestamp ?? recovery.validFrom});
  const hash = h('recovery-tx-' + reference), state = after.rawState.slice(2).match(/.{64}/g).map(value => '0x' + value);
  return {identitySHA256: objectDigest(f.id), transaction: {hash, to: f.id.pool, value: '0', calldata},
    receipt: {transactionHash: hash, blockHash: after.blockHash, status: 1}, before, after,
    stateAdvanced: {address: f.id.pool, transactionHash: hash, blockHash: after.blockHash, sequence,
      root: state[0], spent: state[1], leaves: commitments.length, consumed: nullifiers.length},
    transition: {insertedCommitments: [recovery.recoveryCommitment], spentNullifiers: [recovery.reserveNullifier], admissionTag: null},
    recovery};
}
export const recoveryRequest = (observation, reference) => ({ownerOperationRef: reference,
  transactionHash: observation.transaction.hash,
  calldataSHA256: createHash('sha256').update(Buffer.from(observation.transaction.calldata.slice(2), 'hex')).digest('hex')});
