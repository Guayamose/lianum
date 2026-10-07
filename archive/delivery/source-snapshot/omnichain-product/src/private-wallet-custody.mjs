/** PC23 reusable owner-balance custody, HOST ONLY.
 *
 * Original type-4 openings and keys, private terms, signatures and uncertain
 * submission latches live only in Vault ciphertext and trusted private memory.
 * A checkpoint is PRIVATE surviving-keeper state, never an API/evidence field.
 * Reopen requires that exact checkpoint; a ciphertext file alone cannot recover
 * a lost keeper, issuer or chain lifetime. Trusted host/OS/local 0700 directory,
 * cooperative single writer and Vault's fsync/CAS assumptions apply. No hostile
 * host protection, rollback-resistant hardware, or JS secret zeroization claim.
 *
 * The methods returning circuit witnesses are private owner/signer capabilities:
 * call only in the original authorizing child, through its private proof channel.
 * There is deliberately no general sign/opening/key-export operation. The
 * protocol supports type2/3 inputs, but this owner-balance adapter holds type4
 * only. Recipient/refund keys remain with their original separate custodians.
 *
 * Reconciliation takes independently collected canonical RPC evidence from the
 * immutable trusted pool adapter. Shape checking is not a consensus verifier.
 * Neither an unspent read nor a spent bit establishes a transaction outcome.
 */
import {createHash, createPrivateKey, createPublicKey, randomBytes, verify} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {canonical} from './privacy.mjs';
import {Vault} from './vault.mjs';
import {admission, origin, paymentCommitment, localCommitment, policyCommitment,
  graphCommitment, reservedCommitment, invoiceFrame, ownerFrame, nullifier,
  reserveInput as nativeReserveInput} from './private-note-encoding.mjs';
import {createBalanceNote, balanceCommitment, walletDepositInput, walletReserveInput,
  walletWithdrawInput, encodeWalletPoolInputs, walletInputPublicWords} from './private-wallet-note-encoding.mjs';
import {PrivateNoteTree, noteWordsToHash} from './private-note-tree.mjs';
import {SECP256K1_ORDER} from './private-native-certificate.mjs';
import {validatePrivateWalletAssetDescriptor} from './private-wallet-asset-binding.mjs';

