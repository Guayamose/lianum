// Canonical host encoders for the bounded PC15 funded-note experiment.
// Host checks are fixture hygiene; actual authorization is enforced by Noir + pool.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { encodePC15Frame, encodeChainDomain, effectConsumptionHash, SECP256K1_ORDER } from './private-native-certificate.mjs';
export const sha256 = b => createHash('sha256').update(b).digest();
export const hex32 = b => { const x=Buffer.isBuffer(b)?Buffer.from(b):Buffer.from(b,'hex'); assert.equal(x.length,32); if(typeof b==='string')assert.match(b,/^[0-9a-f]{64}$/); return x; };
export const uintBE = (n,width) => { assert.ok(typeof n==='bigint'||typeof n==='number'||(typeof n==='string'&&/^(0|[1-9][0-9]*)$/.test(n))); if(typeof n==='number')assert.ok(Number.isSafeInteger(n)&&n>=0&&!Object.is(n,-0)); n=BigInt(n); assert.ok(n>=0n&&n<(1n<<BigInt(width*8))); return Buffer.from(n.toString(16).padStart(width*2,'0'),'hex'); };
export const wordsBE = b => { b=Buffer.from(b); assert.equal(b.length%4,0);return Array.from({length:b.length/4},(_,i)=>b.readUInt32BE(i*4)); };
export const frame=encodePC15Frame;
export const hashFrame=(tag, fields)=>sha256(frame(tag,fields));
export const bytes = b => [...Buffer.from(b)];
export function freshKey(){const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),j=publicKey.export({format:'jwk'});return{privateKey,publicKey,x:Buffer.from(j.x,'base64url'),y:Buffer.from(j.y,'base64url')};}
export function signature(key,message){let b=sign('sha256',message,{key:key.privateKey,dsaEncoding:'ieee-p1363'});let s=BigInt('0x'+b.subarray(32).toString('hex'));if(s>SECP256K1_ORDER/2n)s=SECP256K1_ORDER-s;b=Buffer.concat([b.subarray(0,32),uintBE(s,32)]);assert.equal(verify('sha256',message,{key:key.publicKey,dsaEncoding:'ieee-p1363'},b),true);return b;}
export const origin=(scope,seed,slot)=>hashFrame('PC15/note-origin/1',[hex32(scope),hex32(seed),uintBE(slot,1)]);
export const admission=(scope,seed)=>hashFrame('PC15/note-admission/1',[hex32(scope),hex32(seed)]);
export function paymentCommitment(scope,n){assert.ok(n.type===2||n.type===3);return hashFrame('PC15/payment-note/1',[hex32(scope),hex32(n.origin),uintBE(n.type,1),hex32(n.x),hex32(n.y),uintBE(n.value,8),hex32(n.secret)]);}
export function localCommitment(scope,policy,l){return hashFrame('PC15/local-note-leg/1',[hex32(scope),hex32(policy),uintBE(l.chain,1),hex32(l.nonce),hex32(l.source),hex32(l.recipient),uintBE(l.amount,8),uintBE(l.executeAfter,8),uintBE(l.executeBefore,8),uintBE(l.validFrom,8),uintBE(l.validUntil,8),hex32(l.payout)]);}
export function policyCommitment(p){const f=[];for(const c of ['sol','btc'])for(const k of ['policyId','identityNamespace','genesis','x','y'])f.push(hex32(p[c][k]));return hashFrame('PC15/note-policy/1',[...f,uintBE(p.minimumBtcConfirmations,4),uintBE(600,8)]);}
export const invoiceFrame=(scope,local,payout)=>frame('PC15/note-invoice/1',[hex32(scope),hex32(local),hex32(payout)]);
export const ownerFrame=(scope,policy,graph)=>frame('PC15/note-authorize/1',[hex32(scope),hex32(policy),hex32(graph)]);
export function graphCommitment(g){return hashFrame('PC15/note-graph/1',[hex32(g.scope),hex32(g.policy),hex32(g.originSeed),hex32(g.graphSalt),hex32(g.owner.x),hex32(g.owner.y),hex32(g.sol.commitment),hex32(g.btc.commitment),hex32(g.recovery.commitment),uintBE(g.budget,8),uintBE(g.numerator,8),uintBE(g.denominator,8),uintBE(g.claimEpoch,8)]);}
export function reservedCommitment(g){return hashFrame('PC15/reserved-note/1',[hex32(g.scope),hex32(g.originSeed),hex32(g.owner.x),hex32(g.owner.y),uintBE(g.budget,8),hex32(g.commitment),hex32(g.reserveSecret),uintBE(g.claimEpoch,8)]);}
export const nullifier=(scope,cm,secret)=>hashFrame('PC15/note-spend/1',[hex32(scope),hex32(cm),hex32(secret)]);
export const withdrawFrame=(scope,policy,cm,recipient,amount,epoch)=>{assert.equal(Buffer.from(recipient).length,20);return frame('PC15/note-withdraw/1',[hex32(scope),hex32(policy),hex32(cm),Buffer.from(recipient),uintBE(amount,8),uintBE(epoch,8)]);};
export function createGraph({scope,policy,epoch,sourceSol,recipientSol,recipientBtc,amountSol=3000000n,numerator=1n,denominator=30n,budget=1000000000000000n,claimEpoch=BigInt(epoch)+120n}){
 const owner=freshKey(),originSeed=randomBytes(32),graphSalt=randomBytes(32),reserveSecret=randomBytes(32),policyHash=policyCommitment(policy);
 const g={scope:hex32(scope),policy:policyHash,policyFields:policy,originSeed,graphSalt,owner,budget:BigInt(budget),numerator:BigInt(numerator),denominator:BigInt(denominator),claimEpoch:BigInt(claimEpoch),reserveSecret};
 const values=[g.budget/2n,g.budget-g.budget/2n,g.budget];
 for(let i=0;i<3;i++){const key=freshKey(),slot=i+1,n={type:i<2?2:3,origin:origin(scope,originSeed,slot),...key,value:values[i],secret:randomBytes(32)};n.commitment=paymentCommitment(scope,n);g[i===0?'solNote':i===1?'btcNote':'recovery']=n;}
 const executeAfter=BigInt(epoch)*600n,executeBefore=(g.claimEpoch-1n)*600n;
 for(const [chain,name,source,recipient,amount,note] of [[1,'sol',sourceSol,recipientSol,BigInt(amountSol),g.solNote],[2,'btc',Buffer.alloc(32),recipientBtc,BigInt(amountSol)*g.numerator/g.denominator,g.btcNote]]){
  const l={chain,nonce:randomBytes(32),source:hex32(source),recipient:hex32(recipient),amount,executeAfter,executeBefore,validFrom:BigInt(epoch),validUntil:g.claimEpoch,payout:note.commitment};l.commitment=localCommitment(scope,policyHash,l);l.invoiceSignature=signature(note,invoiceFrame(scope,l.commitment,note.commitment));g[name]=l;
 }
 g.commitment=graphCommitment(g);g.reserved=reservedCommitment(g);g.ownerSignature=signature(owner,ownerFrame(scope,policyHash,g.commitment));g.nullifier=nullifier(scope,g.reserved,reserveSecret);g.admission=admission(scope,originSeed);return g;
}
export function graphWitness(g){const out={origin_seed:bytes(g.originSeed),graph_salt:bytes(g.graphSalt),owner_x:bytes(g.owner.x),owner_y:bytes(g.owner.y),reserve_secret:bytes(g.reserveSecret),budget:g.budget.toString(),numerator:g.numerator.toString(),denominator:g.denominator.toString(),claim_epoch:g.claimEpoch.toString(),owner_signature:bytes(g.ownerSignature)};
 for(const c of ['sol','btc'])for(const [key,nk] of [['policyId','policy_id'],['identityNamespace','namespace'],['genesis','genesis'],['x','issuer_x'],['y','issuer_y']])out[c+'_'+nk]=bytes(hex32(g.policyFields[c][key]));out.minimum_btc_confirmations=String(g.policyFields.minimumBtcConfirmations);
 for(const [name,n] of [['sol',g.solNote],['btc',g.btcNote],['recovery',g.recovery]]){out[name+'_note_x']=bytes(n.x);out[name+'_note_y']=bytes(n.y);out[name+'_note_secret']=bytes(n.secret);if(name!=='recovery')out[name+'_payout']=n.value.toString();}
 for(const c of ['sol','btc']){const l=g[c];for(const k of ['nonce','source','recipient'])out[c+'_'+k]=bytes(l[k]);for(const [k,nk]of[['amount','amount'],['executeAfter','after'],['executeBefore','before'],['validFrom','from'],['validUntil','until']])out[c+'_'+nk]=l[k].toString();}
 return out;
}
export function reserveInput(g,epoch){return{scope:wordsBE(g.scope),policy:wordsBE(g.policy),epoch:String(epoch),amount:g.budget.toString(),output:wordsBE(g.reserved),admission_tag:wordsBE(g.admission),...graphWitness(g),sol_invoice_signature:bytes(g.sol.invoiceSignature),btc_invoice_signature:bytes(g.btc.invoiceSignature)};}
export function certificateWitness(prefix,e){const c=e.certificate;const effect=prefix==='sol'?{effect_signature:bytes((awaitBase58)(c.canonicalEffect.signature)),effect_index:String(c.canonicalEffect.instructionIndex)}:{effect_txid:bytes(hex32(c.canonicalEffect.txid)),effect_index:String(c.canonicalEffect.vout)};const out={};for(const[k,v]of Object.entries(effect))out[prefix+'_'+k]=v;for(const[k,n]of[['observedBlockIdentity','block_hash'],['observedTipIdentity','tip_hash'],['opaqueTag','tag']])out[prefix+'_'+n]=bytes(hex32(c[k]));for(const[k,n]of[['finalityMeasure','finality'],['observedBlockNumber','block_number'],['observedTipNumber','tip_number'],['observedAt','observed_at']])out[prefix+'_'+n]=c[k];out[prefix+'_certificate_signature']=bytes(Buffer.from(e.signature,'hex'));return out;}
// Existing canonical base58 decoder, with its exact 64-byte/roundtrip checks.
import { base58Decode } from '../chains/solana/solana-runtime.mjs';
const awaitBase58=s=>base58Decode(s,64);
export function effectNullifier(scope,envelope){const c=envelope.certificate;return effectConsumptionHash(hex32(scope).toString('hex'),c.chainDomain,c.opaqueTag);}
