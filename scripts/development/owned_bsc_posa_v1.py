#!/usr/bin/env python3
"""Fixed private BSC/Parlia cluster. Preparation is separate from node birth.

No mainnet/independent-operator claim. The three validator keys are public lab
fixtures from the pinned official source. Application custody keys are absent.
"""
import hashlib, json, os, pathlib, re, shutil, signal, socket, stat, subprocess, sys, tarfile, time, urllib.request, uuid

os.umask(0o077)

REPO = pathlib.Path(__file__).resolve().parents[2]
DEPENDENCIES = REPO / ".local/dependencies/bsc-posav1"
MATERIAL = DEPENDENCIES / "public"
PREPARED = DEPENDENCIES / "prepared"
REALMS = REPO / ".local/owned-bsc-posav1"
TOOLS = DEPENDENCIES / "tools"
POETRY = TOOLS / "poetry/bin/poetry"
FORGE = TOOLS / "foundry/forge"
PINS = {
 "poetry-2.3.3-py3-none-any.whl": "dbbbd77c3c2782aed85be6f5cb00e7803d1e36376709d58b80f96686e601290b",
 "foundry_v1.4.3_linux_amd64.tar.gz": "325ba04dc5cb41c110723b00ac291f8269f8cd785028299aad8252ef980961a7",
 "geth-v1.7.8-linux-amd64": "28466c6b6b279e2026ddcfea09ddadd920d2bcf02efab3c854e4bb0d5a3ae534",
 "node-deploy-292c25955807227b8f43e01bdc4ae57b3b884c0e.tar.gz": "2730efb77b45c992540ac10d3d9d742158ea0a293b98cff061ad7b885ff79dc3",
 "bsc-genesis-contract-34618f607f8356cf147dde6a69fae150bd53d5bf.tar.gz": "ab58a5591c7d5b8c7a7feed9547b01ea649094bcb5adc8bfac46788c9034efdb",
}
PROFILE = "OWNED_BSC_POSA_THREE_VALIDATORS_V1"
NATIVE_GENESIS_SEED = "import hashlib,json,pathlib,re\nfrom web3 import Web3\nroot=pathlib.Path.cwd();artifactPath=root/'out/BSCValidatorSet.sol/BSCValidatorSet.json'\nartifact=json.loads(artifactPath.read_text());genesisPath=root/'genesis-dev.json';genesis=json.loads(genesisPath.read_text())\ndef need(value,code):\n if not value:raise RuntimeError(code)\ndef sha(value):return hashlib.sha256(value).hexdigest()\ndef word(value):return value.to_bytes(32,'big')\ndef slotHash(value):return int.from_bytes(Web3.keccak(word(value)),'big')\nfixtures=[]\nfor line in (root/'validators.conf').read_text().splitlines():\n fields=line.split(',');need(len(fields)==5,'BSC_GENESIS_FIXTURE_SHAPE')\n address,fee,bscfee,power,bls=fields;need(address==fee==bscfee and power=='2000000000000','BSC_GENESIS_FIXTURE_BINDING')\n need(re.fullmatch('0x[0-9a-f]{40}',address) and re.fullmatch('0x[0-9a-f]{96}',bls),'BSC_GENESIS_FIXTURE_KEY')\n fixtures.append({'address':address,'blsPublicKey':bls[2:]})\nneed(len(fixtures)==3 and len({x['address'] for x in fixtures})==3 and len({x['blsPublicKey'] for x in fixtures})==3,'BSC_GENESIS_FIXTURE_COUNT')\nlayout=artifact['storageLayout'];types=layout['types'];variables=[x for x in layout['storage'] if x['label']=='validatorExtraSet']\nneed(len(variables)==1 and variables[0]['offset']==0,'BSC_GENESIS_EXTRA_LAYOUT')\narray=types[variables[0]['type']];need(array['encoding']=='dynamic_array' and int(array['numberOfBytes'])==32,'BSC_GENESIS_ARRAY_LAYOUT')\nentry=types[array['base']];need(entry['encoding']=='inplace','BSC_GENESIS_STRUCT_LAYOUT')\nsize=int(entry['numberOfBytes']);need(size%32==0 and 0<size<=2048,'BSC_GENESIS_STRUCT_BOUND');stride=size//32\nmembers=entry['members'];need([x['label'] for x in members]==['enterMaintenanceHeight','isMaintaining','voteAddress','slots'],'BSC_GENESIS_STRUCT_FIELDS')\nvote=next(x for x in members if x['label']=='voteAddress');voteType=types[vote['type']]\nneed(vote['offset']==0 and voteType['encoding']=='bytes' and int(voteType['numberOfBytes'])==32,'BSC_GENESIS_BLS_LAYOUT')\naddress='0x'+'0'*36+'1000';contract=genesis['alloc'][address];bytecode=artifact['deployedBytecode']['object']\nneed(contract['code'].removeprefix('0x')==bytecode.removeprefix('0x'),'BSC_GENESIS_ORIGINAL_BYTECODE')\noriginalCodes={key:sha(bytes.fromhex(row['code'].removeprefix('0x'))) for key,row in genesis['alloc'].items() if row.get('code')}\nneed(len(originalCodes)==17 and 'storage' not in contract,'BSC_GENESIS_ORIGINAL_STORAGE')\narraySlot=int(variables[0]['slot']);storage={}\ndef store(slot,value):\n key='0x'+word(slot).hex();need(key not in storage,'BSC_GENESIS_SLOT_OVERLAP');storage[key]='0x'+word(value).hex()\nstore(arraySlot,3);base=slotHash(arraySlot)\nfor index,fixture in enumerate(fixtures):\n slot=base+index*stride+int(vote['slot']);data=bytes.fromhex(fixture['blsPublicKey']);need(len(data)==48,'BSC_GENESIS_BLS_BYTES')\n store(slot,len(data)*2+1);location=slotHash(slot)\n for offset in range(0,len(data),32):store(location+offset//32,int.from_bytes(data[offset:offset+32].ljust(32,bytes(1)),'big'))\n # Roundtrip the original Solidity long-bytes storage rule from the actual member slot.\n need((int(storage['0x'+word(slot).hex()],16)-1)//2==48,'BSC_GENESIS_BLS_LENGTH')\n decoded=b''.join(bytes.fromhex(storage['0x'+word(location+i).hex()][2:]) for i in range(2))[:48]\n need(decoded==data,'BSC_GENESIS_BLS_ROUNDTRIP')\ncontract['storage']=storage\n# Post-upgrade native local genesis. Epoch/period/quorum and the client itself are unchanged.\nfor key,value in genesis['config'].items():\n if key.endswith('Block') and value is not None:genesis['config'][key]=0\nneed(genesis['config']['lubanBlock']==0 and genesis['config']['platoBlock']==0 and genesis['config']['bohrTime']==0,'BSC_GENESIS_FORK_BINDING')\nordered=sorted(fixtures,key=lambda x:x['address'])\nextra=bytes(32)+bytes([3])+b''.join(bytes.fromhex(x['address'][2:]+x['blsPublicKey']) for x in ordered)+bytes([1])+bytes(65)\nneed(len(extra)==303,'BSC_GENESIS_HEADER_LENGTH');genesis['extraData']='0x'+extra.hex()\nneed({key:sha(bytes.fromhex(row['code'].removeprefix('0x'))) for key,row in genesis['alloc'].items() if row.get('code')}==originalCodes,'BSC_GENESIS_BYTECODE_CHANGED')\nencoded=json.dumps(genesis,sort_keys=True,separators=(',',':')).encode();genesisPath.write_bytes(encoded)\nreceipt={'schema':'BSC_NATIVE_BLS_GENESIS_SEED_V1','validatorFixtures':fixtures,'layoutSHA256':sha(json.dumps(layout,sort_keys=True,separators=(',',':')).encode()),'validatorContractSHA256':originalCodes[address],'allOriginalSystemCodeSHA256':originalCodes,'genesisSHA256':sha(encoded),'seededArraySlot':str(arraySlot),'seededVoteMemberSlot':vote['slot'],'seededStructWords':stride,'nativeHeaderBytes':len(extra),'epochUnchanged':genesis['config']['parlia'],'runtimeFinalityEstablished':False}\n(root/'native-genesis-seed.json').write_text(json.dumps(receipt,sort_keys=True,separators=(',',':')))\n"
URLS = {
 "poetry-2.3.3-py3-none-any.whl": ("https://files.pythonhosted.org/packages/e8/5b/42155e6422cb2ad99236e5c3f296137ef8c8f9f96425ba9f773b899792c0/poetry-2.3.3-py3-none-any.whl", 288745),
 "foundry_v1.4.3_linux_amd64.tar.gz": ("https://github.com/foundry-rs/foundry/releases/download/v1.4.3/foundry_v1.4.3_linux_amd64.tar.gz", 73527068),
 "geth-v1.7.8-linux-amd64": ("https://github.com/bnb-chain/bsc/releases/download/v1.7.8/geth_linux", 117031176),
 "node-deploy-292c25955807227b8f43e01bdc4ae57b3b884c0e.tar.gz": ("https://codeload.github.com/bnb-chain/node-deploy/tar.gz/292c25955807227b8f43e01bdc4ae57b3b884c0e", 110455),
 "bsc-genesis-contract-34618f607f8356cf147dde6a69fae150bd53d5bf.tar.gz": ("https://codeload.github.com/bnb-chain/bsc-genesis-contract/tar.gz/34618f607f8356cf147dde6a69fae150bd53d5bf", 476758),
}
PREPARATION_SECONDS = 900
NATIVE_INITIALIZATION_SECONDS = 30
NATIVE_INITIALIZATION_COMMAND_SECONDS = 15
NATIVE_FINALITY_STARTUP_SECONDS = 90


