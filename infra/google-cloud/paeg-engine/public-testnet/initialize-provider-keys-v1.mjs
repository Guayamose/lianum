/** Run on the provider VM as its unprivileged service UID. Outputs PUBLIC data only. */
import {initializePublicPagedServerKeysV1,openPublicPagedServerKeysV1,readPublicPagedServerAccountsV1,closePublicPagedServerKeysV1} from '../../../../packages/backend/src/chains/public-testnet/key-store-v1.mjs';
import {resolve} from 'node:path';
const [operation,directory]=process.argv.slice(2);
if(!['initialize','read-public'].includes(operation)||!directory||process.argv.length!==4)throw Error('PUBLIC_PROVIDER_INIT_ARGUMENTS');
let handle;
try{
 const result=operation==='initialize'?await initializePublicPagedServerKeysV1(resolve(directory)):(handle=await openPublicPagedServerKeysV1(resolve(directory)),readPublicPagedServerAccountsV1(handle));
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){const code=/^(?:NATIVE_WALLET_PUBLIC_[A-Z_]+|PUBLIC_PROVIDER_INIT_ARGUMENTS)$/.test(error.code??error.message)?error.code??error.message:'PUBLIC_PROVIDER_INIT_FAILED';process.stderr.write(JSON.stringify({stage:'SERVER_KEY_INITIALIZATION',code})+'\n');process.exitCode=1;}
finally{if(handle)closePublicPagedServerKeysV1(handle);}
