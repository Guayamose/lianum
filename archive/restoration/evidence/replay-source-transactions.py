#!/usr/bin/env python3
"""Replay only saved public source, exact frozen preimages, closed inspector first.
No imported project code is executed and no source constants are rewritten.
"""
from pathlib import Path
import hashlib,json,os,stat,shutil
R=Path(__file__).resolve().parents[1]; P=R/'packets'; A=R/'restoration-audit'
V=P/'lianum-source75-public-continuation-v7-20261007'
D=P/'external-durable-source-delta-20261007'
G=P/'original-actor-gate-public-delta-20261007'
C=P/'closed-fresh-lineage1684-public-delta-20261007'
ROOT=R/'source-root'; BASE=R/'exact-predecessor1650'; ACCEPTED=R/'accepted-source1682'
B='omnichain-flat-profile/flat-wallet/integration/wrapped-installation-source-inspector-v2.mjs'
M='drafts/wrapped-activation-installation-v2/source-manifest.json'
def need(v,msg):
 if not v: raise RuntimeError(msg)
def digest(b): return hashlib.sha256(b).hexdigest()
def read(p):
 s=p.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and p.resolve()==p,'regular unaliased single-link file required: '+str(p));return p.read_bytes()
def match(p,row,mode=True):
 raw=read(p);need(len(raw)==row['bytes'] and digest(raw)==row['sha256'],'bytes/hash mismatch: '+str(p))
 if mode and 'mode' in row:need(stat.S_IMODE(p.stat().st_mode)==int(row['mode'],8),'mode mismatch: '+str(p))
 return raw
def relative(root,rel):
 p=Path(rel);need(not p.is_absolute() and '..' not in p.parts,'relative path required');target=root/p;need(target.parent.resolve()==target.parent,'aliased parent');return target
def write(p,b,mode):
 p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_name(p.name+'.restore-source-tmp');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  offset=0
  while offset<len(b): offset+=os.write(fd,b[offset:])
  os.fchmod(fd,mode);os.fsync(fd)
 finally:os.close(fd)
 os.replace(tmp,p)
def load_freeze(p,pin=None):
 raw=read(p)
 if pin:need(len(raw)==pin['bytes'] and digest(raw)==pin['sha256'],'frozen manifest pin mismatch')
 rows=json.loads(raw)['files'];need(len({x['path'] for x in rows})==len(rows),'duplicate freeze rows');return rows,digest(raw)
def verify(root,rows):
 for row in rows:match(relative(root,row['path']),row)
 return len(rows)
def exact_files(root,rows):
 actual={str(p.relative_to(root))for p in root.rglob('*')if p.is_file()};need(actual=={x['path']for x in rows},'unexpected or missing source paths')
def snapshot(src,dst,rows):
 need(not dst.exists(),'snapshot exists: '+str(dst));dst.mkdir()
 for row in rows:write(relative(dst,row['path']),match(relative(src,row['path']),row),int(row['mode'],8))
 verify(dst,rows);exact_files(dst,rows)
report={'schema':'PUBLIC_SOURCE_EXACT_HISTORICAL_REPLAY_V1','nativeRuntimeStarted':False,'proofKeyGenerated':False,'economicEffectsStarted':False,'guardsRewritten':False,'packetValidation':[],'transactions':[]}
for root,name in [(V,'CHECKPOINT-MANIFEST.json'),(D,'external-durable-public-allowlist.json'),(G,'original-actor-gate-public-allowlist.json'),(C,'closed-fresh-lineage1684-public-allowlist.json')]:
 manifest=json.loads(read(root/name));rows=manifest['files']
 for row in rows:match(relative(root,row.get('archivePath',row['path'])),row)
 report['packetValidation'].append({'packet':root.name,'filesVerified':len(rows),'manifestSHA256':digest(read(root/name))})
baseout=V/'proposals-and-evidence/wallet-state-dag-source-closure/output';installed=V/'installed-source75'
installedrows,installedhash=load_freeze(baseout/'freezes/root.json');verify(installed,installedrows);exact_files(installed,installedrows)
baserows,basehash=load_freeze(baseout/'freezes/before.json')
need(not BASE.exists()and not ROOT.exists()and not ACCEPTED.exists(),'restoration target already exists')
BASE.mkdir()
for row in baserows:
 candidates=[baseout/'source-inverse'/row['path'],baseout/'root-inverse'/row['path'],installed/row['path']]
 choices=[]
 for p in candidates:
  if p.exists():
   raw=read(p)
   if len(raw)==row['bytes'] and digest(raw)==row['sha256']:choices.append(raw)
 need(choices,'missing exact1650 preimage: '+row['path']);need(all(x==choices[0]for x in choices),'conflicting preimages');write(relative(BASE,row['path']),choices[0],int(row['mode'],8))
