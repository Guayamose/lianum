import test from 'node:test';
import assert from 'node:assert/strict';
import {originalFlatIngressFailureMessageV3} from '../src/screens/flat-ingress-feedback-v3.mjs';
test('Only original bounded ingress codes explain a fenced deposit',()=>{
 assert.equal(originalFlatIngressFailureMessageV3(new Error('HTTP 403: secret/raw details')),null);
 const e=new Error('untrusted service detail');Object.defineProperty(e,'code',{value:'FLAT_DEPOSIT_BELOW_MINIMUM'});assert.match(originalFlatIngressFailureMessageV3(e),/mínimo original/);
 assert.match(originalFlatIngressFailureMessageV3(new Error('FLAT_LEGACY_FRESH_DEPOSIT_DISABLED')),/retirada o recuperación original/);
 assert.match(originalFlatIngressFailureMessageV3(new Error('FLAT_MINIMUM_LOCAL_ACCEPTANCE_NOT_RELEASED')),/no está habilitado/);
});
test('Feedback does not execute caller getters or convert DTOs into a policy',()=>{
 let called=0;const e=new Error();Object.defineProperty(e,'code',{get(){called++;throw Error('untrusted getter');}});Object.defineProperty(e,'message',{get(){called++;throw Error('untrusted getter');}});
 assert.equal(originalFlatIngressFailureMessageV3(e),null);assert.equal(called,0);
 assert.equal(originalFlatIngressFailureMessageV3({code:'FLAT_DEPOSIT_BELOW_MINIMUM'}),null);
});
