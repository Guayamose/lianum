#!/usr/bin/env python3
"""Small public key-initializer courier. No motor, keys, state, downloads or funding."""
import argparse,hashlib,json,os,shutil,stat,tarfile
from pathlib import Path

SOURCES=(
 'infra/paeg-demo/public-testnet/initialize-provider-keys-v1.mjs',
 'packages/backend/src/chains/public-testnet/key-store-v1.mjs',
 'packages/backend/src/chains/public-testnet/wire-v1.mjs',
 'packages/backend/src/chains/public-testnet/account-v1.mjs',
 'packages/backend/src/native-wallet/common-v1.mjs',
 'packages/engine/src/native/native-receipt-binding.mjs',
 'packages/engine/package.json',
 'packages/crypto/package.json',
 'packages/crypto/src/native-wallet-v1.mjs',
 'packages/crypto/src/native-provider-crypto-v1.mjs',
)
def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def regular(root,relative):
 path=root/relative
 for parent in (path,*path.parents):
  if parent==root:break
  if parent.is_symlink():raise ValueError('PUBLIC_KEY_COURIER_SYMLINK_INPUT')
 if not path.is_file():raise ValueError('PUBLIC_KEY_COURIER_MISSING_INPUT')
 return path
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source-root',type=Path,required=True);parser.add_argument('--dependency-root',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 source=args.source_root.resolve();dependencies=args.dependency_root.resolve();out=args.output.resolve()
 if out.exists():raise ValueError('PUBLIC_KEY_COURIER_ALREADY_EXISTS')
 out.mkdir(mode=0o755);files={}
 def copy(path,relative,expected=None,mode=0o644):
  if expected and (path.stat().st_size!=expected['bytes'] or digest(path)!=expected['sha256']):raise ValueError('PUBLIC_KEY_COURIER_PIN_MISMATCH')
  target=out/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,target);target.chmod(mode);files[relative]={'bytes':target.stat().st_size,'sha256':digest(target),'mode':f'{mode:04o}'}
 for relative in SOURCES:copy(regular(source,relative),relative)
 policy=json.loads(regular(dependencies,'scripts/development/source-pins.json').read_text())['nativeWalletNpm'];lock=json.loads(regular(dependencies,'package-lock.json').read_text())['packages']
 for package in policy['packages']:
  entry=lock[package['path']]
  if any(entry.get(k)!=package[k] for k in ('version','resolved','integrity')):raise ValueError('PUBLIC_KEY_COURIER_NPM_LOCK')
  if not any(f['path'] in ('LICENSE','LICENSE.md','LICENSE.txt') for f in package['files']):raise ValueError('PUBLIC_KEY_COURIER_LICENSE')
  for row in package['files']:copy(regular(dependencies,package['path']+'/'+row['path']),package['path']+'/'+row['path'],row)
 node=regular(dependencies,'.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node');copy(node,'tools/node',mode=0o555)
 folder=out/'node_modules/@lianum';folder.mkdir(exist_ok=True);(folder/'engine').symlink_to('../../packages/engine',target_is_directory=True);(folder/'crypto').symlink_to('../../packages/crypto',target_is_directory=True)
 manifest={'profile':'PUBLIC_TESTNET_SERVER_KEY_INITIALIZER_V1','status':'REVIEW_NEW_TOOLS_NOT_MOTOR_RELEASE','privateStateIncluded':False,'financialAcceptance':False,'files':files,'links':{'node_modules/@lianum/engine':'../../packages/engine','node_modules/@lianum/crypto':'../../packages/crypto'},'npmPackages':[{'name':p['name'],'version':p['version'],'integrity':p['integrity']} for p in policy['packages']]}
 path=out/'public-key-tools-manifest.json';path.write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n');path.chmod(0o644)
 archive=out.with_suffix('.tar.gz')
 with tarfile.open(archive,'w:gz',dereference=False) as tar:tar.add(out,arcname=out.name)
 print(json.dumps({'profile':manifest['profile'],'directory':str(out),'files':len(files),'bytes':sum(f['bytes'] for f in files.values()),'manifestSHA256':digest(path),'archive':str(archive),'archiveSHA256':digest(archive),'privateStateIncluded':False}))
if __name__=='__main__':main()
