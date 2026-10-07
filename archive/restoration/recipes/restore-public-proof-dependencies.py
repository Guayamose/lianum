from pathlib import Path
import json,hashlib,os
R=Path(__file__).resolve().parents[1];O=Path(__file__).resolve().parent;D=O/'dependencies';pins=json.loads((O/'wrapped-proof-pins.json').read_text())['WRAPPED_CLAIM_PROOF_PIN_SET_V1'];wanted={};rows=[]
for role,v in pins['roles'].items():
 for name,pin in v['files'].items():rows.append({'path':'omnichain-flat-profile/flat-wallet/experiments/wrapped-claim-proof-artifacts-v1/'+role+'/'+name,**pin});wanted[pin['sha256']]=pin['bytes']
for batch,v in pins['constraintFiles'].items():
 for name,pin in v.items():
  filename='runtime-pins.json' if name=='runtime' else name+'.json';rows.append({'path':'omnichain-flat-profile/flat-wallet/experiments/wrapped-claim-proof-artifacts-v1/constraints/'+batch+'/'+filename,**pin});wanted[pin['sha256']]=pin['bytes']
found={};sizes=set(wanted.values())
for directory,dirs,files in os.walk(R):
 dirs[:]=[d for d in dirs if d not in ['wallet-owner-new','combined54-staged','exact-predecessor-1650','node_modules'] and not (Path(directory)/d).is_symlink()]
 for name in files:
  p=Path(directory)/name
  if p.is_symlink() or p.suffix in ['.zip','.gz'] or p.stat().st_size not in sizes:continue
  b=p.read_bytes();h=hashlib.sha256(b).hexdigest()
  if h in wanted:found.setdefault(h,p)
result=[]
for row in rows:
 src=found.get(row['sha256']);r={**row,'source':str(src) if src else None,'restored':False}
 if src:
  b=src.read_bytes();assert len(b)==row['bytes'] and hashlib.sha256(b).hexdigest()==row['sha256'];target=D/row['path'];target.parent.mkdir(parents=True,exist_ok=True)
  if target.exists():assert target.read_bytes()==b
  else:target.write_bytes(b);target.chmod(0o600)
  r['restored']=True
 result.append(r)
(O/'public-proof-dependency-restoration.json').write_text(json.dumps({'schema':'EXACT_PUBLIC_PROOF_DEPENDENCY_RESTORE_V1','nativeExecution':False,'files':result},indent=2)+'\n')
print(json.dumps({'required':len(result),'restored':sum(r['restored'] for r in result),'missing':[r['path'] for r in result if not r['restored']]}))
