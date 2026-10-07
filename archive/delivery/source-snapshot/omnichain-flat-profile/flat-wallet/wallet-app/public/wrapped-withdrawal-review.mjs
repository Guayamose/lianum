/** Display and exact-review schema only; parsed terms grant no authority. */
export const WRAPPED_WITHDRAWAL_ACTIONS=Object.freeze({
 wrappedWithdrawPrepare:Object.freeze({title:'Revisar salida de nota wrapped',capability:'wrappedWithdrawPrepare',route:'/api/wallet/wrapped-withdrawal/prepare',command:'prepare'}),
 wrappedWithdrawReapprove:Object.freeze({title:'Volver a revisar la salida original',capability:'wrappedWithdrawReapprove',route:'/api/wallet/wrapped-withdrawal/reapprove',command:'reapprove'}),
 wrappedWithdrawCancel:Object.freeze({title:'Cancelar preparación sin firma',capability:'wrappedWithdrawCancel',route:'/api/wallet/wrapped-withdrawal/cancel',command:'cancel'}),
 wrappedWithdrawExecute:Object.freeze({title:'Ejecutar salida original',capability:'wrappedWithdrawExecute',route:'/api/wallet/wrapped-withdrawal/execute',command:'execute'}),
 wrappedWithdrawReconcile:Object.freeze({title:'Conciliar salida original',capability:'wrappedWithdrawReconcile',route:'/api/wallet/wrapped-withdrawal/reconcile',command:'reconcile'}),
});
export const isWrappedWithdrawalAction=action=>Object.hasOwn(WRAPPED_WITHDRAWAL_ACTIONS,action);
const object=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const hex=(v,n=64)=>typeof v==='string'&&new RegExp('^[0-9a-f]{'+n+'}$').test(v);
export function validWrappedWithdrawalTerms(t){return exact(t,['version','profile','role','actor','pool','assetId','asset','noteCommitment','amount','recipient','epoch','head','registryCommitment','claimAuthority'])&&t.version===1&&t.profile==='ORIGINAL_WRAPPED_WITHDRAWAL_TERMS_V1'
 &&['recipient','change'].includes(t.role)&&exact(t.actor,['kind','identitySHA256','processIdentitySHA256','generation'])&&['ORIGINAL_GRAPH_PAYOUT_RECIPIENT','ORIGINAL_WRAPPED_SOURCE_OWNER_CHANGE'].includes(t.actor.kind)
 &&t.actor.kind===(t.role==='recipient'?'ORIGINAL_GRAPH_PAYOUT_RECIPIENT':'ORIGINAL_WRAPPED_SOURCE_OWNER_CHANGE')
 &&hex(t.actor.identitySHA256)&&hex(t.actor.processIdentitySHA256)&&Number.isSafeInteger(t.actor.generation)&&t.actor.generation>0
 &&typeof t.pool==='string'&&/^0x[0-9a-f]{40}$/.test(t.pool)&&hex(t.assetId)&&object(t.asset)&&t.asset.assetId===t.assetId
 &&hex(t.noteCommitment)&&typeof t.amount==='string'&&/^[1-9][0-9]*$/.test(t.amount)&&BigInt(t.amount)<1n<<64n
 &&hex(t.recipient,40)&&t.recipient!=='0'.repeat(40)&&t.pool!=='0x'+t.recipient
 &&typeof t.epoch==='string'&&/^(0|[1-9][0-9]*)$/.test(t.epoch)&&exact(t.head,['number','hash','timestamp'])&&typeof t.head.number==='string'&&/^(0|[1-9][0-9]*)$/.test(t.head.number)&&hex(t.head.hash)
 &&typeof t.head.timestamp==='string'&&/^(0|[1-9][0-9]*)$/.test(t.head.timestamp)&&String(BigInt(t.head.timestamp)/600n)===t.epoch
 &&hex(t.registryCommitment)&&typeof t.claimAuthority==='string'&&/^0x[0-9a-f]{40}$/.test(t.claimAuthority)&&t.claimAuthority!=='0x'+'0'.repeat(40);}
export function validateWrappedWithdrawalRead(section){
 if(section===undefined||section===null)return true;
 const s=section.snapshot,v=section.owner;if(s===null&&v===null)return true;if(!object(s)||s.profile!=='ORIGINAL_WRAPPED_NOTE_WITHDRAWAL_SESSION_V1'
  ||!['READY','CLOSED','UNAVAILABLE'].includes(s.phase)||typeof s.storageAvailable!=='boolean'||typeof s.busy!=='boolean'
  ||!Number.isSafeInteger(s.queued)||s.queued<0||!Array.isArray(s.operations)||s.operations.length>2)throw Error('WALLET_WRAPPED_WITHDRAWAL_CONTRACT');
 for(const row of s.operations)if(!validWrappedWithdrawalTerms(row.terms)||!hex(row.termsSHA256)||row.role!==row.terms.role
  ||typeof row.executionAvailable!=='boolean'||!['PREPARED','CANCELLED','EXECUTE_ADMITTED','SIGNING_UNKNOWN','PROVING','PROOF_READY','LOCAL_PROOF_READY','RESUME_ADMITTED','RESUME_PROVING','RESUME_PROOF_READY','RESUME_PROOF_INTERRUPTED','SEND_UNKNOWN','UNKNOWN','CONFIRMED'].includes(row.state))throw Error('WALLET_WRAPPED_WITHDRAWAL_CONTRACT');
 if(v!==null){if(!object(v)||v.profile!==s.profile||v.privateSpendable!==null||!Array.isArray(v.offers)||v.offers.length>2)throw Error('WALLET_WRAPPED_WITHDRAWAL_CONTRACT');
  for(const row of [...v.offers,...(v.reviews??[])])if(!validWrappedWithdrawalTerms(row.terms)||!hex(row.termsSHA256))throw Error('WALLET_WRAPPED_WITHDRAWAL_CONTRACT');}
 return true;
}
export function wrappedWithdrawalContext(state,action,body){
 if(!isWrappedWithdrawalAction(action))return null;const section=state.data?.wrappedWithdrawals;validateWrappedWithdrawalRead(section);
 if(!section||state.data.errors?.wrappedWithdrawals)throw Error('WALLET_WRAPPED_WITHDRAWAL_UNAVAILABLE');
 const row=action==='wrappedWithdrawReapprove'?section.owner?.reviews?.find(v=>v.requestId===body.requestId&&v.termsSHA256===body.termsSHA256):action==='wrappedWithdrawPrepare'?section.owner?.offers?.find(v=>v.terms.role===body.role&&v.termsSHA256===body.termsSHA256)
  :section.snapshot.operations.find(v=>v.requestId===body.requestId&&v.termsSHA256===body.termsSHA256);
 if(!row||action==='wrappedWithdrawExecute'&&(row.state!=='PREPARED'||row.executionAvailable!==true)
  ||action==='wrappedWithdrawCancel'&&row.state!=='PREPARED'
  ||action==='wrappedWithdrawReconcile'&&!['SIGNING_UNKNOWN','PROVING','PROOF_READY','LOCAL_PROOF_READY','SEND_UNKNOWN','UNKNOWN','CONFIRMED'].includes(row.state))throw Error('WALLET_WRAPPED_WITHDRAWAL_ORIGINAL_REQUIRED');
 return structuredClone({terms:row.terms,termsSHA256:row.termsSHA256,...(action==='wrappedWithdrawReapprove'?{priorTermsSHA256:row.priorTermsSHA256}: {})});
}
