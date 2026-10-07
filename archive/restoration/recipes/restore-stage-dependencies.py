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
rows=[];stages=pins['stageProvenance']
for stage in ['constraints','statistics','preparation','proof']:
 values=[(None,stages[stage])]if stage=='constraints'else list(stages[stage].items())
 for role,v in values:rows.append({'path':base+'/stages/'+stage+('/'+role if role else '')+'/driver-source-manifest.json',**v['driverSourceManifest']})
prep='drafts/wrapped-ci-retained-preparation-20261006';rows.append({'path':prep+'/reader-source-manifest.json',**stages['retainedPreparation']['claim_ingress']['readerSourceManifest']})
rows.extend([{'path':'drafts/wrapped-ci-recovered-consumer-20261006/reader-source-manifest.json','bytes':862,'sha256':'212e74d264abfdcb672291050f53def6e48b26d1eda71e8d8b891f8cb8a5194b'},{'path':'drafts/wrapped-co-recovered-consumer-20261006/reader-source-manifest.json','bytes':676,'sha256':'ec5bbec0246dd5468a1b751f20b0145b87ffb511256ecb22c6fb4038f45403b7'}])
missing=restore(rows);children=[]
for row in rows:
 p=D/row['path']
 if not p.exists():continue
 m=json.loads(p.read_text())
 for child in m['files']:
  if '/stages/'in row['path']:path=str(Path(row['path']).parent/'source'/child['path'])
  elif row['path'].startswith(prep):path=prep+'/'+child['path']
  else:path=child['path']
  children.append({'path':path,'bytes':child['bytes'],'sha256':child['sha256']})
restore(children)
(O/'stage-dependency-restoration.json').write_text(json.dumps({'schema':'EXACT_ARCHIVED_STAGE_DEPENDENCY_RESTORE_V1','nativeExecution':False,'files':results},indent=2)+'\n');print(json.dumps({'required':len(results),'restored':sum(r['restored']for r in results),'missing':[r['path']for r in results if not r['restored']]}))
