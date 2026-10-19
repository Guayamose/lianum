import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,lstatSync,openSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {createECDH,createHash,randomUUID} from 'node:crypto';
import {need,ownerId,uuid,boundedText} from './validation.mjs';

/** Local durable state owned by one service process. SQLite transactions join
 * conversation changes to their notification outbox. No wallet keys live here. */
export function openAgentStore({directory,now=Date.now}){
 mkdirSync(directory,{recursive:true,mode:0o700});
 const privateFile=(path,directory=false)=>{const s=lstatSync(path);need(!s.isSymbolicLink()&&(directory?s.isDirectory():s.isFile()&&s.nlink===1)&&s.uid===process.getuid()&&(s.mode&0o777)===(directory?0o700:0o600),'STORAGE_PERMISSIONS');};
 privateFile(directory,true);const file=join(directory,'agent.sqlite');closeSync(openSync(file,'a',0o600));privateFile(file);
 const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;');
 db.exec(`
  CREATE TABLE IF NOT EXISTS process_lock(id INTEGER PRIMARY KEY CHECK(id=1),pid INTEGER NOT NULL,nonce TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS owners(id TEXT PRIMARY KEY,public_key TEXT NOT NULL UNIQUE,data TEXT NOT NULL,agent_key BLOB NOT NULL);
  CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT NOT NULL REFERENCES owners(id),id TEXT NOT NULL,role TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,request_hash TEXT,remote_id TEXT,data TEXT NOT NULL DEFAULT '{}',UNIQUE(owner,id),UNIQUE(owner,remote_id));
  CREATE INDEX IF NOT EXISTS message_owner ON messages(owner,seq);
  CREATE TABLE IF NOT EXISTS calls(owner TEXT NOT NULL,session TEXT NOT NULL,turn TEXT NOT NULL,id TEXT NOT NULL,hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(owner,session,turn,id));
  CREATE TABLE IF NOT EXISTS notes(owner TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner,key));
  CREATE TABLE IF NOT EXISTS forgotten_notes(owner TEXT NOT NULL,key TEXT NOT NULL,forgotten_at INTEGER NOT NULL,PRIMARY KEY(owner,key));
  CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,owner TEXT NOT NULL,text TEXT NOT NULL,due_at INTEGER NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(owner,id));
  CREATE TABLE IF NOT EXISTS notifications(seq INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT NOT NULL,message_id TEXT NOT NULL,read INTEGER NOT NULL DEFAULT 0,UNIQUE(owner,message_id));
  CREATE TABLE IF NOT EXISTS agent_operations(owner TEXT NOT NULL,id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,updated_at INTEGER NOT NULL,next_check INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,id));
  CREATE TABLE IF NOT EXISTS push_devices(owner TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,token TEXT NOT NULL,enabled INTEGER NOT NULL,start_seq INTEGER NOT NULL,error TEXT);
  CREATE TABLE IF NOT EXISTS push_deliveries(seq INTEGER NOT NULL,token_hash TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL,next_attempt INTEGER NOT NULL,message_id TEXT,error TEXT,PRIMARY KEY(seq,token_hash));
  CREATE TABLE IF NOT EXISTS voice_calls(owner TEXT NOT NULL,id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner,id));
  CREATE TABLE IF NOT EXISTS voice_fragments(owner TEXT NOT NULL,call_id TEXT NOT NULL,event_id TEXT NOT NULL,speaker TEXT NOT NULL,start_ms INTEGER NOT NULL,end_ms INTEGER NOT NULL,text TEXT NOT NULL,PRIMARY KEY(owner,call_id,event_id));
  CREATE TABLE IF NOT EXISTS voice_delegations(owner TEXT NOT NULL,call_id TEXT NOT NULL,id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,call_id,id));
  PRAGMA user_version=1;
 `);
 let depth=0;
 const transaction=work=>{if(depth)return work();db.exec('BEGIN IMMEDIATE');depth++;try{const out=work();db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}finally{depth--;}};
 const nonce=randomUUID();
 try{transaction(()=>{const held=db.prepare('SELECT * FROM process_lock WHERE id=1').get();if(held){let alive=true;try{process.kill(held.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}need(!alive,'ALREADY_RUNNING');}db.prepare('INSERT OR REPLACE INTO process_lock VALUES(1,?,?)').run(process.pid,nonce);});}catch(error){db.close();throw error;}
 let closed=false;
 const load=id=>{ownerId(id);const row=db.prepare('SELECT public_key,data FROM owners WHERE id=?').get(id);return row?{owner:id,publicKey:row.public_key,...JSON.parse(row.data)}:null;};
 const save=(id,data)=>{ownerId(id);const {owner,publicKey,...rest}=data;need(Buffer.byteLength(JSON.stringify(rest))<=262144,'STORAGE_BOUND');db.prepare('UPDATE owners SET data=? WHERE id=?').run(JSON.stringify(rest),id);};
 const messages=(id,after=0)=>{ownerId(id);need(Number.isSafeInteger(after)&&after>=0);return db.prepare("SELECT seq,id,role,text,status,created_at,data FROM messages WHERE owner=? AND seq>? AND COALESCE(json_extract(data,'$.internalVoiceInput'),0)!=1 AND COALESCE(json_extract(data,'$.phase'),'')!='voice_backend' ORDER BY seq LIMIT 100").all(id,after).map(row=>({seq:row.seq,id:row.id,role:row.role,text:row.text,status:row.status,createdAt:row.created_at,...Object.fromEntries(Object.entries(JSON.parse(row.data)).filter(([key])=>!['modelInput','requestContext','client'].includes(key)))}));};
 return Object.freeze({
  transaction,load,save,
  allOwners(){return db.prepare('SELECT id FROM owners').all().map(row=>load(row.id));},
  update(id,change){const state=load(id);need(state,'IDENTITY');change(state);save(id,state);return state;},
  ensure(publicKey){
   need(typeof publicKey==='string'&&/^04[0-9a-f]{128}$/.test(publicKey),'IDENTITY');const id=createHash('sha256').update(publicKey).digest('hex');
   if(!load(id)){
    need(db.prepare('SELECT count(*) AS n FROM owners').get().n<64,'CAPACITY');const identity=createECDH('secp256k1');identity.generateKeys();const key=identity.getPrivateKey();
    try{db.prepare('INSERT INTO owners VALUES(?,?,?,?)').run(id,publicKey,JSON.stringify({conversationId:randomUUID(),sessionId:null,sessionKey:randomUUID(),sessionStatus:'NEW',lastError:null,context:null,connections:[],nextCheckAt:0,cancelRequested:false,createdAt:now()}),key);}finally{key.fill(0);}
   }
   return load(id);
  },
  identity(id){ownerId(id);const row=db.prepare('SELECT agent_key FROM owners WHERE id=?').get(id);need(row,'IDENTITY');return new Uint8Array(row.agent_key);},
  messages,
  enqueue(id,input){
   ownerId(id);uuid(input.id);const text=boundedText(input.text),hash=createHash('sha256').update(JSON.stringify({text,context:input.context??null,...(input.client?{client:input.client}:{})})).digest('hex');
   return transaction(()=>{
    const previous=db.prepare('SELECT request_hash FROM messages WHERE owner=? AND id=?').get(id,input.id);
    if(previous){need(previous.request_hash===hash,'MESSAGE_CONFLICT');return {id:input.id,duplicate:true};}
    need(db.prepare("SELECT count(*) AS n FROM messages WHERE owner=? AND status IN ('QUEUED','SENDING','SENT')").get(id).n<16,'CAPACITY');
    db.prepare("INSERT INTO messages(owner,id,role,text,status,created_at,request_hash,data) VALUES(?,?,'you',?,'QUEUED',?,?,?)").run(id,input.id,text,now(),hash,JSON.stringify({modelInput:input.modelInput??null,requestContext:input.context??null,...(input.internalVoiceInput?{internalVoiceInput:true}:{})}));
    const state=load(id);if(input.context!==undefined)state.context=input.context;if(input.client!==undefined)state.client=input.client;state.memoryQuery=input.text;state.memoryMessageId=input.id;state.nextCheckAt=0;save(id,state);return {id:input.id,duplicate:false};
   });
  },
  pending(id){return db.prepare("SELECT id,text,status,data FROM messages WHERE owner=? AND role='you' AND status IN ('QUEUED','SENDING') ORDER BY seq LIMIT 16").all(ownerId(id)).map(({data,...row})=>({...row,modelInput:JSON.parse(data).modelInput,context:JSON.parse(data).requestContext}));},
  deliveries(id){return db.prepare("SELECT id,status FROM messages WHERE owner=? AND role='you' ORDER BY seq DESC LIMIT 16").all(ownerId(id));},
  mark(id,messageId,status){need(['SENDING','SENT','COMPLETED','FAILED','CANCELLED','UNKNOWN'].includes(status));db.prepare('UPDATE messages SET status=? WHERE owner=? AND id=?').run(status,ownerId(id),messageId);},
  settle(id,status){need(['COMPLETED','FAILED','CANCELLED'].includes(status));db.prepare("UPDATE messages SET status=? WHERE owner=? AND role='you' AND status IN ('SENT','SENDING')").run(status,ownerId(id));},
  append(id,{remoteId,text,data={},phase='final_answer'}){
   ownerId(id);boundedText(text,12000);need(typeof remoteId==='string'&&remoteId.length<=200);need(Buffer.byteLength(JSON.stringify(data))<=40000,'STORAGE_BOUND');
   return transaction(()=>{const existing=db.prepare('SELECT id FROM messages WHERE owner=? AND remote_id=?').get(id,remoteId);if(existing)return existing.id;
    const messageId=randomUUID();db.prepare("INSERT INTO messages(owner,id,role,text,status,created_at,remote_id,data) VALUES(?,?,'agent',?,'COMPLETED',?,?,?)").run(id,messageId,text,now(),remoteId,JSON.stringify({...data,phase}));
    if(phase==='final_answer')db.prepare('INSERT INTO notifications(owner,message_id) VALUES(?,?)').run(id,messageId);return messageId;
   });
  },
  ownersDue(){return db.prepare('SELECT id FROM owners').all().map(row=>load(row.id)).filter(s=>s.nextCheckAt<=now()&&(s.sessionStatus==='ACTIVE'||(s.idleReconcileUntil??0)>now()||s.cancelRequested||db.prepare("SELECT 1 FROM messages WHERE owner=? AND status IN ('QUEUED','SENDING') LIMIT 1").get(s.owner)));},
  call(id,session,turn,callId,hash,compute){
   ownerId(id);return transaction(()=>{const old=db.prepare('SELECT hash,result FROM calls WHERE owner=? AND session=? AND turn=? AND id=?').get(id,session,turn,callId);if(old){need(old.hash===hash,'CALL_CONFLICT');return JSON.parse(old.result);}
    const result=compute();need(!(result instanceof Promise),'ASYNC_TOOL_TRANSACTION');need(Buffer.byteLength(JSON.stringify(result))<=40000,'TOOL_BOUND');db.prepare('INSERT INTO calls VALUES(?,?,?,?,?,?)').run(id,session,turn,callId,hash,JSON.stringify(result));return result;
   });
  },
  callRecorded(id,session,turn,callId){return Boolean(db.prepare('SELECT 1 FROM calls WHERE owner=? AND session=? AND turn=? AND id=?').get(ownerId(id),session,turn,callId));},
  message(id,key){const row=db.prepare('SELECT seq,id,role,text,status,data FROM messages WHERE owner=? AND id=?').get(ownerId(id),key);return row?{...row,data:JSON.parse(row.data)}:null;},
  latestSubmission(id){return db.prepare("SELECT id FROM messages WHERE owner=? AND role='you' AND COALESCE(json_extract(data,'$.channel'),'')!='voice' ORDER BY seq DESC LIMIT 1").get(ownerId(id))?.id??null;},
  remoteMessageExists(id,key){return Boolean(db.prepare('SELECT 1 FROM messages WHERE owner=? AND remote_id=?').get(ownerId(id),key));},
  recentMessages(id){return db.prepare("SELECT role,text FROM messages WHERE owner=? AND COALESCE(json_extract(data,'$.internalVoiceInput'),0)!=1 AND COALESCE(json_extract(data,'$.phase'),'')!='voice_backend' ORDER BY seq DESC LIMIT 12").all(ownerId(id)).reverse();},
  recentVoice(id){return db.prepare("SELECT role,text FROM messages WHERE owner=? AND json_extract(data,'$.channel')='voice' ORDER BY seq DESC LIMIT 6").all(ownerId(id)).reverse().map(r=>({...r,text:r.text.slice(-400)}));},
  voiceCalls(){return db.prepare("SELECT owner,id FROM voice_calls WHERE status IN ('QUEUED','CREATING','CONNECTING','ACTIVE','CLOSING') ORDER BY created_at LIMIT 4").all().map(r=>({owner:r.owner,...this.voiceCall(r.owner,r.id)}));},
  voiceCall(id,key){ownerId(id);uuid(key);const row=db.prepare('SELECT status,data,created_at AS createdAt FROM voice_calls WHERE owner=? AND id=?').get(id,key);return row?{id:key,status:row.status,createdAt:row.createdAt,...JSON.parse(row.data)}:null;},
  reserveVoice(id,key,data,budgetMicros){ownerId(id);uuid(key);return transaction(()=>{const old=this.voiceCall(id,key);if(old){need(old.offerSHA256===data.offerSHA256,'VOICE_CONFLICT');return old;}need(!db.prepare("SELECT 1 FROM voice_calls WHERE owner=? AND status IN ('QUEUED','CREATING','CONNECTING','ACTIVE','CLOSING')").get(id),'VOICE_ALREADY_ACTIVE');need(this.voiceCalls().length<4,'CAPACITY');const total=db.prepare("SELECT COALESCE(sum(COALESCE(json_extract(data,'$.chargeMicros'),json_extract(data,'$.reservedMicros'))),0) AS n FROM voice_calls").get().n;need(total+data.reservedMicros<=budgetMicros,'VOICE_BUDGET_REACHED');db.prepare("INSERT INTO voice_calls VALUES(?,?,'QUEUED',?,?,?)").run(id,key,JSON.stringify(data),now(),now());return this.voiceCall(id,key);});},
  updateVoice(id,key,change){return transaction(()=>{const value=this.voiceCall(id,key);need(value,'VOICE_NOT_FOUND');change(value);const {id:ignored,status,createdAt,...data}=value;need(Buffer.byteLength(JSON.stringify(data))<=131072,'STORAGE_BOUND');db.prepare('UPDATE voice_calls SET status=?,data=?,updated_at=? WHERE owner=? AND id=?').run(status,JSON.stringify(data),now(),ownerId(id),key);return this.voiceCall(id,key);});},
  voiceFragment(id,key,event){ownerId(id);uuid(key);need(typeof event.event_id==='string'&&event.event_id.length<=200&&typeof event.delta==='string'&&event.delta.length<=2000&&Number.isSafeInteger(event.start_ms)&&Number.isSafeInteger(event.end_ms)&&event.end_ms>=event.start_ms,'VOICE_EVENT');const speaker=event.type==='session.input_transcript.delta'?'user':'assistant';return db.prepare('INSERT OR IGNORE INTO voice_fragments VALUES(?,?,?,?,?,?,?)').run(id,key,event.event_id,speaker,event.start_ms,event.end_ms,event.delta).changes>0;},
  voiceInput(id,key,after=0){return db.prepare("SELECT start_ms AS startMs,end_ms AS endMs,text FROM voice_fragments WHERE owner=? AND call_id=? AND speaker='user' AND end_ms>? ORDER BY start_ms,end_ms LIMIT 1000").all(ownerId(id),key,after);},
  appendVoice(id,key,segment,attachment){ownerId(id);uuid(key);const text=boundedText(segment.text,12000),remote='live:'+key+':'+attachment+':'+segment.id,data={phase:segment.speaker==='user'?'voice_input':'final_answer',channel:'voice',voiceCallId:key,startMs:segment.startMs,endMs:segment.endMs};if(segment.speaker==='assistant')return this.append(id,{remoteId:remote,text,data,phase:'final_answer'});return transaction(()=>{const old=db.prepare('SELECT id FROM messages WHERE owner=? AND remote_id=?').get(id,remote);if(old)return old.id;const messageId=randomUUID();db.prepare("INSERT INTO messages(owner,id,role,text,status,created_at,remote_id,data) VALUES(?,?,'you',?,'COMPLETED',?,?,?)").run(id,messageId,text,now(),remote,JSON.stringify(data));return messageId;});},
  voiceDelegation(id,key,delegationId){const row=db.prepare('SELECT status,data FROM voice_delegations WHERE owner=? AND call_id=? AND id=?').get(ownerId(id),key,delegationId);return row?{id:delegationId,status:row.status,...JSON.parse(row.data)}:null;},
  saveVoiceDelegation(id,key,delegationId,status,data){ownerId(id);uuid(key);const {id:ignored,status:ignoredStatus,...value}=data;need(typeof delegationId==='string'&&delegationId.length<=200&&Buffer.byteLength(JSON.stringify(value))<=12000,'VOICE_EVENT');db.prepare('INSERT INTO voice_delegations VALUES(?,?,?,?,?) ON CONFLICT(owner,call_id,id) DO UPDATE SET status=excluded.status,data=excluded.data').run(id,key,delegationId,status,JSON.stringify(value));},
  notes(id){return db.prepare('SELECT key,value,updated_at AS updatedAt FROM notes WHERE owner=? ORDER BY key').all(ownerId(id));},
  forgottenNotes(id){return db.prepare('SELECT key,forgotten_at AS forgottenAt FROM forgotten_notes WHERE owner=? ORDER BY forgotten_at DESC,key LIMIT 32').all(ownerId(id));},
  remember(id,key,value){ownerId(id);need(/^[a-z][a-z0-9_]{0,39}$/.test(key));boundedText(value,500);need(!/seed|mnemonic|contrase[nñ]a|password|private.?key|clave.?privada|recovery.?phrase/i.test(key+' '+value),'MEMORY_SECRET');need(db.prepare('SELECT count(*) AS n FROM notes WHERE owner=?').get(id).n<32||db.prepare('SELECT 1 FROM notes WHERE owner=? AND key=?').get(id,key),'CAPACITY');return transaction(()=>{db.prepare('INSERT INTO notes VALUES(?,?,?,?) ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(id,key,value,now());db.prepare('DELETE FROM forgotten_notes WHERE owner=? AND key=?').run(id,key);return {saved:true,key};});},
  forget(id,key){ownerId(id);need(typeof key==='string'&&/^[a-z][a-z0-9_]{0,39}$/.test(key));return transaction(()=>{db.prepare('DELETE FROM notes WHERE owner=? AND key=?').run(id,key);db.prepare('INSERT INTO forgotten_notes VALUES(?,?,?) ON CONFLICT(owner,key) DO UPDATE SET forgotten_at=excluded.forgotten_at').run(id,key,now());db.prepare('DELETE FROM forgotten_notes WHERE owner=? AND key NOT IN (SELECT key FROM forgotten_notes WHERE owner=? ORDER BY forgotten_at DESC,key LIMIT 32)').run(id,id);return {removed:true,key};});},
  searchHistory(id,query,excludeId=null){
   ownerId(id);need(typeof query==='string'&&query.length<=2000);if(excludeId!==null)uuid(excludeId);
   const ignored=new Set('que qué como cómo cuando cuándo donde dónde para por con sin una uno unos unas los las del algo esto eso esta este estas estos tengo tienes tiene tenemos puedes puede quiero quieres hacer haz dime hola gracias favor recuerda recuerdas recuerdo antes hablamos dijimos dijiste nuestro nuestra sobre acerca favor seguimos'.split(' '));
   const terms=[...new Set((query.toLocaleLowerCase('es').match(/[\p{L}\p{N}_-]{3,40}/gu)??[]).filter(word=>!ignored.has(word)))].slice(0,8);if(!terms.length)return [];
   const match="lower(text) LIKE ? ESCAPE '\\'",patterns=terms.map(term=>'%'+term.replace(/[\\%_]/g,'\\$&')+'%'),score=terms.map(()=>`CASE WHEN ${match} THEN 1 ELSE 0 END`).join('+');
   return db.prepare(`SELECT seq,role,text,created_at AS createdAt,(${score}) AS relevance FROM messages WHERE owner=? AND (? IS NULL OR id!=?) AND (${terms.map(()=>match).join(' OR ')}) AND (role='you' OR (status='COMPLETED' AND json_extract(data,'$.phase')='final_answer')) ORDER BY relevance DESC,seq DESC LIMIT 3`).all(...patterns,id,excludeId,excludeId,...patterns).map(({relevance,...row})=>{const lower=row.text.toLocaleLowerCase('es'),at=Math.min(...terms.map(term=>lower.indexOf(term)).filter(index=>index>=0)),start=Number.isFinite(at)?Math.max(0,at-180):0;return {...row,text:((start?'…':'')+row.text.slice(start,start+698)+(start+698<row.text.length?'…':'')).slice(0,700),historical:true};});
  },
  schedule(id,key,text,dueAt){ownerId(id);uuid(key);boundedText(text);need(Number.isSafeInteger(dueAt)&&dueAt>now()&&dueAt<=now()+30*86400000);need(db.prepare("SELECT count(*) AS n FROM tasks WHERE owner=? AND status='WAITING'").get(id).n<32,'CAPACITY');db.prepare("INSERT INTO tasks VALUES(?,?,?,?,'WAITING',?) ON CONFLICT(id) DO NOTHING").run(key,id,text,dueAt,now());return {id:key,text,dueAt,status:'WAITING'};},
  tasks(id){return db.prepare('SELECT id,text,due_at AS dueAt,status FROM tasks WHERE owner=? ORDER BY created_at LIMIT 100').all(ownerId(id));},
  waitingTasks(id){return db.prepare("SELECT id,text,due_at AS dueAt,status FROM tasks WHERE owner=? AND status='WAITING' ORDER BY due_at,id LIMIT 32").all(ownerId(id));},
  cancelTask(id,key){uuid(key);db.prepare("UPDATE tasks SET status='CANCELLED' WHERE owner=? AND id=? AND status='WAITING'").run(ownerId(id),key);return {id:key,status:this.tasks(id).find(row=>row.id===key)?.status??'NOT_FOUND'};},
  wakeDue(inputForTask=null){const rows=db.prepare("SELECT * FROM tasks WHERE status='WAITING' AND due_at<=? ORDER BY due_at LIMIT 32").all(now());for(const row of rows)transaction(()=>{const input={id:row.id,text:'Seguimiento programado por el usuario: '+row.text};this.enqueue(row.owner,inputForTask?inputForTask(load(row.owner),input):input);db.prepare("UPDATE tasks SET status='TRIGGERED' WHERE id=?").run(row.id);});return rows.length;},
  notifications(id){return db.prepare('SELECT seq,message_id AS messageId FROM notifications WHERE owner=? AND read=0 ORDER BY seq LIMIT 100').all(ownerId(id));},
  acknowledge(id,through){need(Number.isSafeInteger(through)&&through>=0);db.prepare('UPDATE notifications SET read=1 WHERE owner=? AND seq<=?').run(ownerId(id),through);},
  operation(id,key){ownerId(id);ownerId(key);const row=db.prepare('SELECT status,data,updated_at AS updatedAt FROM agent_operations WHERE owner=? AND id=?').get(id,key);return row?{id:key,status:row.status,updatedAt:row.updatedAt,...JSON.parse(row.data)}:null;},
  operations(id){return db.prepare('SELECT id,status,data,updated_at AS updatedAt FROM agent_operations WHERE owner=? ORDER BY updated_at DESC,id LIMIT 64').all(ownerId(id)).map(row=>{const d=JSON.parse(row.data);return {id:row.id,status:row.status,updatedAt:row.updatedAt,createdAt:d.createdAt,network:'testnet',nodeCount:d.nodeCount,completed:d.completed??0,total:d.total??d.nodeCount,tracking:d.tracking??'NOT_REGISTERED',lastObservedAt:d.lastObservedAt??null,expiresAt:d.expiresAt??null,error:d.error??null};});},
  createOperation(id,key,data){ownerId(id);ownerId(key);return transaction(()=>{const old=this.operation(id,key);if(old)return old;need(db.prepare('SELECT count(*) AS n FROM agent_operations WHERE owner=?').get(id).n<64,'CAPACITY');need(Buffer.byteLength(JSON.stringify(data))<=131072,'STORAGE_BOUND');db.prepare("INSERT INTO agent_operations(owner,id,status,data,updated_at,next_check) VALUES(?,?,'PROPOSED',?,?,?)").run(id,key,JSON.stringify({...data,createdAt:now(),tracking:'NOT_REGISTERED'}),now(),Number.MAX_SAFE_INTEGER);return this.operation(id,key);});},
  updateOperation(id,key,change){return transaction(()=>{const value=this.operation(id,key);need(value,'OPERATION_NOT_FOUND');change(value);const {id:ignored,status,updatedAt,nextCheckAt=Number.MAX_SAFE_INTEGER,...data}=value;need(typeof status==='string'&&Buffer.byteLength(JSON.stringify(data))<=131072,'STORAGE_BOUND');db.prepare('UPDATE agent_operations SET status=?,data=?,updated_at=?,next_check=?,lease_until=0 WHERE owner=? AND id=?').run(status,JSON.stringify(data),now(),nextCheckAt,ownerId(id),key);return this.operation(id,key);});},
  claimOperations(){return transaction(()=>{const rows=db.prepare("SELECT owner,id FROM agent_operations WHERE next_check<=? AND lease_until<=? ORDER BY next_check LIMIT 4").all(now(),now());for(const row of rows)db.prepare('UPDATE agent_operations SET lease_until=? WHERE owner=? AND id=?').run(now()+60000,row.owner,row.id);return rows.map(row=>({owner:row.owner,...this.operation(row.owner,row.id)}));});},
  registerPush(id,token){ownerId(id);need(typeof token==='string'&&token.length>=20&&token.length<=4096&&!/[\s\x00-\x1f]/.test(token),'PUSH_TOKEN');const hash=createHash('sha256').update(token).digest('hex');return transaction(()=>{const assigned=db.prepare('SELECT owner FROM push_devices WHERE token_hash=?').get(hash);need(!assigned||assigned.owner===id,'PUSH_TOKEN_ASSIGNED');const seq=db.prepare('SELECT COALESCE(max(seq),0) AS n FROM notifications WHERE owner=?').get(id).n;db.prepare('INSERT INTO push_devices VALUES(?,?,?,1,?,NULL) ON CONFLICT(owner) DO UPDATE SET token_hash=excluded.token_hash,token=excluded.token,enabled=1,start_seq=CASE WHEN push_devices.enabled=1 AND push_devices.token_hash=excluded.token_hash THEN push_devices.start_seq ELSE excluded.start_seq END,error=NULL').run(id,hash,token,seq);return {enabled:true};});},
  disablePush(id){db.prepare('UPDATE push_devices SET enabled=0 WHERE owner=?').run(ownerId(id));return {enabled:false};},
  pushSettings(id){const row=db.prepare('SELECT enabled,error FROM push_devices WHERE owner=?').get(ownerId(id));return {enabled:row?.enabled===1,error:row?.error??null};},
  claimPush(){return transaction(()=>{
   const rows=db.prepare("SELECT n.seq,n.owner,n.message_id AS localMessageId,p.token,p.token_hash AS tokenHash,COALESCE(d.attempts,0) AS attempts FROM notifications n JOIN messages m ON m.owner=n.owner AND m.id=n.message_id JOIN push_devices p ON p.owner=n.owner LEFT JOIN push_deliveries d ON d.seq=n.seq AND d.token_hash=p.token_hash WHERE n.read=0 AND p.enabled=1 AND n.seq>p.start_seq AND m.created_at<=? AND (d.status IS NULL OR d.status IN ('RETRY','SENDING') AND d.next_attempt<=?) ORDER BY n.seq LIMIT 16").all(now()-1500,now()).filter(row=>{const state=load(row.owner);return state&&(state.chatVisibleUntil??0)<=now();}).slice(0,4);
   for(const row of rows)db.prepare("INSERT INTO push_deliveries VALUES(?,?,'SENDING',?,?,NULL,NULL) ON CONFLICT(seq,token_hash) DO UPDATE SET status='SENDING',attempts=excluded.attempts,next_attempt=excluded.next_attempt").run(row.seq,row.tokenHash,row.attempts+1,now()+60000);
   return rows.map(row=>({...row,attempts:row.attempts+1,conversationId:load(row.owner).conversationId}));
  });},
  pushPending(row){const entry=db.prepare('SELECT n.read,p.enabled,p.token_hash AS tokenHash FROM notifications n JOIN push_devices p ON p.owner=n.owner WHERE n.seq=? AND n.owner=?').get(row.seq,ownerId(row.owner));return Boolean(entry&&entry.read===0&&entry.enabled===1&&entry.tokenHash===row.tokenHash&&(load(row.owner)?.chatVisibleUntil??0)<=now());},
  skipPush(row){db.prepare("UPDATE push_deliveries SET status='SKIPPED',error=NULL WHERE seq=? AND token_hash=?").run(row.seq,row.tokenHash);},
  finishPush(row,result){transaction(()=>{const success=result.success===true,permanent=result.permanent===true||row.attempts>=6;db.prepare('UPDATE push_deliveries SET status=?,next_attempt=?,message_id=?,error=? WHERE seq=? AND token_hash=?').run(success?'SENT':permanent?'FAILED':'RETRY',now()+Math.max(result.retryAfterMs??0,Math.min(900000,5000*2**row.attempts)),result.id??null,result.error??null,row.seq,row.tokenHash);if(result.unregister)db.prepare('UPDATE push_devices SET enabled=0,error=? WHERE owner=? AND token_hash=?').run('REGISTRATION_EXPIRED',row.owner,row.tokenHash);});},
  close(){if(closed)return;closed=true;db.prepare('DELETE FROM process_lock WHERE id=1 AND nonce=?').run(nonce);db.close();},
 });
}
