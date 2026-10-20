import {DEVICE_OPERATION_REQUEST_MS_V41} from '@lianum/mobile-protocol/device/paged-owner-v3';
import {awaitDevicePagedIssuedTimeV3} from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as Note from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
/** Original device-source U/S + GRAPH TLS frames. Handles are minted only by
 * this fixed transport. Copies, expired quotes and closed sessions are denied. */
import * as Crypto from 'expo-crypto';
import * as P from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {normalizeExternalFlatDescriptorV1,externalFlatExactV1,externalFlatPermissionMessageV1,validateExternalFlatFreshV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {sha256} from '@noble/hashes/sha2.js';
const rows=new WeakMap(),quotes=new WeakMap(),preparations=new WeakMap(),statuses=new WeakMap(),outputQuotes=new WeakMap(),outputRows=new WeakMap(),reviews=new WeakMap(),outputReviews=new WeakMap();
const fail=()=>{throw Error('MOBILE_EXTERNAL_GRAPH_RESPONSE_REJECTED');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function snapshot(raw) {
  let nodes = 0, size = 0;
  function copy(value, depth) {
    if (++nodes > 4096 || depth > 16) fail();
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) fail(); return value; }
    if (typeof value === 'string') { size += value.length; if (size > 65536) fail(); return value; }
    if (!value || typeof value !== 'object') fail();
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) fail();
    const out = array ? [] : {};
    for (const name of Reflect.ownKeys(value)) {
      if (array && name === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(value, name);
      if (typeof name !== 'string' || !d?.enumerable || !Object.hasOwn(d, 'value')) fail();
      Object.defineProperty(out, name, { value: copy(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    if (array && (out.length !== value.length || Reflect.ownKeys(value).length !== value.length + 1)) fail();
    return out;
  }
  return copy(raw, 0);
}
async function digest(bytes) {
  const owned = new Uint8Array(bytes.length); owned.set(bytes);
  try { return Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned)), b => b.toString(16).padStart(2, '0')).join(''); }
  finally { owned.fill(0); }
}
function freshStatus(value) {
  const now = Date.now();
  if (!Number.isSafeInteger(value.observedAt) || !Number.isSafeInteger(value.expiresAt)
    || value.observedAt > now || ![15000,120000].includes(value.expiresAt-value.observedAt) || value.expiresAt <= now) fail();
}

export function createDeviceExternalFlatGraphApiV1({descriptor,fetchImpl=globalThis.fetch}={}){
 const original=normalizeExternalFlatDescriptorV1(descriptor);if(original.profile!=='LIANUM_DEVICE_EXTERNAL_FLAT_SOURCE_NOTE_V1'||typeof fetchImpl!=='function')fail();
 let closed=false;const accesses=new WeakMap(),consents=new WeakMap(),outputConsents=new WeakMap(),controllers=new Set();
 function live(){if(closed)fail();}
 function accessScope(v){live();validateExternalFlatFreshV1(v);for(const k of ['origin','pairingId','devicePublicKey'])if(v[k]!==original[k])fail();}
 function consentScope(v,fresh=true){live();if(!same(v.descriptor,original))fail();if(fresh)P.validateExternalFlatGraphFreshV1(v);}
  async function post(path, payload, proofResponse = false) {
    live(); const target = original.origin + '/v1/mobile/external-flat/source-graph/' + path;
    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).byteLength > 65536) fail();
    const controller = new AbortController(); controllers.add(controller);
    let timer, reader, bytes;
    const stop = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(Error('MOBILE_EXTERNAL_FLAT_REQUEST_CLOSED')), { once: true });
    });
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(Error('MOBILE_EXTERNAL_FLAT_REQUEST_TIMEOUT'));
    }, proofResponse ? DEVICE_OPERATION_REQUEST_MS_V41 : DEVICE_OPERATION_REQUEST_MS_V41); });
    const work = (async () => {
      const response = await fetchImpl(target, { method: 'POST', headers: { Accept: 'application/json', Origin: original.origin,
        'Content-Type': 'application/json' }, body, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
      live();
      if (controller.signal.aborted || !response.ok || response.redirected || response.url && response.url !== target
        || /^application\/json(?:;\s*charset=utf-8)?$/i.exec(response.headers.get('content-type') ?? '')?.[0] !== response.headers.get('content-type')) fail();
      const length = response.headers.get('content-length');
      if (length !== null && (/^(0|[1-9][0-9]{0,5})$/.exec(length)?.[0] !== length || Number(length) > 65536)) fail();
      if (!response.body || typeof response.body.getReader !== 'function') fail();
      reader = response.body.getReader(); bytes = new Uint8Array(65536); let used = 0;
      try {
        for (;;) {
          const part = await reader.read(); live(); if (controller.signal.aborted) fail();
          if (part.done) break;
          if (!(part.value instanceof Uint8Array) || used + part.value.byteLength > bytes.length) fail();
          bytes.set(part.value, used); used += part.value.byteLength;
        }
        if (length !== null && used !== Number(length)) fail();
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used)));
      } finally { bytes.fill(0); }
    })();
    try { return await Promise.race([work, stop, timeout]); }
    finally {
      clearTimeout(timer); controller.abort(); controllers.delete(controller);
      if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch {} }
    }
  }

 function row(raw,consent=null,status=null){live();const v=P.normalizeExternalFlatGraphRowV1(raw);if(!same(v.descriptor,original))fail();
  if(consent){const c=consent.draft,r=v.reservation.consentFields;for(const k of ['depositJobId','quoteId','jobId','custody','statement','witnessSHA256'])if(!same(c[k],r[k]))fail();
   if(consent.draft.action!=='PROVE_U')for(const k of ['proofSHA256','publicInputsSHA256'])if(c[k]!==r[k])fail();
   const frame=P.externalFlatGraphPermissionMessageV1(consent);try{if(Array.from(sha256(frame),x=>x.toString(16).padStart(2,'0')).join('')!==v.reservation.authorizationSHA256)fail();}finally{frame.fill(0);}}
  const observed=v.reservation.observation;if(observed!==null){if(observed.domainCommitment!==original.poolTerms.domainCommitment||observed.changePath.root!==observed.reservePath.root||observed.changePath.index===observed.reservePath.index||BigInt(observed.blockNumber)>BigInt(observed.currentHead.blockNumber)||BigInt(observed.timestamp)>BigInt(observed.currentHead.timestamp))fail();
   if(observed.blockNumber===observed.currentHead.blockNumber&&observed.blockHash!==observed.currentHead.blockHash)fail();
   if(consent&&(BigInt(observed.currentHead.blockNumber)<BigInt(consent.observed.blockNumber)||BigInt(observed.currentHead.timestamp)<BigInt(consent.observed.timestamp)||observed.currentHead.blockNumber===consent.observed.blockNumber&&observed.currentHead.blockHash!==consent.observed.blockHash))fail();
   for(const path of [observed.changePath,observed.reservePath]){let root=path.leaf,index=path.index;for(const sibling of path.siblings){const frame=new Uint8Array(65);frame[0]=1;frame.set(Uint8Array.from((index&1?sibling+root:root+sibling).match(/../g),p=>parseInt(p,16)),1);try{root=Array.from(sha256(frame),x=>x.toString(16).padStart(2,'0')).join('');}finally{frame.fill(0);}index>>=1;}if(root!==path.root)fail();}}
  rows.set(v,{live,descriptor:original,status});return v;
 }
 function outputScope(c,fresh=true){live();if(!same(c.consent.descriptor,original))fail();if(fresh)P.validateExternalFlatGraphOutputFreshV1(c);}
 function verifyOutputPath(path){let root=path.leaf,index=path.index;for(const sibling of path.siblings){const frame=new Uint8Array(65);frame[0]=1;frame.set(Uint8Array.from((index&1?sibling+root:root+sibling).match(/../g),p=>parseInt(p,16)),1);try{root=Array.from(sha256(frame),x=>x.toString(16).padStart(2,'0')).join('');}finally{frame.fill(0);}index>>=1;}if(root!==path.root)fail();}
 function outputRow(raw,consent=null,status=null){live();const packet=Object.getOwnPropertyDescriptor(raw??{},'profile')?.value===P.DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_READ_V2?P.normalizeExternalFlatGraphOutputReadV2(raw):null,v=packet?packet.result:P.normalizeExternalFlatGraphOutputRowV1(raw),r=v.row,c=r.consentFields;if(!same(r.descriptor,original))fail();verifyOutputPath(c.path);if(consent){if(consent.noteRole!==v.noteRole)fail();for(const k of ['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'])if(!same(c[k],consent.consent[k]))fail();if(consent.consent.action!=='PROVE_W39')for(const k of ['proofSHA256','publicInputsSHA256'])if(c[k]!==consent.consent[k])fail();}
 if(r.observation!==null){const freshRead=packet?.observed??r.observation.observed;if(BigInt(freshRead.timestamp)<BigInt(consent?.consent.observed.timestamp??'0')||BigInt(freshRead.blockNumber)<BigInt(consent?.consent.observed.blockNumber??'0'))fail();const admitted=consent?.consent.observed;if(admitted&&freshRead.blockNumber===admitted.blockNumber&&freshRead.blockHash!==admitted.blockHash)fail();}outputRows.set(v,{live,descriptor:original,status});return v;}
 return Object.freeze({descriptor:original,
  async challenge(){if(arguments.length!==0)fail();const v=P.normalizeExternalFlatAccessV1(await post('challenges',{}));await awaitDevicePagedIssuedTimeV3(v.issuedAt??v.expiresAt-15000);accessScope(v);accesses.set(v,{used:false});return v;},
  async preparation(access,signature,rawTerms){if(arguments.length!==3)fail();const e=accesses.get(access);if(!e||e.used)fail();accessScope(access);signature=P.normalizeExternalFlatSignatureV1(signature);
   const terms=externalFlatExactV1(snapshot(rawTerms),['depositJobId','rootId','assetAmount','shareAmount','payoutAmount','validFrom','settleBefore']);e.used=true;
   const parsed=await post('preparations',{access,signature,...terms});live();if(parsed?.profile===P.DEVICE_EXTERNAL_FLAT_GRAPH_PREPARATION_V1){const v=P.normalizeExternalFlatGraphPreparationV1(parsed);if(!same(v.descriptor,original)||!same(v.terms,terms))fail();freshStatus(v);preparations.set(v,{live,descriptor:original});return v;}const v=P.normalizeExternalFlatGraphQuoteV1(parsed);if(!same(v.descriptor,original)||v.quote.depositJobId!==terms.depositJobId||v.quote.rootId!==terms.rootId)fail();
   if(v.quote.proposal.budget!==terms.payoutAmount||v.quote.proposal.settleBefore!==terms.settleBefore||v.quote.proposal.fundingNotBefore!==terms.validFrom)fail();freshQuote(v);quotes.set(v,{live,descriptor:original});return v;},
  async review(access,signature,rawDraft){if(arguments.length!==3)fail();const e=accesses.get(access);if(!e||e.used)fail();accessScope(access);signature=P.normalizeExternalFlatSignatureV1(signature);const draft=P.normalizeExternalFlatGraphDraftV1(snapshot(rawDraft));e.used=true;
   const v=P.normalizeExternalFlatGraphConsentV1(await post('reviews',{access,signature,draft}));await awaitDevicePagedIssuedTimeV3(v.issuedAt??v.expiresAt-15000);consentScope(v);if(!same(v.draft,draft))fail();if(v.privateProof){const t=P.externalFlatGraphPrivateTranscriptBytesV2(v);try{if(await digest(t)!==v.privateProof.transcriptSHA256)fail();}finally{t.fill(0);}consentScope(v);}const entry={used:false,submitInvoked:false};consents.set(v,entry);reviews.set(v,{live,consentScope,entry});return v;},
  async submit(consent,signature,rawWitness=null){const e=consents.get(consent);if(e)e.submitInvoked=true;if(arguments.length!==3)fail();if(!e||e.used)fail();consentScope(consent);signature=P.normalizeExternalFlatSignatureV1(signature);let witness=null,bytes;
   try{if(consent.draft.action==='PROVE_U'){witness=P.normalizeDeviceReservationWitnessV1(rawWitness);bytes=P.deviceReservationWitnessBytesV1(witness);if(await digest(bytes)!==consent.draft.witnessSHA256)fail();}else if(rawWitness!==null)fail();
    consentScope(consent);let path='operations';if(consent.privateProof){const {sealOriginalDeviceAuthorizationWitnessV2}=await import('./device-private-graph-proof-transit-v2.mjs');consentScope(consent);const sealed=await sealOriginalDeviceAuthorizationWitnessV2(consent,signature,witness);P.wipeDeviceReservationWitnessV1(witness);witness=sealed;path='private-operations';}consentScope(consent);e.used=true;const v=await post(path,{consent,signature,witness},['PROVE_U','RESERVE_S','EXECUTE_GRAPH','RECOVER_GRAPH'].includes(consent.draft.action));live();return row(v,consent);
   }finally{bytes?.fill(0);P.wipeDeviceReservationWitnessV1(witness);}},
  async outputQuote(access,signature,rawInput){if(arguments.length!==3)fail();const e=accesses.get(access);if(!e||e.used)fail();accessScope(access);signature=P.normalizeExternalFlatSignatureV1(signature);const input=externalFlatExactV1(snapshot(rawInput),['noteRole','recipient']);if(!['change','recovery'].includes(input.noteRole))fail();Note.externalFlatHexV1(input.recipient,40);e.used=true;const c=P.normalizeExternalFlatGraphOutputConsentV1(await post('output-quotes',{access,signature,input}));await awaitDevicePagedIssuedTimeV3(c.consent.issuedAt??c.consent.expiresAt-15000);outputScope(c);if(c.noteRole!==input.noteRole||c.consent.recipient!==input.recipient||c.consent.action!=='QUOTE_W39')fail();verifyOutputPath(c.consent.path);outputQuotes.set(c,{live,descriptor:original});return c;},
  async outputReview(access,signature,rawDraft){if(arguments.length!==3)fail();const e=accesses.get(access);if(!e||e.used)fail();accessScope(access);signature=P.normalizeExternalFlatSignatureV1(signature);const draft=P.normalizeExternalFlatGraphOutputDraftV1(snapshot(rawDraft));e.used=true;const c=P.normalizeExternalFlatGraphOutputConsentV1(await post('output-reviews',{access,signature,draft}));await awaitDevicePagedIssuedTimeV3(c.consent.issuedAt??c.consent.expiresAt-15000);outputScope(c);if(c.noteRole!==draft.noteRole)fail();for(const k of Object.keys(draft.draft))if(!same(c.consent[k],draft.draft[k]))fail();verifyOutputPath(c.consent.path);if(c.consent.privateProof){if(await digest(Note.externalFlatPrivateWalletTranscriptBytesV3(c.consent))!==c.consent.privateProof.transcriptSHA256)fail();outputScope(c);}const entry={used:false,submitInvoked:false};outputConsents.set(c,entry);outputReviews.set(c,{live,outputScope,entry});return c;},
  async outputSubmit(consent,signature,rawWitness=null){const e=outputConsents.get(consent);if(e)e.submitInvoked=true;if(arguments.length!==3)fail();if(!e||e.used)fail();outputScope(consent);signature=P.normalizeExternalFlatSignatureV1(signature);let witness=null,bytes;try{if(consent.consent.action==='PROVE_W39'){witness=Note.externalFlatWitnessV1('withdraw_balance',rawWitness);bytes=Note.externalFlatWitnessBytesV1('withdraw_balance',witness);if(await digest(bytes)!==consent.consent.witnessSHA256)fail();}else if(rawWitness!==null)fail();let wire=witness;if(consent.consent.privateProof){const{sealOriginalDeviceGraphOutputWitnessV3}=await import('./device-private-proof-transit-v2.mjs');outputScope(consent);wire=await sealOriginalDeviceGraphOutputWitnessV3(consent,signature,witness);}outputScope(consent);e.used=true;return outputRow(await post(consent.consent.privateProof?'private-output-operations':'output-operations',{consent,signature,witness:wire},['PROVE_W39','WITHDRAW_W39'].includes(consent.consent.action)),consent);}finally{bytes?.fill(0);Note.externalFlatWipeV1(witness);}},
  async status(access,signature){if(arguments.length!==2)fail();const e=accesses.get(access);if(!e||e.used)fail();accessScope(access);signature=P.normalizeExternalFlatSignatureV1(signature);e.used=true;
   const parsed=P.normalizeExternalFlatGraphStatusV1(await post('status',{access,signature}));live();if(!same(parsed.descriptor,original))fail();freshStatus(parsed);const v=Object.freeze({...parsed,jobs:Object.freeze(parsed.jobs.map(r=>row(r,null,parsed))),withdrawals:Object.freeze(parsed.withdrawals.map(r=>outputRow(r,null,parsed)))});statuses.set(v,{live,descriptor:original});return v;},
  close(){if(arguments.length!==0)fail();closed=true;for(const c of controllers)c.abort();return{closed:true};}
 });
}
function freshQuote(v){const now=Date.now();if(!Number.isSafeInteger(now)||v.quote.expiresAt<=now||(v.quote.issuedAt===undefined?v.quote.expiresAt>now+15000:v.quote.issuedAt>now||v.quote.expiresAt-v.quote.issuedAt>DEVICE_OPERATION_REQUEST_MS_V41))fail();}
export function readDeviceExternalFlatGraphQuoteV1(v){const r=quotes.get(v);if(!r)fail();r.live();freshQuote(v);return v;}
export function readDeviceExternalFlatGraphRowV1(v){const r=rows.get(v);if(!r)fail();r.live();if(r.status)freshStatus(r.status);return v;}
export function readDeviceExternalFlatGraphStatusV1(v){const r=statuses.get(v);if(!r)fail();r.live();freshStatus(v);return v;}