verify(BASE,baserows);exact_files(BASE,baserows);snapshot(BASE,ROOT,baserows)
report['base']={'rows':len(baserows),'freezeSHA256':basehash,'verifiedSource75Rows':len(installedrows),'source75FreezeSHA256':installedhash,'inverseReconstructedExactly':True}
chain=[baseout,D/'external-owner-cycle-source-closure/output',D/'external-durable-bootstrap-source-closure/output',D/'external-recovery-view-source-closure/output',G/'external-preopen-repair-source-closure/output',G/'external-bootstrap-partial-source-closure/output',G/'external-bootstrap-prefix-source-closure/output',C/'closed-fresh-lineage-source-closure/output']
lock=A/'source-lane.lock';lockfd=os.open(lock,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
try:
 for out in chain:
  for stage in ['source','root']:
   txp=out/'transactions'/f'{stage}.json';tx=json.loads(read(txp));need(tx['stage']==stage and tx['runtimeLaunchAllowed'] is False,'transaction schema/authority')
   for k in ['forward','inverse']:
    match(relative(out,tx[k]['path']),tx[k],False)
   before,bh=load_freeze(relative(out,tx['requiredCompletePreimageFreeze']['path']),tx['requiredCompletePreimageFreeze']);after,ah=load_freeze(relative(out,tx['requiredCompleteAfterimageFreeze']['path']),tx['requiredCompleteAfterimageFreeze']);verify(ROOT,before);exact_files(ROOT,before)
   old={r['path']:r for r in before};new={r['path']:r for r in after};files=tx['files'];need(len({r['path']for r in files})==len(files),'duplicate transaction path');pred={k:dict(v) for k,v in old.items()};raws={}
   for f in files:
    rel=f['path'];need(f['before']==({k:old[rel][k]for k in ['bytes','sha256','mode']}if rel in old else None),'transaction preimage row mismatch')
    if f['before']:match(relative(ROOT,rel),f['before'])
    else:need(not relative(ROOT,rel).exists(),'new path already present')
    need(f['after'] is not None,'source deletion not authorized');raws[rel]=match(relative(out/stage+'-candidate' if False else out/(stage+'-candidate'),rel),f['after']);pred[rel]={'path':rel,**f['after']}
   need(set(pred)==set(new)and all(all(pred[p][k]==new[p][k]for k in ['path','bytes','sha256','mode'])for p in pred),'transaction does not reproduce whole afterimage')
   if stage=='source':
    need(B in raws and b'const APPROVED_WRAPPED_INSTALLATION_MANIFEST_SHA256_V2 = null;' in raws[B],'closed inspector required first');order=[B]+sorted(set(raws)-{B})
   else:
    need(set(raws)=={M,B},'root transaction must be manifest then inspector');order=[M,B]
   # Full preimages rechecked immediately before closed-first write.
   verify(ROOT,before)
   for rel in order:write(relative(ROOT,rel),raws[rel],int(new[rel]['mode'],8))
   verify(ROOT,after);exact_files(ROOT,after)
   record={'closure':out.parent.name,'stage':stage,'transactionSHA256':digest(read(txp)),'beforeRows':len(before),'afterRows':len(after),'beforeFreezeSHA256':bh,'afterFreezeSHA256':ah,'filesChanged':len(files),'exactPreimagesVerified':True,'allPostimageBytesHashesModesVerified':True,'inspectorClosedFirst':stage=='source','manifestThenInspectorLast':stage=='root'};report['transactions'].append(record);print(json.dumps(record),flush=True)
  if out==chain[-2]:snapshot(ROOT,ACCEPTED,after)
 report['final']={'sourceRoot':str(ROOT),'rows':len(after),'freezeSHA256':ah,'totalSourceBytes':sum(r['bytes']for r in after),'allBytesHashesModesVerified':True,'noExtraSourceFiles':True}
 resources=json.loads(read(D/'external-defi-adapters/canonical-router-manifest.json'))['resourceFiles'];missing=[]
 for row in resources:
  path=relative(D/'external-defi-adapters/canonical-router-candidate',row['path'])
  if path.exists():match(path,row,False)
  else:missing.append(row['path'])
 report['canonicalRouterResources']={'entries':len(resources),'verified':len(resources)-len(missing),'missing':missing,'installedIntoSourceRoot':False}
 admissions=[]
 for row in after:
  if 'admission' in row['path'] and ('fresh' in row['path'] or 'lineage' in row['path']):
   admissions.append({'path':row['path'],'sha256':row['sha256'],'text':read(ROOT/row['path']).decode()})
 report['newAdmissions']=admissions
 write(A/'source-restoration-receipt.json',(json.dumps(report,indent=2)+'\n').encode(),0o644)
 print(json.dumps({'completed':True,'final':report['final'],'resourceVerification':report['canonicalRouterResources'],'receipt':str(A/'source-restoration-receipt.json')}),flush=True)
finally:
 os.close(lockfd)
 # Keep lock as completed audit evidence; no other source writer was admitted.
