from pathlib import Path
import os,json,hashlib
R=Path(__file__).resolve().parents[1];O=Path(__file__).resolve().parent;D=O/'dependencies';pins=json.loads((O/'wrapped-proof-pins.json').read_text())['WRAPPED_CLAIM_PROOF_PIN_SET_V1'];base='omnichain-flat-profile/flat-wallet/experiments/wrapped-claim-proof-artifacts-v1';results=[]
def restore(rows):
 sizes={r['bytes']for r in rows};wanted={r['sha256']for r in rows};found={}
 for directory,dirs,files in os.walk(R):
  dirs[:]=[d for d in dirs if d not in ['wallet-owner-new','node_modules'] and not (Path(directory)/d).is_symlink()]
  for name in files:
   p=Path(directory)/name
   if p.is_symlink()or p.suffix in ['.zip','.gz']or p.stat().st_size not in sizes:continue
   b=p.read_bytes();h=hashlib.sha256(b).hexdigest()
   if h in wanted:found.setdefault(h,p)
 for row in rows:
  rel=Path(row['path']);assert not rel.is_absolute()and'..'not in rel.parts
  src=found.get(row['sha256']);r={**row,'source':str(src)if src else None,'restored':False}
  if src:
   b=src.read_bytes();assert len(b)==row['bytes']and hashlib.sha256(b).hexdigest()==row['sha256'];target=D/rel;target.parent.mkdir(parents=True,exist_ok=True)
   if target.exists():assert target.read_bytes()==b
   else:target.write_bytes(b);target.chmod(0o600)
   r['restored']=True
  results.append(r)
 return [r for r in results if not r['restored']]

input=json.loads((D/'drafts/wrapped-ci-retained-preparation-20261006/input-contract.json').read_text())
rows=[dict(v)for v in input['originalEvidence'].values()]+[dict(v)for v in input['sourceAndToolchainPins']]+[dict(v['archived'])for v in input['originalHostSources']]
for role in ['ci','co']:
 p=next(iter(json.loads((O/(role+'-publication-pins.json')).read_text()).values()));root=p['revalidationRoot'];rows.append({'path':root+'/'+p['revalidationDriver']['path'],'bytes':p['revalidationDriver']['bytes'],'sha256':p['revalidationDriver']['sha256']})
 for name,pin in p['publishedFiles'].items():rows.append({'path':root+'/published/'+name,**pin})
 candidates=list(R.glob('*/'+root+'/launch-checkpoint.json'));source=next((p for p in candidates if hashlib.sha256(p.read_bytes()).hexdigest()==p_hash),None)if False else None
 for candidate in candidates:
  if hashlib.sha256(candidate.read_bytes()).hexdigest()==p['closedCheckpointSHA256']:rows.append({'path':root+'/launch-checkpoint.json','bytes':candidate.stat().st_size,'sha256':p['closedCheckpointSHA256']});break
# Published retained preparation public bundle is explicitly listed by its authenticated archive manifest.
A=R/'lianum-wallet-continuation-source';manifest=json.loads((A/'CONTINUATION-MANIFEST.json').read_text())
for row in manifest['files']:
 if row['path'].startswith('drafts/wrapped-ci-retained-preparation-20261006/published/'):
  rows.append({k:row[k]for k in ['path','bytes','sha256']})
restore(rows)
children=[]
for role in ['ci','co']:
 p=next(iter(json.loads((O/(role+'-publication-pins.json')).read_text()).values()));mf=D/p['revalidationRoot']/p['revalidationDriver']['path']
 if mf.exists():
  for child in json.loads(mf.read_text())['files']:children.append({k:child[k]for k in ['path','bytes','sha256']})
restore(children)
(O/'retained-reader-dependency-restoration.json').write_text(json.dumps({'schema':'EXACT_RETAINED_READER_DEPENDENCY_RESTORE_V1','nativeExecution':False,'files':results},indent=2)+'\n');missing=[r for r in results if not r['restored']];print(json.dumps({'required':len(results),'restored':sum(r['restored']for r in results),'missingCount':len(missing),'missingKinds':list({r['path'].split('/')[0]for r in missing})}))
