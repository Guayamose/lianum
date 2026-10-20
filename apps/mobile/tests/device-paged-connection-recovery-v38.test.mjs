/** Execute the actual screen connection method with controlled native ports.
 * A failed balance query must preserve its validated identity, never a balance
 * or financial permission. This is a HOST lifecycle test, not phone acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../src/screens/DevicePagedGraphScreen.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const screen=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='DevicePagedGraphScreen');
const connect=screen.body.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='connect');
const code=ts.transpile('('+source.slice(connect.getStart(ast),connect.end)+')',{target:ts.ScriptTarget.ES2022});

function fixture(failure){
 const profile='VALIDATED_PUBLIC_PROFILE',old='OLD_LOCAL_PROFILE',descriptor={devicePublicKey:'DEVICE_KEY',deadlineMs:Date.now()+60000,origin:'https://public.example'};
 const writes=[],values={pairing:old,summary:null,success:false};let tlsClosed=0;
 const vault={async graphAutomationStatus(){return null;},async graphAutomationReadHint(){return null;}};
 const transport={async close(){tlsClosed++;}};
 const g={pairing:old,Date,AbortController,epoch:{current:1},abort:{current:null},acquiring:{current:null},current:{current:null},
  automaticReadRetryRef:{current:{reset(){}}},automaticReconnectRef:{current:false},readOnlyProfileRef:{current:null},
  savedProfileRef:{current:old},loadedProfileRef:{current:false},
  parseDevicePagedConnectionProfileV3:()=>({descriptor,transport:{certificateSHA256:'a'.repeat(64)}}),
  resolveSourceSuccessorProfileV35:async value=>value,connectRecovery(){assert.fail('No recovery before validation');},
  async close(){},live(token){assert.equal(token,1);},
  async readDevicePublicKey(){return failure==='identity'?'OTHER_DEVICE':descriptor.devicePublicKey;},
  async createDevicePagedConnectionTransportV3(){if(failure==='tls')throw Error('TLS_FAILED');return transport;},
  createDevicePagedOwnerApiV3:()=>({async close(){}}),
  createDevicePagedGraphApiV3:()=>({async pairing(){if(failure==='pairing')throw Error('PAIRING_FAILED');return{};},async close(){}}),
  async openExistingDevicePagedCustodyV3(){if(failure==='custody')throw Error('CUSTODY_FAILED');return vault;},
  createDevicePagedGraphNoteVaultV3(){assert.fail('Existing custody only');},
  async restoreSavedConnection(){throw Error('BALANCE_UNAVAILABLE');},
  Store:{async setItemAsync(key,value){writes.push({key,value});}},publicConnectionKey:'connection',publicConnectionOptions:{},
  connectionRegistry:{remember(){assert.fail('A failed balance query cannot report a fully connected account');}},
  setPairing(value){values.pairing=value;},setConnectionPreview(){},setSummary(value){values.summary=value;},
  setFeedbackKind(kind){if(kind==='success')values.success=true;},setMessage(){},
  async stop(){await transport.close();},reportConnectionFailure(){},
 };
 return{g,writes,values,profile,old,connect:new Script(code).runInNewContext(g),tlsClosed:()=>tlsClosed};
}

test('a failed balance read keeps the newly authenticated connection for recovery while clearing financial state',async()=>{
 const f=fixture('balance');await assert.rejects(f.connect(f.profile,false,true,true),/BALANCE_UNAVAILABLE/);
 assert.equal(f.g.savedProfileRef.current,f.profile);assert.equal(f.values.pairing,f.profile);
 assert.equal(f.g.loadedProfileRef.current,true);assert.deepEqual(f.writes,[{key:'connection',value:f.profile}]);
 assert.equal(f.g.current.current,null);assert.equal(f.values.summary,null);assert.equal(f.values.success,false);assert.ok(f.tlsClosed()>0);
});

test('identity, TLS, pairing and custody failures cannot replace the retained connection',async()=>{
 for(const failure of ['identity','tls','pairing','custody']){
  const f=fixture(failure);await assert.rejects(f.connect(f.profile,false,true,true));
  assert.equal(f.g.savedProfileRef.current,f.old,failure);assert.equal(f.values.pairing,f.old,failure);
  assert.equal(f.writes.length,0,failure);assert.equal(f.values.success,false,failure);
 }
});
