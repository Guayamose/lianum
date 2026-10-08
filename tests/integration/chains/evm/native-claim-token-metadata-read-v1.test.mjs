/** HOST ABI read framing only; no account, chain or deployment authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {join} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {claimArtifactMethod} from '../../../../packages/backend/src/operations/deployments/claims/native-claim-deployment-plan.mjs';
import {loadNativeSplClaimV1RetainedContracts} from '../../../../packages/backend/src/operations/deployments/claims/native-spl-claim-v1-compilation.mjs';
import {encodeClaimABI} from '../../../../packages/backend/src/claims/protocol/abi.mjs';
test('the actual bootstrap metadata read compares original dynamic string ABI and rejects mismatched raw reply',async()=>{
 const url=new URL('../../../../packages/backend/src/operations/deployments/claims/deploy-native-claims.mjs',import.meta.url);
 const source=readFileSync(existsSync(url)?url:join(ROOT,'wallet-platform/modules/ops/deploy-native-claims.mjs'),'utf8');
 const start=source.indexOf('  const expectMetadata = async'),end=source.indexOf("  await expect(authority, 'hub()'",start);
 assert.ok(start>=0&&end>start);const original=source.slice(start,end).trim().replace(/^const expectMetadata = /,'').replace(/;$/,'');
 // HOST-only VM port: preserve the original ABI validator; rehome the
 // artificial VM array into this host realm before calling it.
 const context=createContext({assert,Buffer,claimArtifactMethod,encodeClaimABI:(outputs,values)=>encodeClaimABI(outputs,structuredClone(values)),block:'0x10'}),
  action=new Script('('+original+')').runInContext(context);
 const artifact=loadNativeSplClaimV1RetainedContracts().artifacts.token;
 const actualWire=value=>'0x'+'20'.padStart(64,'0')+Buffer.byteLength(value).toString(16).padStart(64,'0')+Buffer.from(value).toString('hex').padEnd(Math.ceil(Buffer.byteLength(value)/32)*64,'0');
 for(const[signature,value]of[['symbol()','cBTC'],['symbol()','cUSDC'],['symbol()','cSOL'],['name()','Custodial USDC SPL Claim'],['name()','Custodial Bitcoin Claim'],['name()','Custodial Solana Claim']]){
  assert.throws(()=>BigInt(value)); // prior integer-only read path failed for every actual metadata string
  const target={artifact,async call(s,args,block){assert.equal(s,signature);assert.equal(args.length,0);assert.equal(block,'0x10');return actualWire(value);}};
  await action(target,signature,value);
  await assert.rejects(action({...target,async call(){return actualWire(value+'changed');}},signature,value),/TOKEN_METADATA/);
  await assert.rejects(action({...target,async call(){return actualWire(value)+'00'.repeat(32);}},signature,value),/TOKEN_METADATA/);
 }
 const target={artifact,async call(){assert.fail('invalid fixed metadata must reject before original read');}};
 await assert.rejects(action(target,'name()','bad\ud800'),/TOKEN_METADATA_VALUE/);
 await assert.rejects(action(target,'name()','name\n'),/TOKEN_METADATA_VALUE/);
 await assert.rejects(action(target,'name()',''),/TOKEN_METADATA_VALUE/);
 await assert.rejects(action(target,'name()','x'.repeat(65)),/TOKEN_METADATA_VALUE/);
});
