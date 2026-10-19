/** Actual native V4 snapshot, scrypt/AES envelope and multipart inventory.
 * Only Android storage, biometric scope and native AES primitives are HOST ports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
test('unchanged encrypted V4 recovery restores the original root and regenerates both environments',async t=>{
 const storage=new Map(),roots=new Map(),keys=new WeakMap(),imported=[],scopes=new WeakMap(),owner='04'+'21'.repeat(64),signal=new AbortController().signal,passphrase='host-native-recovery-password';
 const scope=kind=>{const s={};scopes.set(s,kind);return s;};
 t.mock.module('react-native',{exports:{AppState:{currentState:'active'}}});
 t.mock.module('expo-secure-store',{exports:{WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,getItemAsync:async k=>storage.get(k)??null,setItemAsync:async(k,v)=>storage.set(k,v)}});
 t.mock.module('expo-local-authentication',{exports:{authenticateAsync:async()=>({success:true})}});
 t.mock.module('../src/custody/wallet-session-v1.ts',{exports:{copyWalletSessionSecretV10:async()=>{throw Error('HOST_NO_MANAGED_ROOT');},walletSessionStatusV1:()=>({active:true,publicKey:owner}),captureWalletSessionGuardV1:()=>()=>{},readWalletSessionSecret:async k=>roots.get(k)??null,writeWalletSessionSecret:async(k,v)=>roots.set(k,v),assertWalletSessionRecoveryBatchV4:(s,kind,key,activeSignal)=>{assert.equal(scopes.get(s),kind,'HOST_BIOMETRIC_SCOPE');assert.equal(key,owner);assert.strictEqual(activeSignal,signal);}}});
 t.mock.module('expo-crypto',{exports:{getRandomBytesAsync:async n=>new Uint8Array(randomBytes(n)),AESEncryptionKey:{async import(bytes){const key={},copy=Buffer.from(bytes);keys.set(key,copy);imported.push(copy);return key;}},AESSealedData:{fromCombined:(raw,options)=>{assert.ok(raw instanceof Uint8Array);assert.deepEqual(options,{ivLength:12,tagLength:16});return{bytes:Buffer.from(raw)};}},async aesEncryptAsync(clear,key,options){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys.get(key),iv);cipher.setAAD(Buffer.from(options.additionalData));const encrypted=Buffer.concat([iv,cipher.update(clear),cipher.final(),cipher.getAuthTag()]);return{combined:async()=>encrypted.toString('base64')};},async aesDecryptAsync(sealed,key,options){const b=sealed.bytes,cipher=createDecipheriv('aes-256-gcm',keys.get(key),b.subarray(0,12));cipher.setAAD(Buffer.from(options.additionalData));cipher.setAuthTag(b.subarray(-16));return Uint8Array.from(Buffer.concat([cipher.update(b.subarray(12,-16)),cipher.final()]));}}});
 t.after(()=>{for(const key of imported)key.fill(0);storage.clear();roots.clear();});
 const W=await import('../src/custody/native-wallet-custody-v1.ts'),B=await import('../src/custody/wallet-recovery-parts-v4.mjs');
 const original=await W.createNativeWalletCustodyV1('mainnet',signal),other=await W.enableNativeWalletNetworkV2('testnet',signal),originalRoot=roots.get('lianum.native.wallet.v1.root'),originalMetadata=storage.get('lianum.native.wallet.v1.accounts');
 const cut=await W.exportNativeWalletRecoveryCutV4(scope('EXPORT'),owner,passphrase,signal);assert.equal(cut.kind,'NATIVE_WALLET');
 const bundle=await B.createWalletRecoveryPartsV4({devicePublicKey:owner,identityBackup:'HOST_UNUSED_IDENTITY_PART',connections:[],catalogues:[],custodies:[cut]},passphrase,signal);
 assert.equal(bundle.serialized.includes(originalRoot),false);assert.equal(bundle.serialized.includes(original.accounts[0].address),false);
 const inventory=await B.openWalletRecoveryPartsV4(bundle.serialized,passphrase,owner,signal);storage.clear();roots.clear();
 await assert.rejects(W.restoreNativeWalletRecoveryCutV4(structuredClone(inventory),bundle.serialized,passphrase,scope('RESTORE'),signal),/RECOVERY_PARTS/);
 await assert.rejects(W.restoreNativeWalletRecoveryCutV4(inventory,bundle.serialized,'wrong-native-recovery-password',scope('RESTORE'),signal),/BACKUP_AUTHENTICATION/);assert.equal(roots.size,0);
 await W.restoreNativeWalletRecoveryCutV4(inventory,bundle.serialized,passphrase,scope('RESTORE'),signal,true);assert.equal(roots.size,0,'preflight never installs a root');assert.equal(storage.size,0);
 const restored=await W.restoreNativeWalletRecoveryCutV4(inventory,bundle.serialized,passphrase,scope('RESTORE'),signal);
 assert.deepEqual(restored.accounts,original.accounts);assert.equal(roots.get('lianum.native.wallet.v1.root'),originalRoot);assert.equal(storage.get('lianum.native.wallet.v1.accounts'),originalMetadata);
 assert.equal((await W.readNativeWalletCustodyV1(signal,'testnet')).status,'NETWORK_REQUIRED');assert.deepEqual(await W.enableNativeWalletNetworkV2('testnet',signal),other,'the original words/root reproduce the same testnet accounts after actual encrypted recovery');
 assert.deepEqual(await W.readNativeWalletCustodyV1(signal,'mainnet'),original);
});
