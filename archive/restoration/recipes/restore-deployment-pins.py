from pathlib import Path
import json,hashlib,os,shutil
R=Path(__file__).resolve().parents[1];O=Path(__file__).resolve().parent;D=O/'dependencies';T=R/'evm-admitted-staged';v=json.loads((O/'deployment-release.json').read_text());rows=[]
roots={'golden/':'omnichain-product/','candidate/':'omnichain-flat-profile/candidate-poseidon/','flat/':'omnichain-flat-profile/','admission-prepared/':'drafts/native-value-verifier-preparation/','admission-compile/':'drafts/generic-native-admission-compile/'}
def walk(x):
 if isinstance(x,dict):
  if 'path'in x and 'sha256'in x:
   raw=x['path'];prefix=next((k for k in roots if raw.startswith(k)),None);rel=roots[prefix]+raw[len(prefix):]if prefix else 'omnichain-flat-profile/flat-wallet/'+raw;assert not Path(rel).is_absolute()and'..'not in Path(rel).parts;rows.append({'path':rel,'sha256':x['sha256']})
  for a in x.values():walk(a)
 elif isinstance(x,list):
  for a in x:walk(a)
walk(v);missing=[];results=[]
for row in rows:
 p=T/row['path']
 if p.exists():assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256'];results.append({**row,'existing':True})
 else:missing.append(row)
wanted={r['sha256']for r in missing};names={Path(r['path']).name for r in missing};found={}
for directory,dirs,files in os.walk(R):
 dirs[:]=[d for d in dirs if d not in ['node_modules','wallet-owner-new','exact-predecessor-1650'] and not(Path(directory)/d).is_symlink()]
 for name in files:
  if name not in names:continue
  p=Path(directory)/name
  if p.is_symlink()or p.stat().st_size>128*1024*1024:continue
  b=p.read_bytes();h=hashlib.sha256(b).hexdigest()
  if h in wanted:found.setdefault(h,p)
for row in missing:
 src=found.get(row['sha256']);r={**row,'existing':False,'source':str(src)if src else None,'restored':False}
 if src:
  for root in [D,T]:
   p=root/row['path'];p.parent.mkdir(parents=True,exist_ok=True)
   if p.exists():assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
   else:shutil.copy2(src,p)
  r['restored']=True
 results.append(r)
(O/'deployment-pin-restoration.json').write_text(json.dumps({'schema':'EXACT_PUBLIC_DEPLOYMENT_PIN_RESTORE_V1','nativeExecution':False,'files':results},indent=2)+'\n');print(json.dumps({'total':len(rows),'newRestored':sum(r.get('restored',False)for r in results),'missing':[r['path']for r in results if not r.get('existing')and not r.get('restored')]}))
