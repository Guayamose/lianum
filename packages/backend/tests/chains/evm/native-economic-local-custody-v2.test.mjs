/** HOST crypto/storage boundaries only. No Anvil, funding, proof or restart
 * acceptance is established by these tests. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeEconomicLocalCustodyV2,captureNativeEconomicLocalCustodyV2,reopenNativeEconomicLocalCustodyV2,nativeEconomicLocalCustodyPublicV2,closeNativeEconomicLocalCustodyV2,prepareNativeEconomicCustodySigningV2,consumeNativeEconomicCustodySigningV2,revokeNativeEconomicCustodySigningV2,signNativeEconomicCustodyTransactionV2} from '../../../src/chains/evm/runtime/native-economic-local-custody-v2.mjs';
import {LOCAL_EVM_PROFILE,assertSignedEvmTransaction} from '../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
function terms(from){return Object.freeze({chainId:'31337',from,to:'0x'+'22'.repeat(20),nonce:'3',gas:'100000',gasPrice:'1000000000',value:'1000',data:'0x1234'});}
test('HOST original AEAD five-key retention, exact public genesis and sync lease survive custody reopen',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'lianum-local-native-v2-host-'));let first,second;
 try{
  first=await createNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE});
  const view=nativeEconomicLocalCustodyPublicV2(first),tx=terms(view.accounts[1]),prepared=Object.freeze({transaction:tx});
  const lease=await prepareNativeEconomicCustodySigningV2(first,prepared),copy={...lease};
  assert.throws(()=>consumeNativeEconomicCustodySigningV2(first,copy,prepared),/ORIGINAL_SIGNING_LEASE/);
  const signed=consumeNativeEconomicCustodySigningV2(first,lease,prepared);
  assert.ok(!(signed instanceof Promise));assertSignedEvmTransaction(signed.nativeWire,tx);
  assert.equal((await signNativeEconomicCustodyTransactionV2(first,tx)).nativeWire,signed.nativeWire);
  assert.throws(()=>consumeNativeEconomicCustodySigningV2(first,lease,prepared),/ORIGINAL_SIGNING_LEASE/);revokeNativeEconomicCustodySigningV2(lease);
  const retained=await captureNativeEconomicLocalCustodyV2(first),genesis=await readFile(retained.genesis.path,'utf8'),cipher=await readFile(retained.path,'utf8');
  assert.deepEqual(Object.keys(JSON.parse(genesis).alloc).sort(),view.accounts.map(a=>a.slice(2)).sort());
  assert.ok(!genesis.includes('privateKeys')&&!genesis.includes('password')&&!genesis.includes('mnemonic'));assert.ok(!cipher.includes(retained.password));
  const active=await prepareNativeEconomicCustodySigningV2(first,prepared),closingSetup=signNativeEconomicCustodyTransactionV2(first,tx);
  closeNativeEconomicLocalCustodyV2(first);
  await assert.rejects(closingSetup,/ORIGINAL_CUSTODY/);
  assert.throws(()=>consumeNativeEconomicCustodySigningV2(first,active,prepared),/ORIGINAL_CUSTODY/);revokeNativeEconomicCustodySigningV2(active);
  second=await reopenNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE},retained);
  assert.deepEqual(nativeEconomicLocalCustodyPublicV2(second),view);
  const same=consumeNativeEconomicCustodySigningV2(second,await prepareNativeEconomicCustodySigningV2(second,prepared),prepared);
  assert.equal(same.nativeWire,signed.nativeWire);assertSignedEvmTransaction(same.nativeWire,tx);
  // Changing the public genesis or authenticated custody bytes cannot become
  // a different set of five signers under the old recovery credential.
  closeNativeEconomicLocalCustodyV2(second);second=null;
  await writeFile(retained.genesis.path,genesis+' ',{mode:0o600});
  await assert.rejects(reopenNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE},retained),/GENESIS_CHANGED|AssertionError/);
  await writeFile(retained.genesis.path,genesis,{mode:0o600});
  const bad=JSON.parse(cipher);bad.ciphertext=(bad.ciphertext??'')+'00';await writeFile(retained.path,JSON.stringify(bad),{mode:0o600});
  await assert.rejects(reopenNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE},retained));
 }finally{if(second)closeNativeEconomicLocalCustodyV2(second);if(first)closeNativeEconomicLocalCustodyV2(first);await rm(cwd,{recursive:true,force:true});}
});
