/** Export only the keyless gateway and its reviewed public dependencies. */
import {mkdir,readFile,writeFile,copyFile,symlink,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(process.argv[2]??join(root,'.local/public-wallet-release'));
await mkdir(out,{recursive:false,mode:0o755});const policy=JSON.parse(await readFile(join(root,'scripts/development/source-pins.json'),'utf8')).nativeWalletNpm,rows=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function copy(path,expected){const source=join(root,path),bytes=await readFile(source);if(expected&&(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256))throw Error('DEPLOYMENT_DEPENDENCY_CHANGED');const target=join(out,path);await mkdir(dirname(target),{recursive:true,mode:0o755});await writeFile(target,bytes,{mode:0o644});rows.push({path,bytes:bytes.length,sha256:sha(bytes)});}
for(const p of policy.packages)for(const file of p.files)await copy(p.path+'/'+file.path,file);
const {readdir}=await import('node:fs/promises');for(const folder of ['packages/backend/src/public-wallet','packages/backend/src/native-wallet','packages/backend/src/fiat'])for(const name of await readdir(join(root,folder))){if(name.endsWith('.d.mts'))continue;if(!name.endsWith('.mjs'))throw Error('DEPLOYMENT_UNEXPECTED_SOURCE');await copy(folder+'/'+name);}
for(const path of ['packages/crypto/src/native-wallet-v1.mjs','packages/crypto/src/native-wallet-auth-v1.mjs','packages/crypto/package.json'])await copy(path);
for(const name of ['bootstrap.sh','install-release.sh','config.example.json','Caddyfile.example','lianum-public-wallet.service'])await copy('infra/public-wallet/'+name);
await mkdir(join(out,'node_modules/@lianum'),{recursive:true});await symlink('../../packages/crypto',join(out,'node_modules/@lianum/crypto'));
await mkdir(join(out,'bin'));await copyFile(process.execPath,join(out,'bin/node'));await chmod(join(out,'bin/node'),0o755);
await writeFile(join(out,'package.json'),JSON.stringify({name:'lianum-public-wallet-deployment',private:true,type:'module'})+'\n');
const smoke=execFileSync(join(out,'bin/node'),['--input-type=module','-e',"await import('./packages/backend/src/public-wallet/http-service-v1.mjs');console.log('IMPORT_OK')"],{cwd:out,encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});if(smoke.trim()!=='IMPORT_OK')throw Error('DEPLOYMENT_IMPORT_FAILED');
const report={profile:'LIANUM_PUBLIC_WALLET_DEPLOYMENT_V1',node:process.version,nodeSHA256:sha(await readFile(process.execPath)),files:rows,containsPrivateKeys:false,mainnetBroadcastTested:false,moonpayLiveTested:false};
await writeFile(join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({directory:out,files:rows.length,node:process.version,import:'PASS'})+'\n');
