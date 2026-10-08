import test from 'node:test';
import assert from 'node:assert/strict';
import {NATIVE_SPL_PRODUCED_PROGRAM_REVIEW_V1 as program} from '../../../packages/backend/src/operations/deployments/defi/native-spl-produced-program-v1.mjs';
import {NATIVE_SPL_CLAIM_TOKEN_BUILD_RELEASE_V1 as token} from '../../../packages/backend/src/operations/deployments/claims/native-spl-claim-token-artifacts-v1.mjs';

test('importing callers cannot substitute the reviewed SPL program or cUSDC build pins',()=>{
  assert.equal(program.files['lianum_native_spl_custody_v1.so'].sha256,'a8521c684df423a85355808f9babc276670bcd7af5307eeff16a2bfa372361ce');
  assert.equal(token.files['compiled.json'].sha256,'4841e27395a5b460a308518262f28cf19876719a8a0db1318dc8e01df8c4aec6');
  for(const release of [program,token]){
    const retained=JSON.stringify(release);
    for(const [name,row]of Object.entries(release.files)){
      assert.equal(Reflect.set(row,'sha256','0'.repeat(64)),false);
      assert.equal(Reflect.set(row,'bytes',1),false);
      assert.equal(Reflect.set(release.files,name,{bytes:1,sha256:'0'.repeat(64)}),false);
    }
    assert.equal(Reflect.deleteProperty(release.files,Object.keys(release.files)[0]),false);
    assert.equal(Reflect.set(release.files,'caller-supplied.so',{bytes:1,sha256:'0'.repeat(64)}),false);
    assert.equal(JSON.stringify(release),retained);
  }
});
