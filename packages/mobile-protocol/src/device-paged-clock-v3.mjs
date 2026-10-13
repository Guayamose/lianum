/** Fixed process clock for Paged permission lifetimes. Backward wall-clock
 * corrections never stop elapsed time; forward corrections expire sooner. */
const wallNow=Date.now.bind(Date),monotonicNow=performance.now.bind(performance);
let lastWall=wallNow(),lastMonotonic=monotonicNow();
let lastObservedMonotonic=lastMonotonic;
const future=gap=>Object.defineProperties(Error('MOBILE_PAGED_CLOCK_FUTURE'),{code:{value:'MOBILE_PAGED_CLOCK_FUTURE'},clockGapMs:{value:Math.min(3600000,Math.max(0,Math.ceil(gap)))}});
const frames=new Map(),FRAME_LIMIT=512,FRAME_LIFETIME=15000;
let retiredExpiry=0;
const clockError=code=>{throw Error(code);};
const wallInteger=value=>{if(!Number.isSafeInteger(value)||value<0||Object.is(value,-0))clockError('MOBILE_PAGED_CLOCK_INVALID');return value;};
function monotonicTick(){const value=monotonicNow();if(!Number.isFinite(value)||value<lastMonotonic||value<lastObservedMonotonic)clockError('MOBILE_PAGED_CLOCK_INVALID');lastObservedMonotonic=value;return value;}

/** Wire epochs follow the real wall clock. Each authenticated frame also gets
 * its own monotonic lifetime below; the process-local ratchet is not a peer epoch. */
export function devicePagedWallNowV3(){
 if(arguments.length!==0)clockError('MOBILE_PAGED_CLOCK_ARGUMENTS');
 return wallInteger(wallNow());
}

/** Call only after the original bindings and wall expiry/deadline checks.
 * First observation must fit the 15-second wall window. A previously admitted
 * key and exact expiry keep their original monotonic deadline on wall rollback,
 * so its first remaining lifetime can never be renewed.
 * Expired entries remain tombstones for another 15 seconds. Purging advances
 * an expiry watermark, so a retired frame cannot revive after a larger rollback;
 * new frames behind that watermark fail closed until wall time catches up. */
export function assertDevicePagedFrameElapsedV3(key,expiresAt,nowWall){
 if(arguments.length!==3||typeof key!=='string'||key.length<1||key.length>512||!/^[A-Za-z0-9:._-]+$/.test(key)||!Number.isSafeInteger(expiresAt)||expiresAt<=0)clockError('MOBILE_PAGED_CLOCK_ARGUMENTS');
 wallInteger(nowWall);
 const remaining=expiresAt-nowWall;
 if(remaining<=0)clockError('MOBILE_PAGED_CLOCK_EXPIRED');
 const monotonic=monotonicTick();
 for(const [id,frame]of frames)if(monotonic>=frame.retainUntil){retiredExpiry=Math.max(retiredExpiry,frame.expiresAt);frames.delete(id);}
 const original=frames.get(key);
 if(original){
  if(original.expiresAt!==expiresAt)clockError('MOBILE_PAGED_CLOCK_BINDING');
  if(monotonic>=original.deadline)clockError('MOBILE_PAGED_CLOCK_EXPIRED');
  return;
 }
 if(expiresAt<=retiredExpiry)clockError('MOBILE_PAGED_CLOCK_EXPIRED');
 if(remaining>FRAME_LIFETIME)throw future(remaining-FRAME_LIFETIME);
 if(frames.size>=FRAME_LIMIT)clockError('MOBILE_PAGED_CLOCK_CAPACITY');
 const deadline=monotonic+Math.min(FRAME_LIFETIME,remaining);
 frames.set(key,{expiresAt,deadline,retainUntil:deadline+FRAME_LIFETIME});
}
export function devicePagedNowV3(){
 if(arguments.length!==0)throw Error('MOBILE_PAGED_CLOCK_ARGUMENTS');
 const wall=wallNow(),monotonic=monotonicTick();
 if(!Number.isSafeInteger(wall)||wall<0||!Number.isFinite(monotonic)||monotonic<lastMonotonic)throw Error('MOBILE_PAGED_CLOCK_INVALID');
 const current=Math.max(wall,lastWall+(monotonic-lastMonotonic)),integer=Math.floor(current);
 if(!Number.isSafeInteger(integer)||integer<0)throw Error('MOBILE_PAGED_CLOCK_INVALID');
 lastWall=current;lastMonotonic=monotonic;return integer;
}

/** Wait for a small peer clock lead without accepting its frame early or
 * changing this clock. Callers validate original frame bindings before waiting
 * and apply their unchanged freshness guard afterwards. */
export async function awaitDevicePagedIssuedTimeV3(issuedAt,signal){
 if(arguments.length<1||arguments.length>2||!Number.isSafeInteger(issuedAt)||issuedAt<0)throw Error('MOBILE_PAGED_CLOCK_ARGUMENTS');
 if(signal!==undefined&&!(signal instanceof AbortSignal))throw Error('MOBILE_PAGED_CLOCK_ARGUMENTS');
 const gap=issuedAt-devicePagedWallNowV3();
 if(gap>3000)throw future(gap);
 if(signal?.aborted)throw Error('MOBILE_PAGED_CLOCK_CANCELLED');
 if(gap<=0)return;
 const until=monotonicTick()+3000;
 while(issuedAt>devicePagedWallNowV3()){
  const remaining=issuedAt-devicePagedWallNowV3();
  if(remaining>3000)throw future(remaining);
  const monotonic=monotonicTick();
  if(monotonic>=until)throw future(remaining);
  await new Promise((resolve,reject)=>{
   let timer;
   const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error('MOBILE_PAGED_CLOCK_CANCELLED'));};
   timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},Math.max(1,Math.ceil(Math.min(remaining,until-monotonic))));
   signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted)abort();
  });
 }
}
