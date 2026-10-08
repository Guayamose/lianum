/** Host regression executes the actual diagnostic/assertion branches only.
 * No original attempt, source artifact, signer, node or worker is changed. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {Script} from 'node:vm';
const source=readFileSync(new URL('./development-native-claim-flow.mjs',import.meta.url),'utf8');
const delimiter="?? 'DEVELOPMENT_CLAIM_FAILED';";
const classifier=source.slice(source.indexOf('const code ='),source.indexOf(delimiter)+delimiter.length);
assert.ok(source.indexOf(delimiter)>source.indexOf('const code ='));
assert.equal(classifier.includes('function main'),false);
const start=source.indexOf('assert.ok(reply.errorCode === null');
const assertion=source.slice(start,source.indexOf(');',start)+2);
assert.ok(start>0);assert.ok(assertion.includes('reply.errorCode ??'));
function classify(errorCode,expression=assertion){
 const context={assert,reply:{errorCode},outcome:null};
 new Script(classifier+'\ntry{'+expression+';outcome={allowed:true};}catch(error){outcome={allowed:false,errorCode:code(error)};}')
  .runInNewContext(context);
 return context.outcome;
}
test('redeem diagnostic preserves actual stale-audit failure while allowing only original finality states',()=>{
 for(const value of [null,'CLAIM_NATIVE_FINALITY_UNRESOLVED'])assert.equal(classify(value).allowed,true);
 for(const value of ['CLAIM_OPERATOR_AUDIT_TOO_OLD','CLAIM_ATTESTATION_UNCERTAIN','CLAIM_OPERATOR_CLOSED_OR_POISONED']){
  const result=classify(value);assert.equal(result.allowed,false);assert.equal(result.errorCode,value);
 }
});
test('original rejected attempt expression reproduces misleading literal without changing historical report',()=>{
 const old="assert.ok(reply.errorCode === null || reply.errorCode === 'CLAIM_NATIVE_FINALITY_UNRESOLVED');";
 const result=classify('CLAIM_OPERATOR_AUDIT_TOO_OLD',old);
 assert.equal(result.allowed,false);assert.equal(result.errorCode,'CLAIM_NATIVE_FINALITY_UNRESOLVED');
});
