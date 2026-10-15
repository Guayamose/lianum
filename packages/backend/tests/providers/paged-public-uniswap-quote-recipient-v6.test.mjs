import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePagedPublicUniswapQuoteRecipientDataV5 as resolve} from '../../src/providers/funded-paged-native-provider-v3.mjs';
const intent={kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE',depositJobId:'a'.repeat(64),rootId:'b'.repeat(64),outputCommitment:'c'.repeat(64),outputAmount:'100',maximumInput:'200',validFrom:'1000',validUntil:'2000'},recipient='1'.repeat(40),router='0x'+'2'.repeat(40);
test('Legacy eight-field intent keeps its exact router quote declaration',()=>{assert.equal(resolve(intent,recipient,router),router);assert.deepEqual(Object.keys(intent).sort(),['kind','depositJobId','maximumInput','outputAmount','outputCommitment','rootId','validFrom','validUntil'].sort());});
test('Reviewed optional D27 beneficiary enters quote terms while transaction router remains unchanged',()=>{assert.equal(resolve({...intent,recipient},recipient,router),'0x'+recipient);assert.equal(router,'0x'+'2'.repeat(40));});
test('Optional beneficiary cannot substitute another account or the transaction router',()=>{assert.throws(()=>resolve({...intent,recipient:'3'.repeat(40)},recipient,router),/ORIGINAL_RECIPIENT/);assert.throws(()=>resolve({...intent,recipient:router.slice(2)},recipient,router),/ORIGINAL_RECIPIENT/);});
test('Malformed beneficiary and new surplus intent fields are rejected',()=>{assert.throws(()=>resolve({...intent,recipient:'0x'+recipient},recipient,router));assert.throws(()=>resolve({...intent,recipient,alias:recipient},recipient,router));});
