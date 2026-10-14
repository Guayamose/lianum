/** Lossless private DATA only. A delta is usable solely with its exact previous
 * event of the same type from the authenticated ROOT/route chain. Reconstructed
 * data never receives an SDK brand, approval or fresh observation. */
export const PAGED_GRAPH_EVENT_DATA_LIMITS_V3=Object.freeze({bytes:2*1024*1024,nodes:300000,depth:32,chunkBytes:4096});
const limits=PAGED_GRAPH_EVENT_DATA_LIMITS_V3,profile='DEVICE_PAGED_GRAPH_EVENT_DELTA_V3',alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const need=(v,code='MOBILE_PAGED_GRAPH_EVENT_DATA')=>{if(!v)throw Error(code);};
const bytes=value=>new TextEncoder().encode(JSON.stringify(value));
function measure(value){let n=0;const active=new WeakSet();const visit=(v,depth)=>{need(++n<=limits.nodes&&depth<=limits.depth);if(v===null||typeof v==='boolean'||typeof v==='string'||Number.isSafeInteger(v)&&v>=0&&!Object.is(v,-0))return;need(v&&typeof v==='object'&&!active.has(v));active.add(v);try{need(Object.getPrototypeOf(v)===(Array.isArray(v)?Array.prototype:Object.prototype));const d=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(d);if(Array.isArray(v)){need(keys.length===v.length+1);for(let i=0;i<v.length;i++)need(Object.hasOwn(d,String(i))&&d[String(i)].enumerable&&Object.hasOwn(d[String(i)],'value'));}for(const k of keys){need(typeof k==='string');if(Array.isArray(v)&&k==='length')continue;need(d[k].enumerable&&Object.hasOwn(d[k],'value'));visit(d[k].value,depth+1);}}finally{active.delete(v);}};visit(value,0);const encoded=bytes(value);try{need(encoded.length>0&&encoded.length<=limits.bytes);return encoded.length;}finally{encoded.fill(0);}}
const digest=(value,hash)=>{const encoded=bytes(value);try{return hash(encoded);}finally{encoded.fill(0);}};
function delta(value,base){
 if(value===base)return[0];
 if(value===null||typeof value!=='object')return[1,value];
 if(Array.isArray(value)){
  const compatible=Array.isArray(base),parts=value.map((v,i)=>delta(v,compatible?base[i]:undefined));
  return compatible&&value.length===base.length&&parts.every(p=>p[0]===0)?[0]:[3,parts];
 }
 const keys=Object.keys(value),compatible=base!==null&&typeof base==='object'&&!Array.isArray(base),parts=keys.map(k=>[k,delta(value[k],compatible?base[k]:undefined)]);
 return compatible&&keys.length===Object.keys(base).length&&keys.every((k,i)=>Object.keys(base)[i]===k)&&parts.every(p=>p[1][0]===0)?[0]:[2,parts];
}
function expand(tree,base,work,depth=0){
 need(++work.nodes<=limits.nodes*3&&depth<=limits.depth&&Array.isArray(tree)&&tree.length>0);
 const kind=tree[0];if(kind===0){need(tree.length===1&&base!==undefined);return base;}
 need(tree.length===2);if(kind===1){need(tree[1]===null||typeof tree[1]!=='object');return tree[1];}
 need(Array.isArray(tree[1]));if(kind===3)return tree[1].map((p,i)=>expand(p,Array.isArray(base)?base[i]:undefined,work,depth+1));
 need(kind===2);const out={},seen=new Set();for(const row of tree[1]){need(Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&!seen.has(row[0]));seen.add(row[0]);Object.defineProperty(out,row[0],{value:expand(row[1],base&&typeof base==='object'&&!Array.isArray(base)&&Object.hasOwn(base,row[0])?base[row[0]]:undefined,work,depth+1),enumerable:true,writable:true,configurable:true});}return out;
}
/** Interning keeps identical historical jobs shared in the private projection;
 * structuredClone of the whole projection preserves those aliases, and wiping
 * its events clears the entire shared graph when the custodian closes it. */
