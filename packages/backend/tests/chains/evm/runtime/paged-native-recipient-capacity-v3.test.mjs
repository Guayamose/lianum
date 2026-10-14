/** Execute ORIGINAL recipient-registration bodies, with inert transport only.
 * These scopes produce route DATA, never a private runtime/key/signing grant. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PAGED_RUNTIME_CAPACITY_V3} from '../../../../src/chains/shared/runtime/paged-runtime-capacity-v3.mjs';
import {base58Encode,base58Decode} from '../../../../src/chains/solana/runtime/solana-base58.mjs';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function originalFunction(text,name){const marker='function '+name+'(',at=text.indexOf(marker);assert.ok(at>=0);const start=text.lastIndexOf('async ',at)===at-6?at-6:at,open=text.indexOf('{',at);let depth=0,quote=null;for(let i=open;i<text.length;i++){const c=text[i];if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote=null;continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return text.slice(start,i+1);}assert.fail('HOST original function not found');}
const need=(ok,code)=>assert.ok(ok,code),exact=(v,keys)=>assert.deepEqual(Object.keys(v).sort(),[...keys].sort());
const bind=(body,ports)=>Function(...Object.keys(ports),'return ('+body+')')(...Object.values(ports));

test('Original Bitcoin Paged registration keeps256 distinct destinations, reuses exact routes and rejects257 before RPC',async()=>{
 const text=source('../../../../src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs'),pagedRecipients=new Map(),recipients=['HOST-original-0','HOST-original-1'];let calls=0;
 const ports={need,custody:false,exactOptions:(v,keys)=>exact(v,keys),live(){},busy:false,observationBusy:false,inventoryBusy:false,recipients,pagedRecipients,graphRecipientLimit:PAGED_RUNTIME_CAPACITY_V3.recipients,async rpc(method,args){assert.equal(method,'validateaddress');calls++;return{isvalid:true,address:args[0],scriptPubKey:'0014'+createHash('sha256').update(args[0]).digest('hex').slice(0,40)};},p2wpkh:bind(originalFunction(text,'p2wpkh'),{need}),sourceScript:'0014'+'1'.repeat(40),changeScript:'0014'+'2'.repeat(40),source:'HOST-source',sourceWalletName:'HOST-source-wallet',changeAddress:'HOST-change',immutable:v=>Object.freeze(structuredClone(v))};
 const register=bind(originalFunction(text,'registerPagedRecipient'),ports),index=bind(originalFunction(text,'graphRecipientIndex'),ports);
 for(let i=0;i<256;i++){const input={recipient:'bcrt1'+String(i).padStart(40,'a')};assert.equal((await register(input)).recipientIndex,i+2);assert.equal(index(i+2),i+2);}
 assert.equal(pagedRecipients.size,256);assert.equal(calls,256);assert.equal((await register({recipient:'bcrt1'+String(255).padStart(40,'a')})).recipientIndex,257);assert.equal(calls,256);
 await assert.rejects(register({recipient:'bcrt1'+String(256).padStart(40,'a')}),/BITCOIN_GRAPH_RECIPIENT_CAPACITY/);assert.equal(calls,256);assert.throws(()=>index(258));
 const restored=new Map(JSON.parse(JSON.stringify([...pagedRecipients])));assert.deepEqual([...restored],[...pagedRecipients]);assert.equal(bind(originalFunction(text,'graphRecipientIndex'),{...ports,pagedRecipients:restored})(257),257);
 await assert.rejects(bind(originalFunction(text,'registerPagedRecipient'),{...ports,custody:true})({recipient:'bcrt1'+'a'.repeat(40)}),/BITCOIN_GRAPH_RECIPIENT_ONLY/);
});

test('Original Solana Paged registration retains256 Base58 destinations without widening custody routes',()=>{
 const text=source('../../../../src/chains/solana/runtime/owned-solana-runtime.mjs'),address=v=>base58Encode(createHash('sha256').update(v).digest()),pagedGraphRecipients=new Map(),viewRecipients=[address('default0'),address('default1')],graphSource={address:address('source')};let liveness=0;
 const ports={requireCondition:need,custody:false,exactRecord:exact,base58Encode,base58Decode,closed:false,shuttingDown:false,recoveryCapturing:false,busy:false,observationBusy:false,inventoryBusy:false,handle:{assertAlive(){liveness++;}},graphSource,viewRecipients,pagedGraphRecipients,graphRecipientLimit:PAGED_RUNTIME_CAPACITY_V3.recipients,frozenInput:v=>Object.freeze(structuredClone(v))};
 const register=bind(originalFunction(text,'registerPagedRecipient'),ports);
 for(let i=0;i<256;i++)assert.equal(register({recipient:address('recipient'+i)}).recipientIndex,i+2);
 assert.equal(pagedGraphRecipients.size,256);assert.equal(register({recipient:address('recipient255')}).recipientIndex,257);
 assert.throws(()=>register({recipient:address('recipient256')}),/SOLANA_GRAPH_RECIPIENT_CAPACITY/);assert.equal(pagedGraphRecipients.size,256);assert.equal(liveness,258);
 const restored=new Map(JSON.parse(JSON.stringify([...pagedGraphRecipients])));assert.deepEqual([...restored],[...pagedGraphRecipients]);assert.equal(bind(originalFunction(text,'registerPagedRecipient'),{...ports,pagedGraphRecipients:restored})({recipient:address('recipient255')}).recipientIndex,257);
 assert.throws(()=>bind(originalFunction(text,'registerPagedRecipient'),{...ports,custody:true})({recipient:address('new')}),/SOLANA_GRAPH_RECIPIENT_ONLY/);
});
