from pathlib import Path
import os,json,hashlib,shutil
R=Path(__file__).resolve().parents[1];O=Path(__file__).resolve().parent;D=O/'dependencies';pins=json.loads((O/'deployment-release.json').read_text())['verifiers'];W='omnichain-flat-profile/flat-wallet';H=lambda b:hashlib.sha256(b).hexdigest();pointers=[];records=[];missing=[]
for directory,dirs,files in os.walk(R):
 dirs[:]=[d for d in dirs if d not in ['node_modules','wallet-owner-new','evm-admitted-staged','evm-boundary-staged','combined54-staged','exact-predecessor-1650']and not(Path(directory)/d).is_symlink()]
 if '/proof-workers/relations/'not in directory:continue
 for name in ['compiled.json','prepared.json','stats.json']:
  if name in files:pointers.append(Path(directory)/name)
def put(src,rel,pin=None):
 b=src.read_bytes()
 if pin:assert H(b)==pin
 q=D/rel;q.parent.mkdir(parents=True,exist_ok=True)
 if q.exists():assert q.read_bytes()==b
 else:shutil.copy2(src,q)
 records.append({'path':str(rel),'source':str(src),'bytes':len(b),'sha256':H(b)})
for role in ['authorization','reservation','dependency','ready','settlement','recovery','deposit_intent']:
 line=pins[role]['lineage'];version=line['sourceVersion'];expected={'compiled':line['compiledManifestSHA256'],'prepared':line['keyManifestSHA256']}
 for kind in ['compiled','prepared','stats']:
  candidates=[p for p in pointers if str(p).endswith('/relations/'+role+'/'+version+'/'+kind+'.json')];selected=None
  for p in candidates:
   pointer=json.loads(p.read_text());mf=p.parent/kind/pointer['artifactId']/'manifest.json'
   if pointer['manifestSHA256']==expected[kind]and mf.exists()and H(mf.read_bytes())==expected[kind]:selected=(p,pointer,mf);break
  if selected is None:missing.append({'role':role,'kind':kind,'manifest':expected.get(kind)});break
  p,pointer,mf=selected;manifest=json.loads(mf.read_text());base=Path(W)/'.local/proof-workers/relations'/role/version;put(p,base/(kind+'.json'));put(mf,base/kind/pointer['artifactId']/'manifest.json',expected[kind])
  for filename,field in [('program.json','programSHA256')]if kind=='compiled'else [('key.vk','keySHA256'),('verifier.sol','soliditySHA256')]if kind=='prepared'else []:put(mf.parent/filename,base/kind/pointer['artifactId']/filename,manifest[field])
  cache=p.parent.parents[2]
  for name in ['result.json','resources.json']:
   src=cache/'attempts'/pointer['runId']/name;value=json.loads(src.read_text());assert value['runId']==pointer['runId']and value['phase']=='completed';put(src,Path(W)/'.local/proof-workers/attempts'/pointer['runId']/name)
  if kind=='prepared':expected['stats']=manifest['statsManifestSHA256']
(O/'flat-lineage-restoration.json').write_text(json.dumps({'schema':'EXACT_ORIGINAL_PUBLIC_FLAT_LINEAGE_RESTORE_V1','locksOrClaimsRestored':False,'nativeExecution':False,'files':records,'missing':missing},indent=2)+'\n');print(json.dumps({'records':len(records),'missing':missing}))
