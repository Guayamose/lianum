/** Original issuer boundaries only. No runtime, operator, proof or spending. */
import test from 'node:test';
import {captureOriginalUniswapFixtureRecoveryV3,reopenOriginalUniswapFixtureRecoveryV3} from '../../src/operations/deployments/defi/official-protocol-fixture-v3.mjs';
import assert from 'node:assert/strict';
import {captureOriginalPagedUniswapContextV3,reopenOriginalPagedUniswapContextV3} from '../../src/providers/paged-uniswap-provider-v3.mjs';
import {captureOriginalPagedUniswapShareAuthorityV3,reopenOriginalPagedUniswapShareAuthorityV3} from '../../src/accounts/authority/device-external-flat-note-authority-v1.mjs';
import {armOriginalPagedUniswapRuntimeRetentionV3,captureOriginalPagedUniswapRuntimeV3,reopenOriginalPagedUniswapRuntimeV3} from '../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
test('public context, account, runtime and copied capsules cannot issue Mixed recovery',async()=>{
 const dto=Object.freeze({profile:'ORIGINAL_PAGED_UNISWAP_CONTEXT_COLD_RETENTION_V3',targetDescriptor:{},runtime:{},account:{}});
 for(const raw of [dto,structuredClone(dto),new Proxy(dto,{})]){
  await assert.rejects(captureOriginalPagedUniswapContextV3(raw),/PAGED_UNISWAP_ORIGINAL_CONTEXT/);
  assert.throws(()=>captureOriginalPagedUniswapShareAuthorityV3(raw),/PAGED_UNISWAP_ORIGINAL_SHARE/);
  await assert.rejects(reopenOriginalPagedUniswapContextV3(raw,raw),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
  await assert.rejects(reopenOriginalPagedUniswapShareAuthorityV3(raw),/ORIGINAL_EXTERNAL_BOOTSTRAP_PART/);
  await assert.rejects(captureOriginalUniswapFixtureRecoveryV3({},raw),/ORIGINAL_UNISWAP_ONLY_FIXTURE_V3/);
  await assert.rejects(reopenOriginalUniswapFixtureRecoveryV3(raw),/ORIGINAL_EXTERNAL_BOOTSTRAP_PART/);
  await assert.rejects(captureOriginalPagedUniswapRuntimeV3(raw,raw),/PAGED_UNISWAP_ORIGINAL_RETENTION/);
  await assert.rejects(reopenOriginalPagedUniswapRuntimeV3(raw),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
 }
 await assert.rejects(armOriginalPagedUniswapRuntimeRetentionV3({...dto,runtime:{}}));
});