def require(condition, code):
 if not condition: raise RuntimeError(code)

def digest(b): return hashlib.sha256(b).hexdigest()
def private_file(path, cap):
 s=path.lstat();require(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and not(s.st_mode&0o077) and s.st_size<=cap,"BSC_PRIVATE_FILE")
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  before=os.fstat(fd);b=os.read(fd,cap+1);after=os.fstat(fd)
  require(before.st_ino==after.st_ino and before.st_size==after.st_size==len(b) and len(b)<=cap,"BSC_PRIVATE_CHANGED")
  return b
 finally:os.close(fd)
def write(path,b,mode=0o600):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:f.write(b);f.flush();os.fsync(f.fileno())
 finally:os.close(fd)
def directory(path):path.mkdir(mode=0o700,parents=True,exist_ok=False)
def extract(path,dest):
 directory(dest);total=0
 with tarfile.open(path,'r:gz') as archive:
  for member in archive.getmembers():
   parts=pathlib.PurePosixPath(member.name).parts[1:]
   if not parts and member.isdir():continue
   require(parts and all(x not in ('..','') for x in parts) and not member.issym() and not member.islnk(),"BSC_ARCHIVE_PATH")
   target=dest.joinpath(*parts)
   if member.isdir():target.mkdir(mode=0o700,parents=True,exist_ok=True);continue
   require(member.isfile() and member.size<=8*1024*1024,"BSC_ARCHIVE_KIND")
   total+=member.size;require(total<=64*1024*1024,"BSC_ARCHIVE_BUDGET")
   target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
   with archive.extractfile(member) as f:b=f.read(member.size+1)
   require(len(b)==member.size,"BSC_ARCHIVE_LENGTH");write(target,b)
