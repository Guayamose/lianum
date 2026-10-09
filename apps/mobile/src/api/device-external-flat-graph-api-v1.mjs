/** Original device-source U/S + GRAPH TLS frames. Handles are minted only by
 * this fixed transport. Copies, expired quotes and closed sessions are denied. */
import * as Crypto from 'expo-crypto';
import * as P from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {normalizeExternalFlatDescriptorV1,externalFlatExactV1,externalFlatPermissionMessageV1,validateExternalFlatFreshV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {sha256} from '@noble/hashes/sha2.js';
const rows=new WeakMap(),quotes=new WeakMap(),statuses=new WeakMap();
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
  try { return Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned.buffer)), b => b.toString(16).padStart(2, '0')).join(''); }
  finally { owned.fill(0); }
}
function freshStatus(value) {
  const now = Date.now();
  if (!Number.isSafeInteger(value.observedAt) || !Number.isSafeInteger(value.expiresAt)
    || value.observedAt > now || value.expiresAt !== value.observedAt + 15000 || value.expiresAt <= now) fail();
}

export function createDeviceExternalFlatGraphApiV1({descriptor,fetchImpl=globalThis.fetch}={}){
 const original=normalizeExternalFlatDescriptorV1(descriptor);if(original.profile!=='LIANUM_DEVICE_EXTERNAL_FLAT_SOURCE_NOTE_V1'||typeof fetchImpl!=='function')fail();
 let closed=false;const accesses=new WeakMap(),consents=new WeakMap(),controllers=new Set();
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
    }, proofResponse ? 900000 : 15000); });
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
 return Object.freeze({descriptor:original,
  async challenge(){if(arguments.length!==0)fail();const v=P.normalizeExternalFlatAccessV1(await post('challenges',{}));accessScope(v);accesses.set(v,{used:false});return v;},
  async preparation(access,signature,rawTerms){if(arguments.length!==3)fail();const e=accesses.get(access);if(!e||e.used)fail();accessScope(access);signature=P.normalizeExternalFlatSignatureV1(signature);
   const terms=externalFlatExactV1(snapshot(rawTerms),['depositJobId','rootId','assetAmount','shareAmount','payoutAmount','validFrom','settleBefore']);e.used=true;
   const v=P.normalizeExternalFlatGraphQuoteV1(await post('preparations',{access,signature,...terms}));live();if(!same(v.descriptor,original)||v.quote.depositJobId!==terms.depositJobId||v.quote.rootId!==terms.rootId)fail();
   if(v.quote.proposal.budget!==terms.payoutAmount||v.quote.proposal.settleBefore!==terms.settleBefore||v.quote.proposal.fundingNotBefore!==terms.validFrom)fail();freshQuote(v);quotes.set(v,{live,descriptor:original});return v;},
  async review(access,signature,rawDraft){if(arguments.length!==3)fail();const e=accesses.get(access);if(!e||e.used)fail();accessScope(access);signature=P.normalizeExternalFlatSignatureV1(signature);const draft=P.normalizeExternalFlatGraphDraftV1(snapshot(rawDraft));e.used=true;
   const v=P.normalizeExternalFlatGraphConsentV1(await post('reviews',{access,signature,draft}));consentScope(v);if(!same(v.draft,draft))fail();consents.set(v,{used:false});return v;},
  async submit(consent,signature,rawWitness=null){if(arguments.length!==3)fail();const e=consents.get(consent);if(!e||e.used)fail();consentScope(consent);signature=P.normalizeExternalFlatSignatureV1(signature);let witness=null,bytes;
   try{if(consent.draft.action==='PROVE_U'){witness=P.normalizeDeviceReservationWitnessV1(rawWitness);bytes=P.deviceReservationWitnessBytesV1(witness);if(await digest(bytes)!==consent.draft.witnessSHA256)fail();}else if(rawWitness!==null)fail();
    consentScope(consent);e.used=true;const v=await post('operations',{consent,signature,witness},['PROVE_U','RESERVE_S','EXECUTE_GRAPH','RECOVER_GRAPH'].includes(consent.draft.action));live();return row(v,consent);
   }finally{bytes?.fill(0);P.wipeDeviceReservationWitnessV1(witness);}},
  async status(access,signature){if(arguments.length!==2)fail();const e=accesses.get(access);if(!e||e.used)fail();accessScope(access);signature=P.normalizeExternalFlatSignatureV1(signature);e.used=true;
   const parsed=P.normalizeExternalFlatGraphStatusV1(await post('status',{access,signature}));live();if(!same(parsed.descriptor,original))fail();freshStatus(parsed);const v=Object.freeze({...parsed,jobs:Object.freeze(parsed.jobs.map(r=>row(r,null,parsed)))});statuses.set(v,{live,descriptor:original});return v;},
  close(){if(arguments.length!==0)fail();closed=true;for(const c of controllers)c.abort();return{closed:true};}
 });
}
function freshQuote(v){const now=Date.now();if(!Number.isSafeInteger(now)||v.quote.expiresAt<=now||v.quote.expiresAt>now+15000)fail();}
export function readDeviceExternalFlatGraphQuoteV1(v){const r=quotes.get(v);if(!r)fail();r.live();freshQuote(v);return v;}
export function readDeviceExternalFlatGraphRowV1(v){const r=rows.get(v);if(!r)fail();r.live();if(r.status)freshStatus(r.status);return v;}
export function readDeviceExternalFlatGraphStatusV1(v){const r=statuses.get(v);if(!r)fail();r.live();freshStatus(v);return v;}