export function internPagedGraphEventDataV3(event,previous){measure(event);if(previous===null||previous===undefined)return event;measure(previous);return expand(delta(event,previous),previous,{nodes:0});}
export function packPagedGraphEventDataV3(event,previous,hash){
 need(arguments.length===3&&typeof hash==='function');measure(event);if(previous===null||previous===undefined||previous.type!==event.type)return event;
 measure(previous);const packed={profile,type:event.type,baseSHA256:digest(previous,hash),eventSHA256:digest(event,hash),delta:delta(event,previous)},encoded=bytes(packed),plain=bytes(event);
 try{if(encoded.length>=plain.length||encoded.length>limits.bytes)return event;return packed;}finally{encoded.fill(0);plain.fill(0);}
}
export function expandPagedGraphEventDataV3(value,previous,hash){
 need(arguments.length===3&&typeof hash==='function');if(value?.profile!==profile)return internPagedGraphEventDataV3(value,previous);
 need(Object.keys(value).sort().join(',')==='baseSHA256,delta,eventSHA256,profile,type'&&previous&&previous.type===value.type,'MOBILE_PAGED_GRAPH_EVENT_BASE');
 need(digest(previous,hash)===value.baseSHA256,'MOBILE_PAGED_GRAPH_EVENT_BASE');const event=expand(value.delta,previous,{nodes:0});measure(event);need(event.type===value.type&&digest(event,hash)===value.eventSHA256,'MOBILE_PAGED_GRAPH_EVENT_DIGEST');return event;
}
export function encodePagedGraphEventChunkV3(value){need(value instanceof Uint8Array&&value.length>0&&value.length<=limits.chunkBytes);let out='';for(let i=0;i<value.length;i+=3){const a=value[i],b=value[i+1],c=value[i+2];out+=alphabet[a>>>2]+alphabet[((a&3)<<4)|((b??0)>>>4)]+(i+1<value.length?alphabet[((b&15)<<2)|((c??0)>>>6)]:'=')+(i+2<value.length?alphabet[c&63]:'=');}return out;}
export function decodePagedGraphEventChunkV3(value){need(typeof value==='string'&&value.length>0&&value.length<=4*Math.ceil(limits.chunkBytes/3)&&value.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.exec(value)?.[0]===value);const pad=value.endsWith('==')?2:value.endsWith('=')?1:0,length=value.length/4*3-pad;need(length>0&&length<=limits.chunkBytes);const out=new Uint8Array(length);let at=0;for(let i=0;i<value.length;i+=4){const v=(alphabet.indexOf(value[i])<<18)|(alphabet.indexOf(value[i+1])<<12)|((value[i+2]==='='?0:alphabet.indexOf(value[i+2]))<<6)|(value[i+3]==='='?0:alphabet.indexOf(value[i+3]));out[at++]=v>>>16;if(at<length)out[at++]=v>>>8;if(at<length)out[at++]=v;}try{need(encodePagedGraphEventChunkV3(out)===value);return out;}catch(error){out.fill(0);throw error;}}
/** Conservative retained DATA estimate, not a measured JavaScript heap peak.
 * Count shared objects once and UTF-16 string storage plus object/property
 * overhead. Stop immediately at the caller's unchanged cache byte budget. */
export function measurePagedGraphProjectionDataV3(value,maximum){
 need(Number.isSafeInteger(maximum)&&maximum>0);const seen=new WeakSet(),todo=[value];let total=0,nodes=0;
 while(todo.length){const v=todo.pop();if(++nodes>1000000)return maximum+1;if(typeof v==='string')total+=32+v.length*2;else if(v===null||typeof v!=='object')total+=8;else if(!seen.has(v)){seen.add(v);total+=64;for(const k of Object.keys(v)){total+=16+k.length*2;todo.push(v[k]);}}if(total>maximum)return maximum+1;}return total;
}
/** A bounded, per-custodian reconstruction pass shares identical small DATA
 * across event types too (prepared page, command, retained opening). Dictionary
 * memory is finite; it is discarded after this pass and emits no authority. */
export function createPagedGraphHistoryDataInternerV3(hash){
 need(typeof hash==='function');let memo=new WeakMap(),dictionary=new Map(),dictionaryBytes=0,closed=false,nodes=0;
 const copy=(v,depth)=>{
  need(!closed&&++nodes<=1000000&&depth<=limits.depth);if(v===null||typeof v!=='object')return v;if(memo.has(v))return memo.get(v);
  const out=Array.isArray(v)?[]:{};memo.set(v,out);for(const k of Object.keys(v))Object.defineProperty(out,k,{value:copy(v[k],depth+1),enumerable:true,writable:true,configurable:true});
  const serialized=JSON.stringify(out);if(serialized.length<=8192){const encoded=new TextEncoder().encode(serialized);let key;try{key=hash(encoded);}finally{encoded.fill(0);}const prior=dictionary.get(key);if(prior&&prior.serialized===serialized){memo.set(v,prior.value);return prior.value;}
   const cost=64+serialized.length*2+key.length*2;if(dictionaryBytes+cost<=4*1024*1024){dictionary.set(key,{serialized,value:out});dictionaryBytes+=cost;}}
  return out;
 };
 return Object.freeze({get retainedBytes(){return dictionaryBytes;},copy(value){need(!closed);nodes=0;return copy(value,0);},clear(){closed=true;memo=new WeakMap();dictionary.clear();dictionaryBytes=0;}});
}
export function internPagedGraphHistoryDataV3(events,hash){need(Array.isArray(events)&&events.length<=16384);const interner=createPagedGraphHistoryDataInternerV3(hash);try{return events.map(value=>interner.copy(value));}finally{interner.clear();}}
