import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireFundedOrder, requireExactMenuPackage, ackBytes } from '../../../src/native-authority.mjs';
import { parseStrictJSON } from '../strict-json.mjs';
import { decode, H } from './wire.mjs';

export function acknowledgeFrozenCopy(role, dirArgument, authorityPath, signerPath, reviewHooks = {}) {
  const dir=resolve(dirArgument); assert.ok(['E_S','P_S','E_B','P_B'].includes(role));
  const authority=parseStrictJSON(readFileSync(authorityPath,'utf8'));
  requireFundedOrder(authority.manifest,authority.reference,authority.observed);
  const packageManifest=parseStrictJSON(readFileSync(resolve(dir,'manifest.json'),'utf8'));
  requireExactMenuPackage(packageManifest,authority.manifest);
  const names=['verification-key.bin',...[0,1].flatMap(j=>[`branch-${j}-proof.bin`,`branch-${j}-statement.bin`,`branch-${j}-opening.bin`]),...(role.endsWith('_S')?['result-salt.bin']:[])];
  const checked=resolve(dir,'checked-files');assert.deepEqual(readdirSync(checked).sort(),[...names].sort());
  const captured={};
  for(const name of names){
    for(const path of [resolve(dir,name),resolve(checked,name)])assert.ok(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink());
    const bytes=readFileSync(resolve(dir,name));assert.ok(bytes.length<=65536);assert.deepEqual(bytes,readFileSync(resolve(checked,name)));
    captured[name]=bytes.toString('base64');
  }
  for(const j of [0,1]){
    const s=decode('statement',Buffer.from(captured[`branch-${j}-statement.bin`],'base64'));
    for(const key of ['scope','session','menuBinding'])assert.equal(s[key].toString('hex'),authority.manifest[key]);
    for(const key of ['C_S','C_B'])assert.equal(s[key].toString('hex'),authority.manifest.branches[j][key],'FROZEN_EXACT_STATEMENT_PAIR');
  }
  assert.equal(H(Buffer.from(captured['verification-key.bin'],'base64')).toString('hex'),authority.manifest.verificationKeySHA256);
  const policy=Object.fromEntries(['scope','session','verificationKeySHA256'].map(k=>[k,authority.manifest[k]]));
  // Immutable strings captured once. The proof child and signing never reopen
  // incoming files. Review hooks exist only for deterministic replacement tests.
  const transport=JSON.stringify({files:captured,policy});
  const snapshot=JSON.stringify({manifest:packageManifest,files:captured,policy});
  reviewHooks.afterCapture?.();
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./role-check.mjs',import.meta.url)),role,'--stdin'],{input:transport,encoding:'utf8',timeout:45000,maxBuffer:256*1024});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr);
  const proofChecks=parseStrictJSON(result.stdout);
  for(const file of proofChecks.applicationFilesRead)assert.equal(file.sha256,H(Buffer.from(captured[file.name],'base64')).toString('hex'));
  reviewHooks.afterVerification?.();
  const key=createPrivateKey(readFileSync(signerPath));
  assert.equal(createPublicKey(key).export({format:'der',type:'spki'}).toString('base64'),authority.manifest.holders[role]);
  const retained=mkdtempSync(join(dirname(resolve(signerPath)),`retained-${role}-`));
  const snapshotHash=H(Buffer.from(snapshot)).toString('hex');
  writeFileSync(join(retained,snapshotHash+'.json'),snapshot,{flag:'wx'});
  const ack={role,reservationId:authority.reference.id,frozenHash:authority.reference.orderHash};ack.signature=sign(null,ackBytes(ack),key).toString('hex');
  writeFileSync(join(retained,'accepted-ack.json'),JSON.stringify(ack,null,2)+'\n',{flag:'wx'});
  return {ack,proofChecks,capturedPackageSHA256:snapshotHash,capturedBytesUsedForVerificationAndRetention:true,retainedCopyWrittenBeforeAck:true,
    holderView:{owner:authority.manifest.owner,solver:authority.manifest.solver,authority:authority.reference.authority,reservationId:authority.reference.id,chainId:authority.manifest.chainId,evmGenesis:authority.manifest.evmGenesis,amountWei:authority.manifest.amountWei,executeBy:authority.manifest.executeBy,claimBy:authority.manifest.claimBy,holders:authority.manifest.holders,branches:authority.manifest.branches},
    disclosure:'Transparent full frozen-manifest same-host baseline; not original minimal private executor view, OS isolation or future-storage proof'};
}