export function readDeviceExternalFlatGraphOutputQuoteV1(v){const r=outputQuotes.get(v);if(!r)fail();r.live();P.validateExternalFlatGraphOutputFreshV1(v);return v;}
export function readDeviceExternalFlatGraphOutputRowV1(v){const r=outputRows.get(v);if(!r)fail();r.live();if(r.status)freshStatus(r.status);return v;}

export function readDeviceExternalFlatGraphPreparationV1(v){const r=preparations.get(v);if(!r)fail();r.live();freshStatus(v);return v;}

/** Original live review identity and its bounded signed permission. */
export function readDeviceExternalFlatGraphConsentV1(value){const original=reviews.get(value);if(!original||original.entry.used)fail();original.live();original.consentScope(value);return value;}
export function readDeviceExternalFlatGraphOutputConsentV1(value){const original=outputReviews.get(value);if(!original||original.entry.used)fail();original.live();original.outputScope(value);return value;}

/** Local non-submission evidence only; never a fresh signing permission. */
export function readDeviceExternalFlatGraphUnsubmittedConsentV1(value) {
 const original=reviews.get(value);if(!original||original.entry.used&&!original.entry.retired||original.entry.submitInvoked)fail();
 original.live();original.consentScope(value,false);return value;
}
export function readDeviceExternalFlatGraphOutputUnsubmittedConsentV1(value) {
 const original=outputReviews.get(value);if(!original||original.entry.used&&!original.entry.retired||original.entry.submitInvoked)fail();
 original.live();original.outputScope(value,false);return value;
}

export function retireDeviceExternalFlatGraphUnsubmittedConsentV1(value) {
 readDeviceExternalFlatGraphUnsubmittedConsentV1(value);const entry=reviews.get(value).entry;if(entry.retired)fail();entry.retired=true;entry.used=true;
}
export function retireDeviceExternalFlatGraphOutputUnsubmittedConsentV1(value) {
 readDeviceExternalFlatGraphOutputUnsubmittedConsentV1(value);const entry=outputReviews.get(value).entry;if(entry.retired)fail();entry.retired=true;entry.used=true;
}
