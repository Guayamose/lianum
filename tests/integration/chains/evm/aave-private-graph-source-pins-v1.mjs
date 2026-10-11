/** Fixed Aave closure extends the original financial collector; no caller roots. */
import assert from 'node:assert/strict';
import {assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
import {join,relative,resolve,sep} from 'node:path';
import {ROOT,FLAT} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {evmVaultSourcePins} from '../../runners/source-pins.mjs';
import {AAVE_CORE_V3_MATERIAL_V1,AAVE_STATIC_WRAPPER_MATERIAL_V1,
  loadOfficialAaveCoreArtifactsV1,loadOfficialAaveWrapperSourcesV1}
  from '../../../../packages/backend/src/operations/deployments/defi/aave-v3-official-material-v1.mjs';
export function aavePrivateGraphSourcePinsV1() {
  assert.equal(arguments.length,0,'AAVE_SOURCE_NO_OPTIONS');
  const original=evmVaultSourcePins(),files=new Map(original.local.map(row=>[row.path,row]));
  function record(path) {const raw=regular(path),name=relative(FLAT,path).split(sep).join('/');
    assert.ok(path.startsWith(FLAT+sep)||path.startsWith(resolve(FLAT,'../../..')+sep),'AAVE_FIXED_SOURCE_ROOT');
    files.set(name,{path:name,bytes:raw.length,sha256:hash(raw)});}
  assertCapturedCurrentSources(original,["tests/integration/chains/evm/run-evm-aave-flow.mjs","tests/integration/chains/evm/aave-private-graph-source-pins-v1.mjs","tests/integration/chains/evm/aave-private-graph-policy-v1.mjs"]);
  for(const name of ['BoundedMetaMorphoExit.sol','BoundedAaveStaticExit.sol','LocalAaveFlashYield.sol','PrivateAaveStaticDelivery.sol'])
    record(join(ROOT,'contracts/defi',name));
  record(join(resolve(FLAT,'../../..'),'scripts/development/aave_material.py'));
  const core=loadOfficialAaveCoreArtifactsV1();loadOfficialAaveWrapperSourcesV1();
  const material=join(ROOT,'wallet-platform/artifacts/aave-v3-development-v1');
  for(const row of AAVE_CORE_V3_MATERIAL_V1.contracts) {
    record(join(material,'core-v3-1.19.3/package',row.path));
    record(join(material,'core-v3-1.19.3/package',row.buildInfo));
  }
  for(const row of core.sourceRecords)record(join(material,'core-v3-1.19.3/package',row.path));
  for(const row of AAVE_STATIC_WRAPPER_MATERIAL_V1.files)record(join(material,'static-a-token-v3-101f5d9',row.path));
  return {...original,format:'LIANUM_AAVE_PRIVATE_GRAPH_SOURCE_CLOSURE_V1',
    local:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
