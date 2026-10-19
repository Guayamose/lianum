import {readFile,lstat} from 'node:fs/promises';
import {createPrivateKey,sign} from 'node:crypto';
export async function createFcmPushSender({credentialsPath,serviceAccount,projectId,fetchImpl=fetch,now=Date.now}={}){
 if(!credentialsPath&&!serviceAccount&&!projectId)return null;
 if(typeof projectId!=='string'||!/^[-a-z0-9]{5,63}$/.test(projectId))throw Error('NATIVE_AGENT_PUSH_CONFIGURATION');
 let email,key;
 if(serviceAccount){if(credentialsPath||typeof serviceAccount!=='string'||!/^[-a-z0-9]+@[-a-z0-9]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)||!serviceAccount.endsWith('@'+projectId+'.iam.gserviceaccount.com'))throw Error('NATIVE_AGENT_PUSH_CONFIGURATION');email=serviceAccount;}
 else{
  const stat=await lstat(credentialsPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>16384||!((stat.uid===process.getuid()&&(stat.mode&0o777)===0o600)||(stat.uid===0&&stat.gid===process.getgid()&&(stat.mode&0o777)===0o640)))throw Error('NATIVE_AGENT_PUSH_CREDENTIAL_PERMISSIONS');
  const bytes=await readFile(credentialsPath);try{const value=JSON.parse(bytes.toString('utf8'));if(value.type!=='service_account'||value.project_id!==projectId||typeof value.client_email!=='string'||!value.client_email.endsWith('.iam.gserviceaccount.com'))throw Error('NATIVE_AGENT_PUSH_CONFIGURATION');email=value.client_email;key=createPrivateKey(value.private_key);}finally{bytes.fill(0);}
 }
 let access=null,expiresAt=0,authWork=null;
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 async function token(signal){
  if(access&&now()<expiresAt-60000)return access;
  if(!authWork)authWork=(async()=>{try{
   if(serviceAccount){const response=await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/'+encodeURIComponent(email)+'/token',{headers:{'Metadata-Flavor':'Google'},redirect:'error',signal}),text=await response.text();if(!response.ok||response.headers.get('metadata-flavor')!=='Google'||text.length>16384)throw Error('NATIVE_AGENT_PUSH_AUTH');const value=JSON.parse(text);if(typeof value.access_token!=='string'||!Number.isFinite(value.expires_in))throw Error('NATIVE_AGENT_PUSH_AUTH');access=value.access_token;expiresAt=now()+Math.min(3600,value.expires_in)*1000;return access;}
   const at=Math.floor(now()/1000),unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:at,exp:at+3600}),assertion=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),key).toString('base64url');
   const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),redirect:'error',signal}),text=await response.text();if(!response.ok||text.length>16384)throw Error('NATIVE_AGENT_PUSH_AUTH');const value=JSON.parse(text);if(typeof value.access_token!=='string'||!Number.isFinite(value.expires_in))throw Error('NATIVE_AGENT_PUSH_AUTH');access=value.access_token;expiresAt=now()+Math.min(3600,value.expires_in)*1000;return access;}finally{authWork=null;}})();
  return authWork;
 }
 return Object.freeze({async send(row,signal){
  const timeout=AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])]);
  try{const auth=await token(timeout),response=await fetchImpl('https://fcm.googleapis.com/v1/projects/'+projectId+'/messages:send',{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json'},redirect:'error',signal:timeout,body:JSON.stringify({message:{token:row.token,notification:{title:'Lianum',body:'Tu agente tiene una novedad para ti.'},data:{type:'agent',conversationId:row.conversationId,notificationId:String(row.seq),route:'agent'},android:{priority:'HIGH',collapse_key:'lianum-agent',notification:{channel_id:'lianum-agent',tag:'agent-'+row.conversationId,visibility:'PRIVATE',default_sound:true}}}})}),text=await response.text();if(text.length>32768)throw Error('NATIVE_AGENT_PUSH_RESPONSE');const value=JSON.parse(text);
   if(response.ok&&typeof value.name==='string')return {success:true,id:value.name};const errors=value.error?.details??[],unregister=errors.some(e=>e.errorCode==='UNREGISTERED'),permanent=unregister||[400,403,404].includes(response.status),retry=Number(response.headers.get('retry-after'));
   if(response.status===401){access=null;expiresAt=0;}
   return {success:false,error:unregister?'UNREGISTERED':'NATIVE_AGENT_PUSH_DELIVERY',unregister,permanent,retryAfterMs:Number.isFinite(retry)?Math.min(3600000,Math.max(0,retry*1000)):0};
  }catch{return {success:false,error:'NATIVE_AGENT_PUSH_UNCONFIRMED',permanent:false};}
 }});
}
