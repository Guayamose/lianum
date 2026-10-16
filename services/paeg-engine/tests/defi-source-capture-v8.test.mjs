/** Mechanical HOST checkpoint consistency only. These DTOs are not financial
 * evidence and never enter a Source owner, signer or actual administrative run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertPublicSepoliaDefiSourceCaptureV8} from '../src/public/assert-defi-source-capture-v8.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const before={profile:'HOST_SOURCE',configurationSHA256:h('sourceidentity'),revision:7,operations:[{id:'old',profile:'HOST_OLD_ORIGINAL',command:{original:true},policySHA256:h('policy'),transaction:{original:true},signed:{nativeWire:'HOST_ORIGINAL_WIRE'},receipt:{original:true},phase:'FINALIZED'}]},plans={AAVE_STATIC:h('aave plan'),MORPHO_V2:h('morpho plan'),SOURCE7:h('source7 plan')},after=structuredClone(before);after.revision+=34;
 for(const protocol of ['AAVE_STATIC','MORPHO_V2'])for(let index=0;index<7;index++)after.operations.push({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_TARGET_ROW_V8',id:protocol+index,command:{profile:protocol==='AAVE_STATIC'?'ORIGINAL_AAVE_SEPOLIA_INITIALIZATION_V4':'ORIGINAL_MORPHO_V2_SEPOLIA_INITIALIZATION_V4',index,plan:{planSHA256:plans[protocol]}},transaction:{nonce:index},signed:{nativeWire:'HOST_TYPED_WIRE'},receipt:{original:true},phase:'FINALIZED'});
 for(let index=0;index<3;index++)after.operations.push({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_ROW_V8',id:'source7'+index,command:{plan:{planSHA256:plans.SOURCE7,startNonce:'14'},constructor:{nonce:String(14+index)}},transaction:{nonce:14+index},signed:{nativeWire:'HOST_SOURCE7_WIRE'},receipt:{original:true},phase:'FINALIZED'});
 const checkpoint=()=>({identity:after.configurationSHA256,revision:after.revision,dataSHA256:h(JSON.stringify(after.operations))});return{before,after,plans,checkpoint};
}
test('capture permits seventeen typed initialization rows and later Original dynamic rows without a thirteen-row assumption',()=>{
 const {before,after,plans,checkpoint}=fixture();after.operations.push({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_COMMAND_ROW_V8',id:'HOST_ORIGINAL_COMMAND'});const result=assertPublicSepoliaDefiSourceCaptureV8(before,after,checkpoint(),plans);assert.equal(result.operations,19);assert.equal(result.initializationOperations,17);assert.equal(result.dynamicOperations,1);
});
for(const fault of ['checkpoint','wire','plan','missing-init','new-unknown','old-command','terminal'])test('preservation rejects '+fault,()=>{
 const {before,after,plans,checkpoint}=fixture();let claimed;
 if(fault==='wire')after.operations[0].signed.nativeWire='HOST_REPLACED';
 if(fault==='old-command')after.operations[0].command={replacement:true};
 if(fault==='plan')after.operations[1].command.plan.planSHA256=h('replacement');
 if(fault==='missing-init')after.operations.pop();
 if(fault==='new-unknown')after.operations.push({profile:'HOST_UNAUTHORIZED_ROW'});
 if(fault==='terminal')after.operations[0].phase='UNKNOWN';
 claimed=checkpoint();if(fault==='checkpoint')claimed.dataSHA256=h('stale');assert.throws(()=>assertPublicSepoliaDefiSourceCaptureV8(before,after,claimed,plans));
});
