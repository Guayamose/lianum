/** Obtain only read-recovery provenance from the SAME captured Native parent.
 * No financial Source, callback signer or caller-provided checkpoint opens. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function readCapturedPublicSepoliaDefiSourceCheckpointV8(root,configuration,uniswapInput){
 const load=path=>import(pathToFileURL(join(root,path)).href),M=await load('packages/backend/src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs'),R=await load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs');
 let supervisor,reader;
 try{
  supervisor=await M.openOriginalPagedPublicUniswapReadRecoverySupervisorV6({directory:uniswapInput.parent.supervisorDirectory,password:configuration.journal.password});
  const descriptors=await supervisor.parent.sourceDescriptors(),pairings=await supervisor.parent.currentWalletPairings(),current=pairings.filter(row=>row.devicePublicKey===configuration.devicePublicKey);assert.equal(current.length,1,'PAEG_DEFI_ORIGINAL_PARENT_PRINCIPAL');
  const selected=descriptors.filter(row=>row.pairingId===current[0].currentPairingId&&row.devicePublicKey===configuration.devicePublicKey);assert.equal(selected.length,1,'PAEG_DEFI_ORIGINAL_PARENT_PAIRING');
  reader=await R.consumeOriginalPagedSourceReadRecoveryV4(await supervisor.parent.issueSource(selected[0].pairingId));
  const binding=await R.readOriginalPagedSourceReadRecoveryBindingV4(reader);return Object.freeze(structuredClone(binding.native.source.checkpoint));
 }finally{if(reader)R.closeOriginalPagedSourceReadRecoveryV4(reader);await supervisor?.close();}
}
