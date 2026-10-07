from pathlib import Path
import json,hashlib,shutil
R=Path(__file__).resolve().parents[1];O=Path(__file__).resolve().parent;D=O/'dependencies';A=R/'lianum-v33-reconstructed-recovery-delta';prefix=Path('drafts/native-value-verifier-preparation');S=A/'current-overrides'/prefix;H=lambda b:hashlib.sha256(b).hexdigest();raw=(S/'driver-source-manifest.json').read_bytes();assert H(raw)=='09ffe3beb3a3024e65f36aeaa4b80d32e6a2a43a31d20e3f7bb63ea54e091d3e';m=json.loads(raw);rows=[]
def put(src,rel,sha,bytes_=None):
 data=src.read_bytes();assert H(data)==sha
 if bytes_ is not None:assert len(data)==bytes_
 out=D/rel;out.parent.mkdir(parents=True,exist_ok=True)
 if out.exists():assert out.read_bytes()==data
 else:shutil.copy2(src,out)
 rows.append({'path':str(rel),'source':str(src),'bytes':len(data),'sha256':sha})
put(S/'driver-source-manifest.json',prefix/'driver-source-manifest.json',H(raw))
for r in m['files']:put(S/r['path'],prefix/r['path'],r['sha256'],r['bytes'])
cache=json.loads((A/'APPROVED-PUBLIC-ARTIFACT-CACHE.json').read_text())
for r in cache['files']:put(A/r['archivePath'],Path(r['restoreRelativePath']),r['sha256'],r['bytes'])
original=Path('/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655')
externalMissing=[]
for r in m['readOnlyExternalFiles']:
 rel=Path(r['path']).relative_to(original);candidate=D/rel
 if candidate.exists()and H(candidate.read_bytes())==r['sha256']:continue
 found=None
 for p in R.rglob(Path(r['path']).name):
  if p.is_file()and not p.is_symlink()and p.stat().st_size==r['bytes']and H(p.read_bytes())==r['sha256']:found=p;break
 if found:put(found,rel,r['sha256'],r['bytes'])
 else:externalMissing.append(r)
(O/'i84-reader-restoration.json').write_text(json.dumps({'schema':'EXACT_FIXED_I84_READER_RESTORE_V1','requiredOriginalRoot':str(original),'nativeExecution':False,'files':rows,'missingExternal':externalMissing},indent=2)+'\n');print(json.dumps({'restored':len(rows),'missingExternal':len(externalMissing)}))
