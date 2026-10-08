/** Public programme metadata only; no compiler, key preparation or proof. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,LOCAL} from '../../../../packages/proofs/src/catalog.mjs';
import {assertNativeSplClaimV1ProducedProgramBytesV1,NATIVE_SPL_CLAIM_V1_PRODUCED_PROGRAM_PINS as P} from '../../../../packages/backend/src/operations/deployments/claims/native-spl-claim-v1-program-provenance.mjs';
const directory=join(LOCAL,'relations/native_claim_ingress/c13d5cc0e1be06158727cf933013492fe44efe987d09e4dee9bb9216c04fb418'),pointer=join(directory,'compiled.json');
test('genuine NEW raw programme keeps exact ACIR/ABI and its sole historical path preimage without rewriting bytes',{skip:!existsSync(pointer)},()=>{
 const id=JSON.parse(readFileSync(pointer)).artifactId;assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);const raw=readFileSync(join(directory,'compiled',id,'program.json')),before=Buffer.from(raw),result=assertNativeSplClaimV1ProducedProgramBytesV1(raw);assert.ok(raw.equals(before));assert.equal(result.rawProgrammeSHA256,P.rawSHA256);assert.equal(result.originalProgrammeSHA256,P.originalProgrammeSHA256);assert.equal(result.originalPathPreimageVerified,true);for(const field of ['historicalProgrammeRawBytesRecovered','historicalRawProgrammeEqualityEstablished','historicalVkEqualityEstablished','programmeRewritten'])assert.equal(result[field],false);
 const current=Buffer.from(join(ROOT,'proof-relations/native-claim-ingress/src/main.nr')),at=raw.indexOf(current),old=Buffer.concat([raw.subarray(0,at),Buffer.from(P.originalMainPath),raw.subarray(at+current.length)]);assert.equal(createHash('sha256').update(old).digest('hex'),P.originalProgrammeSHA256);assert.throws(()=>assertNativeSplClaimV1ProducedProgramBytesV1(old));
 for(const [field,value]of [['bytecode','AA=='],['debug_symbols','changed'],['hash','0']]){const object=JSON.parse(raw);object[field]=value;assert.throws(()=>assertNativeSplClaimV1ProducedProgramBytesV1(Buffer.from(JSON.stringify(object,null,2)+'\n')));}
 const object=JSON.parse(raw);object.file_map['52'].path='/caller/selected/main.nr';assert.throws(()=>assertNativeSplClaimV1ProducedProgramBytesV1(Buffer.from(JSON.stringify(object,null,2)+'\n')));
});
test('programme parser grants no caller path, options or unknown byte hash',()=>{
 for(const value of [undefined,null,'caller-program',{},Buffer.alloc(0),Buffer.alloc(P.rawBytes)])assert.throws(()=>assertNativeSplClaimV1ProducedProgramBytesV1(value));assert.throws(()=>assertNativeSplClaimV1ProducedProgramBytesV1(Buffer.alloc(0),{path:'/caller'}));
});
