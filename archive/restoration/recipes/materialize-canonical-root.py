from pathlib import Path
import json,hashlib,shutil
R=Path(__file__).resolve().parents[1];O=Path(__file__).resolve().parent;S=R/'evm-boundary-v2-staged';D=O/'dependencies';T=Path('/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655');assert not T.is_symlink()and(not T.exists()or not any(T.iterdir()));T.mkdir(exist_ok=True);H=lambda b:hashlib.sha256(b).hexdigest();F=R/'evm-boundary-v2-source-closure/output/freezes/root.json';raw=F.read_bytes();assert H(raw)=='ff7164e7f503d5a21999865b80b1b05d3dbda4239729ec9bd1527579c9f18171';rows=json.loads(raw)['files'];records=[]
for row in rows:
 p=S/row['path'];b=p.read_bytes();assert len(b)==row['bytes']and H(b)==row['sha256'];q=T/row['path'];q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q);records.append({'path':row['path'],'sha256':row['sha256'],'bytes':len(b),'kind':'reviewed-source'})
for p in D.rglob('*'):
 if p.is_symlink()or not p.is_file():continue
 rel=p.relative_to(D);q=T/rel
 assert str(rel)not in ['omnichain-flat-profile/flat-wallet/.local/proof-workers/active.lock','omnichain-product/.local/active.lock']
 if q.exists():assert q.read_bytes()==p.read_bytes();continue
 q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q);records.append({'path':str(rel),'sha256':H(p.read_bytes()),'bytes':p.stat().st_size,'kind':'public-dependency'})
(O/'canonical-root-restoration.json').write_text(json.dumps({'schema':'EXACT_ORIGINAL_CANONICAL_ROOT_RESTORE_V1','root':str(T),'sourceFreezeSHA256':H(raw),'sourceRows':len(rows),'privateRuntimeOrKeysRestored':False,'activeLockRestored':False,'nativeExecution':False,'files':records},indent=2)+'\n');print(json.dumps({'canonicalRoot':str(T),'sourceRows':len(rows),'totalFiles':len(records)}))