def private_directory(path):
 path.mkdir(mode=0o700,parents=True,exist_ok=True)
 actual=path.lstat()
 require(stat.S_ISDIR(actual.st_mode) and actual.st_uid==os.getuid() and (actual.st_mode&0o777)==0o700 and path.resolve()==path,"BSC_PRIVATE_DIRECTORY")
def sync_directory(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def fetch_material():
 private_directory(DEPENDENCIES);private_directory(MATERIAL)
 for name,(url,size) in URLS.items():
  path=MATERIAL/name
  if path.exists():
   require(digest(private_file(path,size))==PINS[name] and path.stat().st_size==size,"BSC_MATERIAL_SHA");continue
  temporary=MATERIAL/(".download-"+str(uuid.uuid4()));total=0;hashed=hashlib.sha256()
  try:
   with urllib.request.urlopen(url,timeout=30) as response,temporary.open('xb') as file:
    temporary.chmod(0o600)
    while True:
     chunk=response.read(1024*1024)
     if not chunk:break
     total+=len(chunk);require(total<=size,"BSC_MATERIAL_BOUND");hashed.update(chunk);file.write(chunk)
    file.flush();os.fsync(file.fileno())
   require(total==size and hashed.hexdigest()==PINS[name],"BSC_MATERIAL_SHA")
   os.link(temporary,path,follow_symlinks=False);temporary.unlink();sync_directory(MATERIAL)
  finally:
   if temporary.exists():temporary.unlink()
 print(json.dumps({'materialReady':True,'profile':PROFILE,'files':len(URLS)}))
def prepare_command(args,cwd,log,deadline,env=None):
 remaining=deadline-time.monotonic();require(remaining>0,"BSC_PREPARATION_TIMEOUT")
 with log.open('ab') as f:
  os.chmod(log,0o600)
  r=subprocess.run(args,cwd=cwd,stdin=subprocess.DEVNULL,stdout=f,stderr=f,timeout=remaining,check=False,env=env)
 require(r.returncode==0,"BSC_PREPARATION_COMMAND_FAILED")
def prepare_tools():
 private_directory(DEPENDENCIES);private_directory(MATERIAL);private_directory(TOOLS)
 deadline=time.monotonic()+PREPARATION_SECONDS;log=TOOLS/'prepare.private.log'
 wheel=MATERIAL/'poetry-2.3.3-py3-none-any.whl';archive=MATERIAL/'foundry_v1.4.3_linux_amd64.tar.gz'
 require(digest(private_file(wheel,1024*1024))==PINS[wheel.name],"BSC_POETRY_MATERIAL_SHA")
 require(digest(private_file(archive,128*1024*1024))==PINS[archive.name],"BSC_FOUNDRY_MATERIAL_SHA")
 require(not (TOOLS/'poetry').exists() and not (TOOLS/'foundry').exists(),"BSC_TOOLS_ALREADY_PRESENT")
 prepare_command([sys.executable,'-m','venv',str(TOOLS/'poetry')],TOOLS,log,deadline)
 prepare_command([str(TOOLS/'poetry/bin/python'),'-m','pip','install','--only-binary=:all:',str(wheel)],TOOLS,log,deadline)
 directory(TOOLS/'foundry')
 with tarfile.open(archive,'r:gz') as source:
  entries=[m for m in source.getmembers() if m.name=='forge']
  require(len(entries)==1 and entries[0].isfile() and entries[0].size<=128*1024*1024,"BSC_FOUNDRY_ARCHIVE")
  with source.extractfile(entries[0]) as file:body=file.read(entries[0].size+1)
  require(len(body)==entries[0].size,"BSC_FOUNDRY_LENGTH");write(FORGE,body,0o700)
 receipt={'poetryVersion':'2.3.3','poetryWheelSHA256':PINS[wheel.name],'forgeVersion':'1.4.3','forgeArchiveSHA256':PINS[archive.name],'forgeSHA256':digest(body)}
 write(TOOLS/'receipt.json',json.dumps(receipt,sort_keys=True,separators=(',',':')).encode());sync_directory(TOOLS)
 print(json.dumps({'toolsReady':True,'profile':PROFILE}))
def stop_original(process,owned):
 if same_process(process,owned):process.send_signal(signal.SIGTERM)
 try:process.wait(timeout=5)
 except subprocess.TimeoutExpired:
  require(same_process(process,owned),"BSC_ORIGINAL_PROCESS_CHANGED")
  process.kill();process.wait(timeout=5)
def native_command(args,cwd,log,deadline):
 remaining=min(NATIVE_INITIALIZATION_COMMAND_SECONDS,deadline-time.monotonic())
 require(remaining>0,"BSC_NATIVE_INITIALIZATION_TIMEOUT")
 with log.open('ab') as file:
  os.chmod(log,0o600)
  process=subprocess.Popen(args,cwd=cwd,stdin=subprocess.DEVNULL,stdout=file,stderr=file,start_new_session=True)
  owned=identity(process.pid)
  try:
   try:code=process.wait(timeout=remaining)
   except subprocess.TimeoutExpired:raise RuntimeError('BSC_NATIVE_INITIALIZATION_TIMEOUT')
   require(code==0,"BSC_NATIVE_INITIALIZATION_FAILED")
  finally:
   if process.poll() is None:stop_original(process,owned)
def prepare():
 private_directory(DEPENDENCIES);private_directory(MATERIAL)
 deadline=time.monotonic()+PREPARATION_SECONDS
 for tool in ['npm','go']:
  require(shutil.which(tool) is not None,"BSC_PREPARATION_TOOL_"+tool.upper()+"_MISSING")
 require(POETRY.exists() and FORGE.exists(),"BSC_PRIVATE_TOOLS_NOT_PREPARED")
 toolReceipt=json.loads(private_file(TOOLS/'receipt.json',8192))
 require(toolReceipt['poetryVersion']=='2.3.3' and toolReceipt['forgeVersion']=='1.4.3' and digest(private_file(FORGE,128*1024*1024))==toolReceipt['forgeSHA256'],"BSC_PRIVATE_TOOLS_CHANGED")
 env=dict(os.environ);env.update({'PATH':str(FORGE.parent)+':'+str(POETRY.parent)+':'+os.environ.get('PATH',''),'POETRY_VIRTUALENVS_IN_PROJECT':'true','POETRY_CACHE_DIR':str(TOOLS/'poetry-cache'),'GOTOOLCHAIN':'go1.24.0','GOPATH':str(TOOLS/'go'),'GOMODCACHE':str(TOOLS/'go/pkg/mod'),'GOCACHE':str(TOOLS/'go-build-cache'),'SVM_HOME':str(TOOLS/'solc')})
 require(not PREPARED.exists(),"BSC_MATERIAL_ALREADY_PREPARED")
 for name,h in PINS.items():require(digest(private_file(MATERIAL/name,128*1024*1024))==h,"BSC_MATERIAL_SHA")
 work=PREPARED.parent/(".bsc-build-"+str(uuid.uuid4()));directory(work)
 deploy=work/'deploy';gen=work/'genesis';extract(MATERIAL/'node-deploy-292c25955807227b8f43e01bdc4ae57b3b884c0e.tar.gz',deploy);extract(MATERIAL/'bsc-genesis-contract-34618f607f8356cf147dde6a69fae150bd53d5bf.tar.gz',gen)
 validators=[]
 for i in range(3):
  rows=list((deploy/f'keys/validator{i}/keystore').glob('*'));bls=list((deploy/f'keys/bls{i}/bls/keystore').glob('*'))
  require(len(rows)==len(bls)==1,"BSC_VALIDATOR_FILES")
  a=json.loads(private_file(rows[0],8192))['address'];v=json.loads(private_file(bls[0],8192))['pubkey']
  require(re.fullmatch('[0-9a-fA-F]{40}',a) and re.fullmatch('[0-9a-fA-F]{96}',v),"BSC_VALIDATOR_IDENTITY")
  validators.append({'address':'0x'+a.lower(),'blsPublicKey':v.lower()})
 require(len({x['address'] for x in validators})==3 and len({x['blsPublicKey'] for x in validators})==3,"BSC_VALIDATOR_DUPLICATE")
 write(gen/'validators.conf',(''.join(f"{x['address']},{x['address']},{x['address']},2000000000000,0x{x['blsPublicKey']}\n" for x in validators)).encode())
 # Compile every system contract; unit tests are not part of genesis generation.
 toml=(gen/'foundry.toml').read_text().replace("test = 'test'","test = 'recipe-no-tests'").replace("script = 'foundry-script'","script = 'recipe-no-scripts'").replace("bytecode_hash = 'none'","bytecode_hash = 'none'\nextra_output = ['storageLayout']").replace('ffi = true','ffi = false')
 (gen/'foundry.toml').write_text(toml)
 log=work/'prepare.private.log'
 prepare_command(['npm','ci','--ignore-scripts'],gen,log,deadline,env)
 prepare_command([str(POETRY),'install','--no-root'],gen,log,deadline,env)
 # The official generator inserts protector CLI arguments directly as Solidity
 # address literals. Convert the SAME fixture address with its own Web3 port;
 # casing changes the literal spelling only, never the 20-byte authority.
 checksumPath=work/'protector-checksum.json'
 checksumScript="import json,os,pathlib,sys;from web3 import Web3;value=Web3.to_checksum_address(sys.argv[1]);path=pathlib.Path(sys.argv[2]);file=path.open('x');json.dump({'address':value},file,separators=(',',':'));file.flush();os.fsync(file.fileno());file.close()"
 prepare_command([str(POETRY),'run','python','-c',checksumScript,validators[0]['address'],str(checksumPath)],gen,log,deadline,env)
 protector=json.loads(private_file(checksumPath,256))
 require(set(protector)=={'address'} and isinstance(protector['address'],str) and re.fullmatch('0x[0-9a-fA-F]{40}',protector['address']) and protector['address'].lower()==validators[0]['address'],"BSC_ORIGINAL_PROTECTOR_CHANGED")
 protectorAddress=protector['address']
 prefix=[str(POETRY),'run','python','-m','scripts.generate']
 prepare_command(prefix+['generate-validators'],gen,log,deadline,env)
 prepare_command(prefix+['generate-init-holders',','.join(x['address'] for x in validators)],gen,log,deadline,env)
 prepare_command(prefix+['dev','--dev-chain-id','714','--init-burn-ratio','1000','--init-felony-slash-scope','60','--breathe-block-interval','10 minutes','--block-interval','3 seconds','--stake-hub-protector',protectorAddress,'--unbond-period','2 minutes','--downtime-jail-time','2 minutes','--felony-jail-time','3 minutes','--init-voting-period','2 minutes / BLOCK_INTERVAL','--init-min-period-after-quorum','uint64(1 minutes / BLOCK_INTERVAL)','--governor-protector',protectorAddress,'--init-minimal-delay','1 minutes','--token-recover-portal-protector',protectorAddress],gen,log,deadline,env)
 seed=work/'seed-native-genesis.py';write(seed,NATIVE_GENESIS_SEED.encode())
 prepare_command([str(POETRY),'run','python',str(seed)],gen,log,deadline,env)
 genesis=(gen/'genesis-dev.json').read_bytes();g=json.loads(genesis)
 ordered=sorted(validators,key=lambda value:value['address'])
 expected='0x'+'00'*32+'03'+''.join(x['address'][2:]+x['blsPublicKey'] for x in ordered)+'01'+'00'*65
 require(g['config']['chainId']==714 and isinstance(g['config'].get('parlia'),dict) and g['extraData'].lower()==expected,"BSC_GENESIS_VALIDATORS")
 seedReceipt=json.loads(private_file(gen/'native-genesis-seed.json',16384));require(seedReceipt['validatorFixtures']==validators and seedReceipt['genesisSHA256']==digest(genesis),"BSC_GENESIS_SEED_JOIN")
 require(sum(bool(x.get('code')) for x in g['alloc'].values())==17,"BSC_SYSTEM_CONTRACTS")
 prepare_command(['go','build','-mod=readonly','-trimpath','-o',str(work/'create-validator'),'.'],deploy/'create-validator',log,deadline,env)
 staged=work/'prepared';directory(staged);write(staged/'genesis.json',genesis)
 write(staged/'geth',private_file(MATERIAL/'geth-v1.7.8-linux-amd64',128*1024*1024),0o700)
 write(staged/'create-validator',private_file(work/'create-validator',128*1024*1024),0o700)
 shutil.copytree(deploy/'keys',staged/'keys')
 for p in (staged/'keys').rglob('*'):p.chmod(0o700 if p.is_dir() else 0o600)
 receipt={'profile':PROFILE,'clientVersion':'1.7.8','clientSHA256':PINS['geth-v1.7.8-linux-amd64'],'stakeHubRegistrarSHA256':digest(private_file(staged/'create-validator',128*1024*1024)), 'toolchain':toolReceipt,'nativeGenesis':seedReceipt,'genesisSHA256':digest(genesis),'genesisBytes':len(genesis),'chainId':714,'validators':validators,'material':PINS,'scope':'local-parlia-fast-finality-only','independentOperators':False}
 write(staged/'receipt.json',json.dumps(receipt,sort_keys=True,separators=(',',':')).encode())
 for file in staged.rglob('*'):
  if file.is_file():
   fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW)
   try:os.fsync(fd)
   finally:os.close(fd)
  elif file.is_dir():sync_directory(file)
 sync_directory(staged);require(not PREPARED.exists(),"BSC_MATERIAL_ALREADY_PREPARED");os.rename(staged,PREPARED);sync_directory(DEPENDENCIES)
 print(json.dumps({'prepared':True,'profile':PROFILE,'genesisSHA256':receipt['genesisSHA256']}))