const fail = code => { throw Object.assign(new Error(code), {code}); };
const need = (ok, code = 'WALLET_CUSTODY_INPUT') => { if (!ok) fail(code); };
const copy = value => JSON.parse(canonical(value));
const equal = (a,b) => canonical(a) === canonical(b);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const raw = value => Buffer.from(value, 'hex');
const h = value => Buffer.from(value).toString('hex');
const random = () => randomBytes(32).toString('hex');
const MODES = ['deposit_balance','reserve_from_note','withdraw_balance'];
const STAGES = ['PREPARED','SUBMITTING','UNKNOWN','CONFIRMED','REJECTED'];
const NOTE_STATES = ['UNISSUED','AVAILABLE','LOCKED','SPENT_INTERNALLY','WITHDRAWN','DISCARDED'];
const IDENTITY_FIELDS = ['walletId','pool','scope','policy','chainId','evmGenesis','bitcoinGenesis','solanaGenesis','issuerLifetime','deploymentHash','verifierSetHash'];
const SNAPSHOT_FIELDS = ['root','sequence','epoch','blockHash','leaves','spentNullifiers'];
const TERMS_FIELDS = ['budget','solCompensation','amountSol','numerator','denominator'];
function exact(value, fields) {
  canonical(value);
  need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value,k)), 'WALLET_CUSTODY_FIELDS');
}
function hex(value, width=32) { need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${width*2}}$`).test(value), 'WALLET_CUSTODY_HEX'); return value; }
function nonzero(value,width=32) { hex(value,width); need(value !== '00'.repeat(width),'WALLET_CUSTODY_ZERO'); return value; }
function uint(value,positive=false) { need(typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value), 'WALLET_CUSTODY_UINT'); const n=BigInt(value); need(n<(1n<<64n)&&(!positive||n>0n),'WALLET_CUSTODY_UINT'); return n; }
function opaque(value) { need(typeof value==='string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value),'WALLET_CUSTODY_ID'); return value; }
const wordHash = value => noteWordsToHash(value).slice(2);
function byteHex(value) { need(Array.isArray(value)&&value.length===32&&value.every(n=>Number.isInteger(n)&&n>=0&&n<256));return h(value); }
function keyFor(note) {
  const privateKey=createPrivateKey(note.privateKeyPem);
  need(privateKey.asymmetricKeyType==='ec'&&privateKey.asymmetricKeyDetails?.namedCurve==='secp256k1','WALLET_CUSTODY_KEY');
  const publicKey=createPublicKey(privateKey), jwk=publicKey.export({format:'jwk'});
  need(Buffer.from(jwk.x,'base64url').toString('hex')===note.opening.x && Buffer.from(jwk.y,'base64url').toString('hex')===note.opening.y,'WALLET_CUSTODY_KEY');
  return {privateKey,publicKey};
}
function publicKey(x,y) { return createPublicKey({key:{kty:'EC',crv:'secp256k1',x:raw(x).toString('base64url'),y:raw(y).toString('base64url')},format:'jwk'}); }
function signed(x,y,frame,signature) {
  need(Array.isArray(signature)&&signature.length===64&&signature.every(n=>Number.isInteger(n)&&n>=0&&n<256),'WALLET_CUSTODY_GRAPH_SIGNATURE');
  const s=BigInt('0x'+h(signature.slice(32))), r=BigInt('0x'+h(signature.slice(0,32)));
  need(r>0n&&r<SECP256K1_ORDER&&s>0n&&s<=SECP256K1_ORDER/2n && verify('sha256',frame,{key:publicKey(x,y),dsaEncoding:'ieee-p1363'},Buffer.from(signature)), 'WALLET_CUSTODY_GRAPH_SIGNATURE');
}
export function validatePrivateWalletIdentity(value) {
  exact(value,[...IDENTITY_FIELDS,...(value&&Object.hasOwn(value,'asset')?['asset']:[])]); const identity=copy(value); opaque(identity.walletId);
  nonzero(identity.pool,20); uint(identity.chainId,true);
  for(const k of IDENTITY_FIELDS.filter(k=>!['walletId','pool','chainId'].includes(k))) nonzero(identity[k]);
  if(Object.hasOwn(identity,'asset'))identity.asset=validatePrivateWalletAssetDescriptor(identity.asset,identity.chainId);
  return identity;
}
export function validatePrivateWalletTerms(value) {
  exact(value,TERMS_FIELDS);const terms=copy(value);for(const k of TERMS_FIELDS)uint(terms[k],true);
  need(BigInt(terms.solCompensation)<BigInt(terms.budget),'WALLET_CUSTODY_TERMS');
  const btc=BigInt(terms.amountSol)*BigInt(terms.numerator)/BigInt(terms.denominator);
  need(btc>0n&&btc<(1n<<64n),'WALLET_CUSTODY_TERMS'); return terms;
}
function snapshot(value) {
  exact(value,SNAPSHOT_FIELDS);const s=copy(value);nonzero(s.root);nonzero(s.blockHash);uint(s.sequence);uint(s.epoch);
  for(const k of ['leaves','spentNullifiers']) {
    need(Array.isArray(s[k])&&s[k].length<=64,'WALLET_CUSTODY_CAPACITY');s[k].forEach(v=>nonzero(v));need(new Set(s[k]).size===s[k].length,'WALLET_CUSTODY_DUPLICATE');
  }
  need(new PrivateNoteTree(s.leaves).root===`0x${s.root}`,'WALLET_CUSTODY_ROOT');return s;
}
/** Reconstruct the ORIGINAL complete graph, validate all openings/signatures and
 * bounded value/time relations. A graph-owner signature is never input authority. */
function approvedGraph(input,identity,terms) {
  const w=copy(input), t=validatePrivateWalletTerms(terms);
  need(wordHash(w.scope)===identity.scope&&wordHash(w.policy)===identity.policy,'WALLET_CUSTODY_GRAPH_SCOPE');
  const g={scope:raw(identity.scope),policy:raw(identity.policy),originSeed:raw(byteHex(w.origin_seed)),graphSalt:raw(byteHex(w.graph_salt)),
    owner:{x:raw(byteHex(w.owner_x)),y:raw(byteHex(w.owner_y))},reserveSecret:raw(byteHex(w.reserve_secret)),
    budget:uint(w.budget,true),numerator:uint(w.numerator,true),denominator:uint(w.denominator,true),claimEpoch:uint(w.claim_epoch,true),policyFields:{minimumBtcConfirmations:w.minimum_btc_confirmations}};
  const epoch=uint(w.epoch), maximumEpoch=((1n<<64n)-1n)/600n;
  need(g.claimEpoch>epoch&&g.claimEpoch<=maximumEpoch,'WALLET_CUSTODY_GRAPH_TIME');
  need(w.amount===w.budget&&w.budget===t.budget&&w.sol_payout===t.solCompensation&&w.sol_amount===t.amountSol&&w.numerator===t.numerator&&w.denominator===t.denominator,'WALLET_CUSTODY_GRAPH_TERMS');
  need(uint(w.sol_payout,true)+uint(w.btc_payout,true)===g.budget&&uint(w.btc_amount,true)===uint(w.sol_amount,true)*g.numerator/g.denominator,'WALLET_CUSTODY_GRAPH_CONSERVATION');
  need(uint(w.minimum_btc_confirmations,true)<(1n<<32n),'WALLET_CUSTODY_GRAPH_POLICY');
  for(const role of ['sol','btc']) {
    const p={};for(const [key,nk] of [['policyId','policy_id'],['identityNamespace','namespace'],['genesis','genesis'],['x','issuer_x'],['y','issuer_y']])p[key]=byteHex(w[role+'_'+nk]);g.policyFields[role]=p;
  }
  need(h(policyCommitment(g.policyFields))===identity.policy,'WALLET_CUSTODY_GRAPH_POLICY');
  for(const [slot,role] of [[1,'sol'],[2,'btc'],[3,'recovery']]) {
    const note={type:slot===3?3:2,origin:origin(g.scope,g.originSeed,slot),x:raw(byteHex(w[role+'_note_x'])),y:raw(byteHex(w[role+'_note_y'])),value:slot===3?g.budget:uint(w[role+'_payout'],true),secret:raw(byteHex(w[role+'_note_secret']))};
    publicKey(h(note.x),h(note.y));note.commitment=paymentCommitment(g.scope,note);g[slot===3?'recovery':role+'Note']=note;
    if(slot===3)continue;
    const l={chain:slot,payout:note.commitment};for(const k of ['nonce','source','recipient'])l[k]=raw(byteHex(w[role+'_'+k]));
    for(const [k,nk] of [['amount','amount'],['executeAfter','after'],['executeBefore','before'],['validFrom','from'],['validUntil','until']])l[k]=uint(w[role+'_'+nk],k==='amount');
    need(l.validFrom<l.validUntil&&l.validUntil<=g.claimEpoch&&l.executeAfter<l.executeBefore&&l.executeAfter>=l.validFrom*600n&&l.executeBefore<=l.validUntil*600n,'WALLET_CUSTODY_GRAPH_TIME');
    if(role==='btc')need(h(l.source)==='00'.repeat(32),'WALLET_CUSTODY_GRAPH_SOURCE');
    l.commitment=localCommitment(g.scope,g.policy,l);signed(h(note.x),h(note.y),invoiceFrame(g.scope,l.commitment,note.commitment),w[role+'_invoice_signature']);l.invoiceSignature=Buffer.from(w[role+'_invoice_signature']);g[role]=l;
  }
  need(!g.solNote.commitment.equals(g.btcNote.commitment),'WALLET_CUSTODY_GRAPH_PAYOUTS');
  g.commitment=graphCommitment(g);g.reserved=reservedCommitment(g);g.admission=admission(g.scope,g.originSeed);g.nullifier=nullifier(g.scope,g.reserved,g.reserveSecret);
  signed(h(g.owner.x),h(g.owner.y),ownerFrame(g.scope,g.policy,g.commitment),w.owner_signature);g.ownerSignature=Buffer.from(w.owner_signature);
  need(equal(nativeReserveInput(g,epoch),w),'WALLET_CUSTODY_GRAPH_MISMATCH');return g;
}
function serializeNote(note,identity,requestId) {
  const opening={type:4,rho:h(note.rho),x:h(note.x),y:h(note.y),value:note.value.toString(),secret:h(note.secret)};
  return {noteId:random(),commitment:h(balanceCommitment(identity.scope,identity.policy,opening)),opening,
    privateKeyPem:note.privateKey.export({type:'pkcs8',format:'pem'}),status:'UNISSUED',requestId,provenance:null};
}
function materializeNote(note) { return {...note.opening,rho:raw(note.opening.rho),x:raw(note.opening.x),y:raw(note.opening.y),secret:raw(note.opening.secret),value:BigInt(note.opening.value),commitment:raw(note.commitment),...keyFor(note)}; }
function validateNote(note,identity) {
  exact(note,['noteId','commitment','opening','privateKeyPem','status','requestId','provenance']);hex(note.noteId);nonzero(note.commitment);opaque(note.requestId);need(NOTE_STATES.includes(note.status));
  exact(note.opening,['type','rho','x','y','value','secret']);need(note.opening.type===4,'WALLET_CUSTODY_NOTE_TYPE');uint(note.opening.value,true);for(const k of ['rho','x','y','secret'])hex(note.opening[k]);
  need(h(balanceCommitment(identity.scope,identity.policy,note.opening))===note.commitment,'WALLET_CUSTODY_NOTE_SUBSTITUTION');
  need(typeof note.privateKeyPem==='string'&&note.privateKeyPem.length<4096&&note.privateKeyPem.startsWith('-----BEGIN PRIVATE KEY-----'),'WALLET_CUSTODY_KEY');keyFor(note);
}
function nf(note,identity) { return h(nullifier(identity.scope,note.commitment,note.opening.secret)); }
function actionStatement(action,identity,notes) {
  const common={scope:identity.scope,policy:identity.policy,epoch:action.epoch};
  if(action.mode==='deposit_balance'){const n=notes.find(n=>n.commitment===action.output);need(n);return {...common,amount:n.opening.value,output:n.commitment};}
  const n=notes.find(n=>n.commitment===action.input);need(n);
  if(action.mode==='withdraw_balance')return {...common,root:action.snapshot.root,nullifier:nf(n,identity),amount:n.opening.value,recipient:action.recipient};
  return {...common,root:action.snapshot.root,nullifier:nf(n,identity),output:action.output,change:action.change,admissionTag:action.admissionTag,
    expectedBaseRoot:action.snapshot.root,expectedSequence:action.snapshot.sequence,expectedPostRoot:action.expectedPostRoot};
}
function validateState(state,identity) {
  exact(state,['version','identity','notes','actions']);need(state.version===1&&equal(validatePrivateWalletIdentity(state.identity),identity),'WALLET_CUSTODY_IDENTITY');
  need(Array.isArray(state.notes)&&state.notes.length<=64&&Array.isArray(state.actions)&&state.actions.length<=128,'WALLET_CUSTODY_CAPACITY');
  state.notes.forEach(n=>validateNote(n,identity));need(new Set(state.notes.map(n=>n.commitment)).size===state.notes.length&&new Set(state.notes.map(n=>n.noteId)).size===state.notes.length,'WALLET_CUSTODY_DUPLICATE');
  need(new Set(state.actions.map(a=>a.requestId)).size===state.actions.length,'WALLET_CUSTODY_DUPLICATE');
  for(const a of state.actions) {
    exact(a,['requestId','mode','operationId','stage','epoch','input','output','change','admissionTag','expectedPostRoot','recipient','snapshot','terms','approvedGraph','request','submission','confirmation','authorizationReleased']);
    need(typeof a.authorizationReleased==='boolean','WALLET_CUSTODY_SIGNING_STATE');opaque(a.requestId);need(MODES.includes(a.mode)&&STAGES.includes(a.stage));uint(a.epoch);
    if(a.mode==='reserve_from_note') {
      opaque(a.operationId);validatePrivateWalletTerms(a.terms);const g=approvedGraph(a.approvedGraph,identity,a.terms);
      need(h(g.reserved)===a.output&&h(g.admission)===a.admissionTag,'WALLET_CUSTODY_GRAPH_MISMATCH');
    }
    if(a.mode!=='deposit_balance')snapshot(a.snapshot);
    encodeWalletPoolInputs(a.mode,actionStatement(a,identity,state.notes));
    if(a.submission!==null){exact(a.submission,['proofSHA256','calldataSHA256','publicInputs']);hex(a.submission.proofSHA256);hex(a.submission.calldataSHA256);need(equal(a.submission.publicInputs,encodeWalletPoolInputs(a.mode,actionStatement(a,identity,state.notes))),'WALLET_CUSTODY_STATEMENT');}
  }
  return state;
}
function checkpointOf(record) { return {version:1,identitySHA256:digest(record.data.identity),revision:record.revision,stateSHA256:digest(record.data)}; }
function config(input,recover=false) {
  exact(input,recover?['path','password','identity','checkpoint']:['path','password','identity']);need(typeof input.path==='string'&&input.path.length>0&&!input.path.includes('\0'));
  need(typeof input.password==='string'&&input.password.length>0&&Buffer.byteLength(input.password)<=1024);const cfg={...input,identity:validatePrivateWalletIdentity(input.identity)};
  if(recover){exact(input.checkpoint,['version','identitySHA256','revision','stateSHA256']);need(input.checkpoint.version===1&&Number.isSafeInteger(input.checkpoint.revision)&&input.checkpoint.revision>=0);hex(input.checkpoint.identitySHA256);hex(input.checkpoint.stateSHA256);}
  return cfg;
}
async function localPath(path,exists=false) {
  const directory=await lstat(dirname(resolve(path)));need(directory.isDirectory()&&!directory.isSymbolicLink(),'WALLET_CUSTODY_DIRECTORY');
  if(process.platform!=='win32')need((directory.mode&0o077)===0,'WALLET_CUSTODY_DIRECTORY_PERMISSIONS');
  if(exists){const file=await lstat(path);need(file.isFile()&&!file.isSymbolicLink()&&file.nlink===1,'WALLET_CUSTODY_FILE');if(process.platform!=='win32')need((file.mode&0o077)===0,'WALLET_CUSTODY_FILE_PERMISSIONS');}
}

class PrivateWalletCustody {
  #vault;#password;#identity;#record;#uncertain=null;#unavailable=false;#busy=false;#closed=false;
  constructor(vault,cfg,record){this.#vault=vault;this.#password=cfg.password;this.#identity=cfg.identity;this.#record=copy(record);validateState(this.#record.data,this.#identity);Object.freeze(this);}
  #open(){need(!this.#closed,'WALLET_CUSTODY_CLOSED');}
  #ready(){this.#open();need(!this.#uncertain,'WALLET_CUSTODY_WRITE_UNCERTAIN');need(!this.#unavailable,'WALLET_CUSTODY_AUTHENTICATION_REQUIRED');}
  #action(id){opaque(id);const a=this.#record.data.actions.find(a=>a.requestId===id);need(a,'WALLET_CUSTODY_REQUEST_UNKNOWN');return a;}
  #note(commitment){hex(commitment);const n=this.#record.data.notes.find(n=>n.commitment===commitment);need(n,'WALLET_CUSTODY_NOTE_UNKNOWN');return n;}
  #active(){need(!this.#record.data.actions.some(a=>['PREPARED','SUBMITTING','UNKNOWN'].includes(a.stage)),'WALLET_CUSTODY_PENDING');}
  async #exclusive(work){this.#open();need(!this.#busy,'WALLET_CUSTODY_BUSY');this.#busy=true;try{return await work();}finally{this.#busy=false;}}
  async #authenticate(){
    this.#open();this.#unavailable=true;const record=await this.#vault.read(this.#password);this.#open();validateState(record.data,this.#identity);
    if(this.#uncertain){need(equal(record,this.#record)||equal(record,this.#uncertain),'WALLET_CUSTODY_RELOAD_MISMATCH');this.#record=copy(record);this.#uncertain=null;}
    else need(equal(record,this.#record),'WALLET_CUSTODY_RELOAD_MISMATCH');
    this.#unavailable=false;return {authenticated:true,checkpoint:checkpointOf(this.#record)};
  }
  async authenticate(){return this.#exclusive(()=>this.#authenticate());}
  async #write(transform){
    this.#ready();await this.#authenticate();const next=copy(this.#record);next.revision++;transform(next.data);validateState(next.data,this.#identity);this.#uncertain=next;
    try {await this.#vault.update(this.#password,this.#record.revision,current=>{need(equal(current,this.#record.data),'WALLET_CUSTODY_RELOAD_MISMATCH');return next.data;});
      const actual=await this.#vault.read(this.#password);need(equal(actual,next),'WALLET_CUSTODY_READBACK');this.#record=copy(actual);this.#uncertain=null;
    } catch {fail('WALLET_CUSTODY_WRITE_UNCERTAIN');}
  }
  checkpoint(){this.#ready();return checkpointOf(this.#record);}
  summary(){this.#open();return {version:1,available:!this.#uncertain&&!this.#unavailable&&!this.#closed,pending:this.#record.data.actions.some(a=>['PREPARED','SUBMITTING','UNKNOWN'].includes(a.stage)),unavailable:!!this.#uncertain||this.#unavailable,noteCount:this.#record.data.notes.length};}
  /** Owner-private authenticated surface only. This does NOT assert fresh chain truth. */
  privateBalance(input=null){this.#ready();let observed=null;if(input!==null){exact(input,['snapshot']);observed=snapshot(input.snapshot);}const totals={available:'0',pending:'0',unavailable:'0'};
    const notes=this.#record.data.notes.filter(n=>!['DISCARDED','SPENT_INTERNALLY','WITHDRAWN'].includes(n.status)).map(n=>({noteId:n.noteId,commitment:n.commitment,type:4,value:n.opening.value,status:n.status==='AVAILABLE'&&observed&&(!observed.leaves.includes(n.commitment)||observed.spentNullifiers.includes(nf(n,this.#identity)))?'UNAVAILABLE':n.status}));
    // Fresh top-up/change projections have not been issued. Never double-count
    // a locked input plus its prospective change as an owned on-chain balance.
    for(const n of notes){if(n.status==='UNISSUED')continue;const k=n.status==='AVAILABLE'?'available':n.status==='LOCKED'?'pending':'unavailable';totals[k]=(BigInt(totals[k])+BigInt(n.value)).toString();}
    return {...totals,notes,currentCanonicalObservation:observed!==null,sameKeeperLifetimeRequired:true};
  }
  async observeBalance(input){const request=copy(input);return this.#exclusive(async()=>{await this.#authenticate();return this.privateBalance(request);});}
  #projection(a){const statement=actionStatement(a,this.#identity,this.#record.data.notes),base={requestId:a.requestId,mode:a.mode,stage:a.stage,statement,publicInputs:encodeWalletPoolInputs(a.mode,statement)};
    if(a.mode==='deposit_balance')return {...base,outputCommitment:a.output};
    const tree=new PrivateNoteTree(a.snapshot.leaves),index=a.snapshot.leaves.indexOf(a.input);need(index>=0,'WALLET_CUSTODY_MEMBERSHIP');const inputPath=tree.path(index);
    if(a.mode==='withdraw_balance')return {...base,inputCommitment:a.input,inputNullifier:statement.nullifier,inputPath};
    tree.append(a.output);tree.append(a.change);
    return {...base,inputCommitment:a.input,inputNullifier:statement.nullifier,reservedCommitment:a.output,changeCommitment:a.change,admissionTag:a.admissionTag,epoch:a.epoch,root:a.snapshot.root,expectedBaseRoot:a.snapshot.root,expectedSequence:a.snapshot.sequence,expectedPostRoot:a.expectedPostRoot,inputPath,reservationPath:tree.path(a.snapshot.leaves.length)};
  }
  projection(requestId){this.#ready();return copy(this.#projection(this.#action(requestId)));}
  #duplicate(request,mode){const a=this.#record.data.actions.find(a=>a.requestId===request.requestId);if(a){need(a.mode===mode&&equal(a.request,request),'WALLET_CUSTODY_REQUEST_REUSE');return this.#projection(a);}return null;}
  async prepareTopUp(input){const request=copy(input);exact(request,['requestId','amount','epoch']);opaque(request.requestId);uint(request.amount,true);uint(request.epoch);
    return this.#exclusive(async()=>{this.#ready();await this.#authenticate();const old=this.#duplicate(request,'deposit_balance');if(old)return old;this.#active();
      const n=serializeNote(createBalanceNote({scope:this.#identity.scope,policy:this.#identity.policy,value:request.amount}),this.#identity,request.requestId);
      await this.#write(state=>{state.notes.push(n);state.actions.push({requestId:request.requestId,mode:'deposit_balance',operationId:null,stage:'PREPARED',epoch:request.epoch,input:null,output:n.commitment,change:null,admissionTag:null,expectedPostRoot:null,recipient:null,snapshot:null,terms:null,approvedGraph:null,request,submission:null,confirmation:null,authorizationReleased:false});});
      return this.#projection(this.#action(request.requestId));});
  }
  async prepareSpend(input){const request=copy(input);exact(request,['requestId','operationId','inputCommitment','approvedGraph','snapshot','terms']);opaque(request.requestId);opaque(request.operationId);hex(request.inputCommitment);
    const terms=validatePrivateWalletTerms(request.terms),s=snapshot(request.snapshot),g=approvedGraph(request.approvedGraph,this.#identity,terms);need(request.approvedGraph.epoch===s.epoch,'WALLET_CUSTODY_EPOCH');
    return this.#exclusive(async()=>{this.#ready();await this.#authenticate();const old=this.#duplicate(request,'reserve_from_note');if(old)return old;this.#active();
      const n=this.#note(request.inputCommitment);need(n.status==='AVAILABLE','WALLET_CUSTODY_NOTE_UNAVAILABLE');need(s.leaves.includes(n.commitment)&&!s.spentNullifiers.includes(nf(n,this.#identity)),'WALLET_CUSTODY_MEMBERSHIP');
      const changeValue=BigInt(n.opening.value)-g.budget;need(changeValue>0n,'WALLET_CUSTODY_POSITIVE_CHANGE');
      const change=serializeNote(createBalanceNote({scope:this.#identity.scope,policy:this.#identity.policy,value:changeValue}),this.#identity,request.requestId),tree=new PrivateNoteTree(s.leaves);tree.append(g.reserved);tree.append(change.commitment);
      await this.#write(state=>{state.notes.find(v=>v.commitment===n.commitment).status='LOCKED';state.notes.push(change);state.actions.push({requestId:request.requestId,mode:'reserve_from_note',operationId:request.operationId,stage:'PREPARED',epoch:s.epoch,input:n.commitment,output:h(g.reserved),change:change.commitment,admissionTag:h(g.admission),expectedPostRoot:tree.root.slice(2),recipient:null,snapshot:s,terms,approvedGraph:request.approvedGraph,request,submission:null,confirmation:null,authorizationReleased:false});});return this.#projection(this.#action(request.requestId));});
  }
  async prepareWithdrawal(input){const request=copy(input);exact(request,['requestId','inputCommitment','recipient','epoch','snapshot']);opaque(request.requestId);hex(request.inputCommitment);nonzero(request.recipient,20);uint(request.epoch);const s=snapshot(request.snapshot);need(s.epoch===request.epoch,'WALLET_CUSTODY_EPOCH');
    return this.#exclusive(async()=>{this.#ready();await this.#authenticate();const old=this.#duplicate(request,'withdraw_balance');if(old)return old;this.#active();const n=this.#note(request.inputCommitment);need(n.status==='AVAILABLE','WALLET_CUSTODY_NOTE_UNAVAILABLE');need(s.leaves.includes(n.commitment)&&!s.spentNullifiers.includes(nf(n,this.#identity)),'WALLET_CUSTODY_MEMBERSHIP');
      await this.#write(state=>{state.notes.find(v=>v.commitment===n.commitment).status='LOCKED';state.actions.push({requestId:request.requestId,mode:'withdraw_balance',operationId:null,stage:'PREPARED',epoch:request.epoch,input:n.commitment,output:null,change:null,admissionTag:null,expectedPostRoot:null,recipient:request.recipient,snapshot:s,terms:null,approvedGraph:null,request,submission:null,confirmation:null,authorizationReleased:false});});return this.#projection(this.#action(request.requestId));});
  }
  async depositInput(input){const request=copy(input);exact(request,['requestId']);return this.#exclusive(async()=>{this.#ready();await this.#authenticate();const a=this.#action(request.requestId);need(a.mode==='deposit_balance'&&a.stage==='PREPARED','WALLET_CUSTODY_SIGNING_STAGE');if(!a.authorizationReleased)await this.#write(state=>{state.actions.find(v=>v.requestId===a.requestId).authorizationReleased=true;});return walletDepositInput({scope:this.#identity.scope,policy:this.#identity.policy,epoch:a.epoch,note:materializeNote(this.#note(a.output))});});}
  async reserveInput(input){
    // graph contains KeyObjects/Buffers, so validate its exact JSON circuit view.
    need(input&&Object.keys(input).sort().join(',')===['requestId','graph','epoch','path','expectedBaseRoot','expectedSequence','expectedPostRoot'].sort().join(','),'WALLET_CUSTODY_FIELDS');
    const graph=nativeReserveInput(input.graph,input.epoch),rest=copy(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='graph')));
    return this.#exclusive(async()=>{this.#ready();await this.#authenticate();const a=this.#action(rest.requestId);need(a.mode==='reserve_from_note'&&a.stage==='PREPARED','WALLET_CUSTODY_SIGNING_STAGE');need(equal(graph,a.approvedGraph),'WALLET_CUSTODY_GRAPH_MISMATCH');const g=approvedGraph(graph,this.#identity,a.terms),p=this.#projection(a);
      need(rest.epoch===a.epoch&&equal(rest.path,p.inputPath)&&rest.expectedBaseRoot===p.expectedBaseRoot&&rest.expectedSequence===p.expectedSequence&&rest.expectedPostRoot===p.expectedPostRoot,'WALLET_CUSTODY_SIGNING_MISMATCH');
      if(!a.authorizationReleased)await this.#write(state=>{state.actions.find(v=>v.requestId===a.requestId).authorizationReleased=true;});
      const witness=walletReserveInput({graph:g,epoch:a.epoch,note:materializeNote(this.#note(a.input)),path:p.inputPath,change:materializeNote(this.#note(a.change)),expectedBaseRoot:p.expectedBaseRoot,expectedSequence:p.expectedSequence,expectedPostRoot:p.expectedPostRoot});
      need(equal(walletInputPublicWords(a.mode,witness),p.publicInputs),'WALLET_CUSTODY_STATEMENT');return witness;});
  }
  async withdrawalInput(input){const request=copy(input);exact(request,['requestId']);return this.#exclusive(async()=>{this.#ready();await this.#authenticate();const a=this.#action(request.requestId);need(a.mode==='withdraw_balance'&&a.stage==='PREPARED','WALLET_CUSTODY_SIGNING_STAGE');if(!a.authorizationReleased)await this.#write(state=>{state.actions.find(v=>v.requestId===a.requestId).authorizationReleased=true;});return walletWithdrawInput({scope:this.#identity.scope,policy:this.#identity.policy,epoch:a.epoch,note:materializeNote(this.#note(a.input)),path:this.#projection(a).inputPath,recipient:a.recipient});});}
  /** Persist + authenticate BEFORE the only send. A duplicate is never permission
   * to rebroadcast: dispatchAllowed is true only for the first successful latch. */
  async bindSubmission(input){const request=copy(input);exact(request,['requestId','proofSHA256','calldataSHA256','publicInputs']);opaque(request.requestId);hex(request.proofSHA256);hex(request.calldataSHA256);
    return this.#exclusive(async()=>{this.#ready();await this.#authenticate();const a=this.#action(request.requestId),submission={proofSHA256:request.proofSHA256,calldataSHA256:request.calldataSHA256,publicInputs:request.publicInputs};need(equal(submission.publicInputs,this.#projection(a).publicInputs),'WALLET_CUSTODY_STATEMENT');
      if(a.submission){need(equal(a.submission,submission),'WALLET_CUSTODY_SUBMISSION_MISMATCH');return {dispatchAllowed:false,stage:a.stage};}
      need(a.stage==='PREPARED','WALLET_CUSTODY_SUBMISSION_STAGE');await this.#write(state=>{const action=state.actions.find(v=>v.requestId===a.requestId);action.submission=submission;action.stage='SUBMITTING';});return {dispatchAllowed:true,stage:'SUBMITTING'};});
  }
  async markUnknown(requestId){opaque(requestId);return this.#exclusive(async()=>{this.#ready();const a=this.#action(requestId);need(['SUBMITTING','UNKNOWN'].includes(a.stage),'WALLET_CUSTODY_SUBMISSION_STAGE');if(a.stage!=='UNKNOWN')await this.#write(state=>{state.actions.find(v=>v.requestId===requestId).stage='UNKNOWN';});return {stage:'UNKNOWN',dispatchAllowed:false};});}
  async rejectBeforeSubmission(input){
    const request=typeof input==='string'?{requestId:input,observation:null}:copy(input);exact(request,['requestId','observation']);opaque(request.requestId);
    return this.#exclusive(async()=>{this.#ready();await this.#authenticate();const a=this.#action(request.requestId);if(a.stage==='REJECTED'&&a.submission===null)return {stage:'REJECTED'};
      need(a.stage==='PREPARED'&&a.submission===null,'WALLET_CUSTODY_SUBMISSION_AMBIGUOUS');
      if(a.authorizationReleased){
        exact(request.observation,['snapshot','canonicalBlockHash','canonicalBlockHashAfter']);const o=request.observation,s=snapshot(o.snapshot);
        need(s.blockHash===o.canonicalBlockHash&&o.canonicalBlockHash===o.canonicalBlockHashAfter,'WALLET_CUSTODY_CANONICAL');
        assertUnusableUnspent(this.#projection(a),s);
      }
      await this.#write(state=>this.#finish(state,a.requestId,false,null));return {stage:'REJECTED'};});
  }
  #finish(state,requestId,success,evidence){const a=state.actions.find(v=>v.requestId===requestId);a.stage=success?'CONFIRMED':'REJECTED';a.confirmation=evidence;
    if(a.input)state.notes.find(n=>n.commitment===a.input).status=success?(a.mode==='reserve_from_note'?'SPENT_INTERNALLY':'WITHDRAWN'):'AVAILABLE';
    const output=a.mode==='deposit_balance'?a.output:a.change;if(output){const n=state.notes.find(n=>n.commitment===output);n.status=success?'AVAILABLE':'DISCARDED';n.provenance=success?evidence:null;}
  }
  /** Strict evidence contract documented by validatePrivateWalletObservation.
   * Copied exact proof success can reconcile even when the submitting account or
   * transaction hash differs. Both signed S74 guards and exact calldata match. */
  async reconcile(input){const request=copy(input);exact(request,['requestId','observation']);opaque(request.requestId);
    return this.#exclusive(async()=>{this.#ready();await this.#authenticate();const a=this.#action(request.requestId);need(a.submission!==null,'WALLET_CUSTODY_SUBMISSION_REQUIRED');
      if(request.observation===null){if(['SUBMITTING','UNKNOWN'].includes(a.stage)&&a.stage!=='UNKNOWN')await this.#write(state=>{state.actions.find(v=>v.requestId===a.requestId).stage='UNKNOWN';});return {stage:this.#action(a.requestId).stage,dispatchAllowed:false};}
      const evidence=validatePrivateWalletObservation(request.observation,{identity:this.#identity,projection:this.#projection(a),submission:a.submission,snapshot:a.snapshot});
      if(['CONFIRMED','REJECTED'].includes(a.stage)){need(equal(a.confirmation,evidence),'WALLET_CUSTODY_CONFIRMATION_MISMATCH');return {stage:a.stage,dispatchAllowed:false};}
      need(['SUBMITTING','UNKNOWN'].includes(a.stage),'WALLET_CUSTODY_SUBMISSION_STAGE');await this.#write(state=>this.#finish(state,a.requestId,evidence.status===1,evidence));return {stage:this.#action(a.requestId).stage,dispatchAllowed:false};});
  }
  close(){this.#closed=true;this.#password=this.#identity=this.#record=this.#uncertain=undefined;}
}

/** Canonical evidence must come from the SAME trusted immutable runtime adapter.
 * Header hash before/after the transaction/receipt/state/event reads must agree.
 * `transition` is the exact transaction event/state delta, not the latest state.
 * For S this must be checked at its receipt transition, even if later roots exist.
 */
function assertUnusableUnspent(projection,s) {
  const st=projection.statement,mode=projection.mode;
  // The same signed S remains executable after an under-gas/status0 attempt.
  // Only a monotonic canonical guard change or expired epoch kills that package.
  // W/D have no current-root guard, so historical membership needs epoch expiry.
  const expired=BigInt(s.epoch)>BigInt(st.epoch);
  const stale=mode==='reserve_from_note'&&BigInt(s.sequence)>BigInt(st.expectedSequence);
  need(expired||stale,'WALLET_CUSTODY_AUTHORIZATION_STILL_LIVE');
  need(mode==='deposit_balance'?!s.leaves.includes(st.output):s.leaves.includes(projection.inputCommitment)&&!s.spentNullifiers.includes(st.nullifier),'WALLET_CUSTODY_REVERT_CONFLICT');
  if(mode==='reserve_from_note')need(!s.leaves.includes(st.output)&&!s.leaves.includes(st.change),'WALLET_CUSTODY_REVERT_CONFLICT');
}
export function validatePrivateWalletObservation(input,{identity,projection,submission,snapshot:before}) {
  exact(input,['transaction','receipt','snapshot','canonicalBlockHash','canonicalBlockHashAfter','transition',...(identity.asset?['assetIdentity']:[])]);const o=copy(input),s=snapshot(o.snapshot),tx=o.transaction,r=o.receipt,tr=o.transition;
  if(identity.asset)need(o.assetIdentity===identity.asset.identity,'WALLET_CUSTODY_ASSET_IDENTITY');
  exact(tx,['hash','to','value','method','calldataSHA256','proofSHA256','publicInputs']);exact(r,['transactionHash','blockHash','status']);
  nonzero(tx.hash);hex(tx.to,20);uint(tx.value);nonzero(r.blockHash);need(r.status===0||r.status===1,'WALLET_CUSTODY_RECEIPT');
  need(tx.hash===r.transactionHash&&r.blockHash===o.canonicalBlockHash&&o.canonicalBlockHash===o.canonicalBlockHashAfter&&s.blockHash===r.blockHash,'WALLET_CUSTODY_CANONICAL');
  const method={deposit_balance:'depositBalance',reserve_from_note:'reserveFromNoteGuarded',withdraw_balance:'withdrawBalance'}[projection.mode];
  need(tx.to===identity.pool&&tx.method===method&&tx.value===(projection.mode==='deposit_balance'&&identity.asset?.kind!=='ERC20'?projection.statement.amount:'0')&&tx.calldataSHA256===submission.calldataSHA256&&tx.proofSHA256===submission.proofSHA256&&equal(tx.publicInputs,projection.publicInputs),'WALLET_CUSTODY_EXACT_TRANSACTION');
  exact(tr,['preRoot','preSequence','postRoot','postSequence','insertedCommitments','spentNullifiers','admissionTag','recipient','amount']);
  hex(tr.preRoot);uint(tr.preSequence);hex(tr.postRoot);uint(tr.postSequence);need(tr.postRoot===s.root&&tr.postSequence===s.sequence,'WALLET_CUSTODY_TRANSITION');
  const st=projection.statement,mode=projection.mode;
  if(r.status===0){
    need(equal(tr.insertedCommitments,[])&&equal(tr.spentNullifiers,[])&&tr.admissionTag===null&&tr.recipient===null&&tr.amount===null&&tr.preRoot===tr.postRoot&&tr.preSequence===tr.postSequence,'WALLET_CUSTODY_REVERT');
    assertUnusableUnspent(projection,s);
  }else{
    need(BigInt(tr.postSequence)===BigInt(tr.preSequence)+1n,'WALLET_CUSTODY_TRANSITION');
    const inserts=mode==='deposit_balance'?[st.output]:mode==='reserve_from_note'?[st.output,st.change]:[],spends=mode==='deposit_balance'?[]:[st.nullifier];
    need(equal(tr.insertedCommitments,inserts)&&equal(tr.spentNullifiers,spends)&&inserts.every(cm=>s.leaves.includes(cm))&&spends.every(n=>s.spentNullifiers.includes(n)),'WALLET_CUSTODY_TRANSITION');
    if(mode==='reserve_from_note'){
      need(tr.preRoot===st.expectedBaseRoot&&tr.preSequence===st.expectedSequence&&tr.postRoot===st.expectedPostRoot&&tr.admissionTag===st.admissionTag&&tr.recipient===null&&tr.amount===null,'WALLET_CUSTODY_SIGNED_TRANSITION');
      need(equal(s.leaves,[...before.leaves,st.output,st.change])&&equal(s.spentNullifiers,[...before.spentNullifiers,st.nullifier]),'WALLET_CUSTODY_SIGNED_TRANSITION');
    }else if(mode==='deposit_balance'){
      const leaves=s.leaves.slice(0,-1);need(s.leaves.at(-1)===st.output&&new PrivateNoteTree(leaves).root===`0x${tr.preRoot}`&&tr.admissionTag===null&&tr.recipient===null&&tr.amount===st.amount,'WALLET_CUSTODY_DEPOSIT_TRANSITION');
    }else need(tr.preRoot===tr.postRoot&&tr.admissionTag===null&&tr.recipient===st.recipient&&tr.amount===st.amount,'WALLET_CUSTODY_WITHDRAWAL_TRANSITION');
  }
  return {transactionHash:tx.hash,blockHash:r.blockHash,status:r.status,method:tx.method,postRoot:tr.postRoot,postSequence:tr.postSequence,...(identity.asset?{assetIdentity:identity.asset.identity}:{})};
}
export async function createPrivateWalletCustody(input,{vaultFactory=path=>new Vault(path)}={}) {
  const cfg=config(input);await localPath(cfg.path);const vault=vaultFactory(cfg.path),initial={version:1,identity:cfg.identity,notes:[],actions:[]};
  try {await vault.create(initial,cfg.password);}catch(error){if(error?.code!=='VAULT_EXISTS')throw error;}
  await localPath(cfg.path,true);const record=await vault.read(cfg.password);need(record.revision===0&&equal(record.data,initial),'WALLET_CUSTODY_EXISTING_STATE');return new PrivateWalletCustody(vault,cfg,record);
}
export async function recoverPrivateWalletCustody(input,{vaultFactory=path=>new Vault(path)}={}) {
  const cfg=config(input,true);await localPath(cfg.path,true);const vault=vaultFactory(cfg.path),record=await vault.read(cfg.password);
  need(equal(checkpointOf(record),cfg.checkpoint),'WALLET_CUSTODY_CHECKPOINT');return new PrivateWalletCustody(vault,cfg,record);
}
