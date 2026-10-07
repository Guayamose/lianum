/** Read-only verification of cached official npm artifact, binary, actual API source and runtime. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const evidence=JSON.parse(readFileSync(new URL('./native-provenance.json',import.meta.url)));
const digest=(b,algorithm='sha256',encoding='hex')=>createHash(algorithm).update(b).digest(encoding);
const tarball=readFileSync(repo+evidence.tarballPath),lock=readFileSync(repo+evidence.lockfilePath);
assert.equal(tarball.length,51733403);assert.equal(digest(tarball),'321e72314fea1963f3557a5d739691f2fc7ec68c8ed8731dff8ebd380b56c019');
assert.equal(digest(lock),evidence.lockfileSHA256);
const pkg=JSON.parse(lock).packages['node_modules/@aztec/bb.js'];
assert.equal(pkg.resolved,'https://registry.npmjs.org/@aztec/bb.js/-/bb.js-5.2.0.tgz');
assert.equal(pkg.integrity,'sha512-'+digest(tarball,'sha512','base64'));
const binary=readFileSync(repo+evidence.binaryPath);
assert.equal(binary.length,38240512);assert.equal(digest(binary),'5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b');
function member(path){return execFileSync('tar',['-xOzf',repo+evidence.tarballPath,path],{maxBuffer:64*1024**2,timeout:30000});}
assert.deepEqual(member('package/build/amd64-linux/bb'),binary);
for(const record of evidence.actualApiSourceAndRuntimeFiles){const bytes=readFileSync(repo+record.path);assert.equal(bytes.length,record.bytes);assert.equal(digest(bytes),record.sha256);const rel=record.path.split('/@aztec/bb.js/')[1];assert.deepEqual(member('package/'+rel),bytes);}
console.log(JSON.stringify({classification:'READ_ONLY_PROVENANCE_RECHECK_NO_NATIVE_EXECUTION',verified:true,provenanceSHA256:digest(readFileSync(new URL('./native-provenance.json',import.meta.url))),tarballSHA256:evidence.tarballSHA256,binarySHA256:evidence.binarySHA256,actualApiFiles:evidence.actualApiSourceAndRuntimeFiles.length}));