def identity(pid):
 raw=pathlib.Path(f'/proc/{pid}/stat').read_text();parts=raw[raw.rfind(')')+2:].split()
 return {'pid':pid,'startTicks':parts[19],'pgrp':int(parts[2]),'session':int(parts[3]),'uid':pathlib.Path(f'/proc/{pid}').stat().st_uid}
def same_process(p,owned):
 try:return p.poll() is None and identity(p.pid)==owned
 except FileNotFoundError:return False

def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def rpc(url,method,params):
 body=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode()
 req=urllib.request.Request(url,data=body,headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=3) as r:b=r.read(8*1024*1024+1)
 require(len(b)<=8*1024*1024,"BSC_RPC_BOUND");value=json.loads(b)
 # The original native client reports missing finality with this fixed error.
 # Absence is pending only; readiness still requires actual finalized blocks.
 if method=='eth_getBlockByNumber' and params==['finalized',False] and value.get('id')==1 and 'result' not in value and value.get('error')=={'code':-32000,'message':'finalized block not found'}:return None
 # Geth v1.7.8 returns this exact closed error while its receipt index is
 # catching up. This is missing evidence, never a successful registration.
 if method=='eth_getTransactionReceipt' and len(params)==1 and isinstance(params[0],str) and re.fullmatch('0x[0-9a-f]{64}',params[0]) and value.get('id')==1 and 'result' not in value and value.get('error')=={'code':-32000,'message':'transaction indexing is in progress','data':'transaction indexing is in progress'}:return None
 require(value.get('id')==1 and 'error' not in value and 'result' in value,"BSC_RPC_REJECTED")
 return value['result']
