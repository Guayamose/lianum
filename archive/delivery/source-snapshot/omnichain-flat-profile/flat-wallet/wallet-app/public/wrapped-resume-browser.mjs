/** Manual browser recovery. Grants come only from the original local shell;
 * no grant issuer, ambient message listener, polling or automatic next step. */
import {WRAPPED_RESUME_ACTIONS} from './wrapped-withdrawal-resume-actions.mjs';
import {handoffData,sameHandoff,handoffDescriptor} from './manual-action-handoff.mjs';
const need=ok=>{if(!ok)throw Error('WALLET_RESUME_BROWSER_INVALID');};
const exact=(v,keys)=>v&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const uint=(v,bits)=>typeof v==='string'&&v.length<=(bits===64?20:78)&&/^(0|[1-9][0-9]*)$/.test(v)&&BigInt(v)<(1n<<BigInt(bits));
const h=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=async v=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(v)))),b=>b.toString(16).padStart(2,'0')).join('');
const baseKeys=['version','profile','action','requestId','role','noteCommitment','canonicalNullifier','pool','assetId','amount','recipient','registryCommitment','claimAuthority','originalActorIdentitySHA256','signedTermsSHA256','authorizationJobSHA256','walletCheckpoint','signerCheckpoint','head','mutationEpoch','nativeJournalSHA256','actor','proof','work','registryPending','broadcastStarted','effectPermission'];
function checkBase(review,row){
 need(exact(review,baseKeys)&&review.version===1&&review.profile==='ORIGINAL_WRAPPED_WITHDRAWAL_PROOF_RESUME_REVIEW_V1'&&review.action==='RESUME_ORIGINAL_WITHDRAWAL_WITHOUT_RESIGNING');
 need(review.requestId===row.requestId&&review.role===row.role&&review.signedTermsSHA256===row.termsSHA256&&review.noteCommitment===row.terms.noteCommitment&&review.amount===row.terms.amount&&review.recipient==='0x'+row.terms.recipient&&review.pool===row.terms.pool&&review.assetId===row.terms.assetId);
 need(review.registryCommitment===row.terms.registryCommitment&&review.claimAuthority===row.terms.claimAuthority&&review.originalActorIdentitySHA256===row.terms.actor.identitySHA256&&uint(review.mutationEpoch,256));
 need(review.effectPermission===false&&review.registryPending===false&&review.broadcastStarted===false);
 for(const key of ['canonicalNullifier','authorizationJobSHA256','nativeJournalSHA256','signedTermsSHA256','registryCommitment','originalActorIdentitySHA256'])need(h(review[key]));
 need(exact(review.walletCheckpoint,['revision','commitment'])&&Number.isSafeInteger(review.walletCheckpoint.revision)&&review.walletCheckpoint.revision>=0&&h(review.walletCheckpoint.commitment));
 need(exact(review.signerCheckpoint,['revision','stateSHA256'])&&Number.isSafeInteger(review.signerCheckpoint.revision)&&review.signerCheckpoint.revision>=0&&h(review.signerCheckpoint.stateSHA256));
 need(exact(review.head,['number','hash','timestamp'])&&h(review.head.hash)&&uint(review.head.number,64)&&uint(review.head.timestamp,64)&&BigInt(review.head.timestamp)/600n===BigInt(row.terms.epoch));
 const actorKeys=review.role==='change'?['kind','processIdentitySHA256','generation']:['kind','processIdentitySHA256','generation','pid','lifetimeIdentity'];need(exact(review.actor,actorKeys)&&h(review.actor.processIdentitySHA256)&&Number.isSafeInteger(review.actor.generation)&&review.actor.generation>0);
 need(review.actor.kind===(review.role==='change'?'CURRENT_ORIGINAL_WRAPPED_OWNER':'CURRENT_ORIGINAL_WRAPPED_RECIPIENT'));if(review.role==='recipient')need(Number.isSafeInteger(review.actor.pid)&&review.actor.pid>0&&review.actor.pid<=2147483647&&h(review.actor.lifetimeIdentity));
 need(exact(review.proof,['retained','proofSHA256','calldataSHA256'])&&typeof review.proof.retained==='boolean');need(review.proof.retained?h(review.proof.proofSHA256)&&h(review.proof.calldataSHA256):review.proof.proofSHA256===null&&review.proof.calldataSHA256===null);
 need(review.work===(review.proof.retained?'BROADCAST_EXACT_RETAINED_PROOF':'REBUILD_EXACT_RETAINED_JOB_AND_BROADCAST'));
}
export function createWrappedResumeBrowser({origin,listenerId,fetchImpl,onChanged}){
 const descriptor=handoffDescriptor({origin,listenerId}),used=new Set(),proposals=new Map();let parent=null,review=null,grant=null,busy=false,closed=false,outcome=null,needsRefresh=false;
 const rowFor=id=>parent?.data?.wrappedWithdrawals?.snapshot?.operations?.find(row=>row.requestId===id);
 const context=row=>({requestId:row.requestId,role:row.role,termsSHA256:row.termsSHA256,state:row.state,resumeSHA256:row.resume?.resumeSHA256??null,checkpoint:row.resume?.walletCheckpoint??null});
 const fresh=()=>!closed&&!busy&&!needsRefresh&&parent&&parent.data?.connection==='CONNECTED'&&parent.data?.wrappedWithdrawals?.snapshot?.resumeActions?.manualReview===true&&!parent.stale&&!parent.reading&&!parent.sending&&!parent.data?.errors?.wrappedWithdrawals&&parent.data?.wrappedWithdrawals?.snapshot?.phase==='READY'&&parent.data.wrappedWithdrawals.snapshot.storageAvailable===true&&parent.data.wrappedWithdrawals.snapshot.busy===false&&parent.data.wrappedWithdrawals.snapshot.queued===0;
 const released=()=>parent?.data?.wrappedWithdrawals?.snapshot?.resumeActions?.continuationReleased===true;
 function choices(row){if(!fresh())return [];const list=[];
  if(row.state==='LOCAL_PROOF_READY')list.push('wrappedWithdrawResumeReview');
  if(['RESUME_ADMITTED','RESUME_PROOF_INTERRUPTED'].includes(row.state)&&row.resume?.consumed===true&&row.resume.broadcastArmed===false){list.push('wrappedWithdrawSuccessorReview');list.push('wrappedWithdrawResumeContinue');}
  const p=proposals.get(row.requestId);if(p&&sameHandoff(p.context,context(row)))list.push(p.action==='wrappedWithdrawSuccessorReview'?'wrappedWithdrawSuccessorAdmit':'wrappedWithdrawResumeAdmit');return list;
 }
 const reviewCurrent=()=>{const row=review&&rowFor(review.body.requestId);return Boolean(row&&choices(row).includes(review.action)&&(review.action.endsWith('Review')||released())&&sameHandoff(context(row),review.context));};
 const notify=()=>onChanged?.();
 const api={
  observe(value){if(parent?.revision!==value.revision){review=null;grant=null;proposals.clear();needsRefresh=false;}parent=value;},
  choices(id){const row=rowFor(id);return row?choices(row).map(action=>({action,title:WRAPPED_RESUME_ACTIONS[action].title,enabled:action.endsWith('Review')||released()})):[];},
  select(action,id){const row=rowFor(id);need(row&&choices(row).includes(action)&&(action.endsWith('Review')||released()));let body={requestId:id},serverReview=null;
   if(action.endsWith('Admit')){const p=proposals.get(id);need(p);body.resumeSHA256=p.value.resumeSHA256;serverReview=p.value.review;}
   if(action.endsWith('Continue')){need(row.resume);body.resumeSHA256=row.resume.resumeSHA256;serverReview=row.resume.successorReview??row.resume.review;}
   review=handoffData({version:1,profile:'WRAPPED_ORIGINAL_RESUME_BROWSER_REVIEW_V1',...descriptor,reviewId:globalThis.crypto.randomUUID(),revision:parent.revision,action,body,context:context(row),terms:row.terms,serverReview});grant=null;outcome=null;notify();return review;},
  getReview:()=>review?structuredClone(review):null,
  acceptAccess(input){try{need(fresh()&&review&&!grant&&reviewCurrent());const value=handoffData(input);need(exact(value,['review','access'])&&sameHandoff(value.review,review)&&exact(value.access,['origin','token'])&&value.access.origin===origin&&h(value.access.token)&&!used.has(value.access.token)&&sameHandoff(context(rowFor(review.body.requestId)),review.context));grant=value.access.token;notify();return true;}catch{return false;}},
  cancel(){if(!busy){review=null;grant=null;notify();}},
  canConfirm:()=>Boolean(fresh()&&review&&grant&&reviewCurrent()),
  getState:()=>({review:review?structuredClone(review):null,busy,grantReady:Boolean(grant),outcome:outcome?structuredClone(outcome):null}),
  async confirm(consent){need(consent===true&&api.canConfirm());const request=review,row=structuredClone(rowFor(request.body.requestId));need(sameHandoff(context(row),request.context));const token=grant;used.add(token);grant=null;review=null;busy=true;notify();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
   try{const response=await fetchImpl(WRAPPED_RESUME_ACTIONS[request.action].route,{method:'POST',headers:{'x-wallet-action-token':token,'Content-Type':'application/json'},body:JSON.stringify(request.body),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});const text=await response.text();need(text.length<=24000);const value=handoffData(JSON.parse(text));need(response.ok);
    if(request.action.endsWith('Review')){need(exact(value,['review','resumeSHA256','effectPermission'])&&value.effectPermission===false&&h(value.resumeSHA256));
     if(request.action==='wrappedWithdrawSuccessorReview'){need(exact(value.review,['version','profile','predecessorAdmissionSHA256','ordinal','originalReview','effectPermission'])&&value.review.version===1&&value.review.profile==='WRAPPED_ORIGINAL_RESUME_SUCCESSOR_REVIEW_V1'&&h(value.review.predecessorAdmissionSHA256)&&Number.isSafeInteger(value.review.ordinal)&&value.review.ordinal>0&&value.review.ordinal<=32&&value.review.effectPermission===false);checkBase(value.review.originalReview,row);}else checkBase(value.review,row);
     need(await digest(value.review)===value.resumeSHA256);need(!closed&&parent.revision===request.revision&&sameHandoff(context(rowFor(request.body.requestId)),request.context));proposals.set(request.body.requestId,{action:request.action,context:request.context,value});
    }else if(request.action.endsWith('Admit')){need(exact(value,['requestId','state','resumeSHA256','effectPermission'])&&value.requestId===request.body.requestId&&value.state==='RESUME_ADMITTED'&&value.resumeSHA256===request.body.resumeSHA256&&value.effectPermission===false);needsRefresh=true;}
    else{need(exact(value,['requestId','state'])&&value.requestId===request.body.requestId&&value.state==='CONFIRMED');needsRefresh=true;}
    outcome={status:'OBSERVED',action:request.action,requestId:request.body.requestId};
   }catch{outcome={status:'UNKNOWN',action:request.action,requestId:request.body.requestId};needsRefresh=true;}finally{clearTimeout(timer);busy=false;notify();}return structuredClone(outcome);
  },
  disconnect(){closed=true;grant=null;review=null;proposals.clear();}
 };return Object.freeze(api);
}
