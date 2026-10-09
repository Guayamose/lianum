import { createPlatformPool } from './database-pool.mjs';
import { createPostgresAuthorizationStore } from './authorization-store.mjs';
import { startPlatformServer } from './server.mjs';
import { readPlatformPrivacyKeyV1 } from './privacy-key-v1.mjs';
const port=Number(process.env.PORT??8080);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PLATFORM_PORT_INVALID');
const origin=process.env.LIANUM_PUBLIC_ORIGIN;
let store = null;
if (process.env.DATABASE_URL) {
  const pool = createPlatformPool(process.env.DATABASE_URL);
  try {
    store = await createPostgresAuthorizationStore(pool, { privacyKey: readPlatformPrivacyKeyV1() });
    // Deployment/local init runs src/migrate.mjs separately. Normal startup
    // verifies the recorded schema and never creates or changes SQL tables.
    await store.ready();
  } catch (error) { await pool.end(); throw error; }
}
// Deliberately unbound until the reviewed mobile owner/account bridge exists.
// Neither an environment variable nor a remote request supplies private hooks.
const server=await startPlatformServer({origin,store,executor:null,host:'0.0.0.0',port});
process.stdout.write(JSON.stringify({service:'lianum-platform',port,operations:'UNAVAILABLE'})+'\n');
let closing=false;
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
  if(closing)return;closing=true;
  const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();
  void server.close().then(()=>store?.close()).then(()=>clearTimeout(deadline)).catch(()=>{process.exitCode=1;});
});