def serve():
 require(PREPARED.exists(),"BSC_MATERIAL_NOT_PREPARED");private_directory(DEPENDENCIES);private_directory(PREPARED)
 receipt=json.loads(private_file(PREPARED/'receipt.json',16384));require(receipt['profile']==PROFILE and receipt['material']==PINS,"BSC_PREPARED_PROFILE")
 require(digest(private_file(PREPARED/'geth',128*1024*1024))==receipt['clientSHA256'] and digest(private_file(PREPARED/'genesis.json',1024*1024))==receipt['genesisSHA256'],"BSC_PREPARED_CHANGED")
 require(digest(private_file(PREPARED/'create-validator',128*1024*1024))==receipt['stakeHubRegistrarSHA256'],"BSC_REGISTRAR_CHANGED")
 private_directory(REALMS);realm=REALMS/str(uuid.uuid4());directory(realm)
 nodes=[];broadcasts=set()
 parent=identity(os.getppid());initializationDeadline=time.monotonic()+NATIVE_INITIALIZATION_SECONDS
 def parent_alive():
  require(os.getppid()==parent["pid"] and identity(parent["pid"])==parent,"BSC_ORIGINAL_PARENT_EXITED")
 def interrupted(signum,frame):raise SystemExit(128+signum)
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
 try:
  p2p=port();require(p2p<65533,"BSC_PORT_RANGE")
  config=realm/'config.toml'
  write(config,b'[Eth]\nNetworkId = 714\nSyncMode = "full"\n[Eth.Miner]\nGasCeil = 35000000\nGasPrice = 1000000000\n[Node]\nIPCPath = "geth.ipc"\nInsecureUnlockAllowed = true\n[Node.P2P]\nMaxPeers = 8\nNoDiscovery = true\n')
  for i in range(3):
   d=realm/f'node{i}';directory(d);directory(d/'geth')
   shutil.copytree(PREPARED/f'keys/validator{i}/keystore',d/'keystore');shutil.copytree(PREPARED/f'keys/bls{i}/bls',d/'bls')
   for copied in d.rglob('*'):copied.chmod(0o700 if copied.is_dir() else 0o600)
   write(d/'geth/nodekey',private_file(PREPARED/f'keys/validator-nodekey{i}',512))
   write(d/'password.txt',private_file(PREPARED/'keys/password.txt',512))
  binary=str(PREPARED/'geth');native_command([binary,'init-network','--init.dir',str(realm),'--init.size=3','--init.p2p-port',str(p2p),'--config',str(config),str(PREPARED/'genesis.json')],realm,realm/'init.private.log',initializationDeadline)
  for i in range(3):
   d=realm/f'node{i}';cfg=d/'config.toml';require(cfg.exists(),"BSC_GENERATED_CONFIG")
   text=cfg.read_text();cfg.write_text('\n'.join(x for x in text.splitlines() if '"<nil>"' not in x)+'\n');cfg.chmod(0o600)
   native_command([binary,'--datadir',str(d),'init','--state.scheme','path','--db.engine','pebble',str(PREPARED/'genesis.json')],realm,realm/'init.private.log',initializationDeadline)
   http=port();args=[binary,'--config',str(cfg),'--datadir',str(d),'--nodekey',str(d/'geth/nodekey'),'--nodiscover','--nat','none','--ipcdisable','--http','--http.addr','127.0.0.1','--http.port',str(http),'--http.api','eth,net,web3','--http.vhosts','localhost,127.0.0.1','--allow-insecure-unlock','--mine','--vote','--unlock',receipt['validators'][i]['address'],'--miner.etherbase',receipt['validators'][i]['address'],'--password',str(d/'password.txt'),'--blspassword',str(d/'password.txt'),'--gcmode','archive','--syncmode','full']
   log=open(d/'node.private.log','xb');os.chmod(d/'node.private.log',0o600)
   process=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
   owned=identity(process.pid);nodes.append((process,owned,f'http://127.0.0.1:{http}',log))
   require(pathlib.Path(f'/proc/{process.pid}/exe').resolve()==PREPARED/'geth',"BSC_ORIGINAL_EXECUTABLE_CHANGED")
   print(json.dumps({'ownedBirth':True,'profile':PROFILE,'originalParent':parent,'ownedProcesses':[identity for child,identity,url,file in nodes]}),flush=True)
  deadline=time.monotonic()+NATIVE_FINALITY_STARTUP_SECONDS
  # Official StakeHub registrations use only the public lab validator keys.
  # Each exact fixture transaction is admitted once before the runtime exists.
  while True:
   parent_alive()
   require(all(same_process(p,i) for p,i,u,l in nodes),"BSC_NODE_EXITED")
   try:
    if all(rpc(u,'eth_chainId',[])=='0x2ca' and rpc(u,'eth_getBlockByNumber',['latest',False]) is not None for p,i,u,l in nodes):break
   except OSError:pass
   require(time.monotonic()<deadline,"BSC_FINALITY_STARTUP_TIMEOUT");time.sleep(.2)
  registrationHashes=[]
  for index in range(3):
   parent_alive();log=realm/f'register{index}.private.log'
   native_command([str(PREPARED/'create-validator'),'--consensus-key-dir',str(PREPARED/f'keys/validator{index}'),'--vote-key-dir',str(PREPARED/f'keys/bls{index}'),'--password-path',str(PREPARED/'keys/password.txt'),'--amount','20001','--validator-desc',f'Val{index}','--rpc-url',nodes[0][2]],realm,log,deadline)
   matches=re.findall(rb'send createValidator\. Tx hash: (0x[0-9a-fA-F]{64})',private_file(log,16384))
   require(len(matches)==1,"BSC_STAKEHUB_TRANSACTION_UNRESOLVED");registrationHashes.append(matches[0].decode().lower())
  while True:
   parent_alive()
   require(all(same_process(p,i) for p,i,u,l in nodes),"BSC_NODE_EXITED")
   try:
    require(all(rpc(u,'eth_chainId',[])=='0x2ca' for p,i,u,l in nodes),"BSC_CHAIN_ID")
    blocks=[rpc(u,'eth_getBlockByNumber',['finalized',False]) for p,i,u,l in nodes]
    registrations=[rpc(nodes[0][2],'eth_getTransactionReceipt',[h]) for h in registrationHashes]
    require(all(r is None or r['status']=='0x1' for r in registrations),"BSC_STAKEHUB_TRANSACTION_FAILED")
    if all(b is not None and int(b['number'],16)>0 for b in blocks) and all(r is not None and int(r['blockNumber'],16)<=min(int(b['number'],16) for b in blocks) for r in registrations):
     genesis=[rpc(u,'eth_getBlockByNumber',['0x0',False]) for p,i,u,l in nodes]
     require(len({g['hash'] for g in genesis})==1,"BSC_GENESIS_CONFLICT");break
   except OSError:pass
   require(time.monotonic()<deadline,"BSC_FINALITY_STARTUP_TIMEOUT");time.sleep(.2)
  require(digest(private_file(PREPARED/'geth',128*1024*1024))==receipt['clientSHA256'],"BSC_PREPARED_CHANGED")
  print(json.dumps({'ready':True,'profile':PROFILE,'chainId':714,'genesisSHA256':receipt['genesisSHA256'],'ownedProcesses':[i for p,i,u,l in nodes],'originalParent':parent}),flush=True)
  for line in sys.stdin:
   require(len(line)<=262144,"BSC_COMMAND_BOUND");q=json.loads(line);require(set(q)=={'id','operation','input'} and isinstance(q['id'],int),"BSC_COMMAND_SHAPE")
   try:
    require(all(same_process(p,i) for p,i,u,l in nodes),"BSC_NODE_CHANGED")
    op=q['operation'];data=q['input']
    if op=='close':print(json.dumps({'id':q['id'],'result':{'closing':True}}),flush=True);break
    if op=='finalized':
     require(data is None,"BSC_READ_INPUT");heads=[rpc(u,'eth_getBlockByNumber',['finalized',False]) for p,i,u,l in nodes]
     require(all(h and re.fullmatch('0x[0-9a-f]{64}',h['hash']) for h in heads),"BSC_FINALITY_MISSING")
     n=min(int(h['number'],16) for h in heads);common=[rpc(u,'eth_getBlockByNumber',[hex(n),False]) for p,i,u,l in nodes]
     require(len({h['hash'] for h in common})==1,"BSC_FINALITY_CONFLICT")
     out={'blockNumber':str(n),'blockHash':common[0]['hash'],'timestamp':str(int(common[0]['timestamp'],16)),'finality':'bsc-native-finalized','validatorCount':3,'independentOperators':False}
    elif op=='broadcast':
     require(isinstance(data,str) and re.fullmatch('0x[0-9a-f]+',data) and len(data)%2==0 and len(data)<=260000,"BSC_SIGNED_TRANSACTION")
     h=digest(data.encode());require(h not in broadcasts,"BSC_BROADCAST_ALREADY_ADMITTED");broadcasts.add(h)
     out=rpc(nodes[0][2],'eth_sendRawTransaction',[data])
    else:raise RuntimeError('BSC_OPERATION_DENIED')
    print(json.dumps({'id':q['id'],'result':out}),flush=True)
   except Exception as e:
    code=str(e) if isinstance(e,RuntimeError) and re.fullmatch('BSC_[A-Z_]+',str(e)) else 'BSC_OPERATION_UNRESOLVED'
    print(json.dumps({'id':q['id'],'error':code}),flush=True)
 finally:
  primary=sys.exc_info()[1];cleanupError=None
  for p,i,u,l in nodes:
   try:
    if same_process(p,i):p.send_signal(signal.SIGTERM)
   except BaseException as error:
    if cleanupError is None:cleanupError=error
  for p,i,u,l in nodes:
   try:stop_original(p,i)
   except BaseException as error:
    if cleanupError is None:cleanupError=error
   finally:l.close()
  if cleanupError is not None and primary is None:raise cleanupError
  # Private node data and receipts are retained; no global cleanup or adoption.

if __name__=='__main__':
 try:
  require(sys.argv[1:] in ([],['--prepare'],['--fetch-material'],['--prepare-tools']),"BSC_NO_OPTIONS")
  if sys.argv[1:]==['--fetch-material']:fetch_material()
  elif sys.argv[1:]==['--prepare-tools']:prepare_tools()
  elif sys.argv[1:]==['--prepare']:prepare()
  else:serve()
 except Exception as e:
  code=str(e) if isinstance(e,RuntimeError) and re.fullmatch('BSC_[A-Z_]+',str(e)) else 'BSC_CONSTRUCTOR_FAILED'
  print(json.dumps({'error':code}),flush=True);sys.exit(1)
