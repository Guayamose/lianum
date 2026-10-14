/** Scheduling only. Financial decisions remain in the original account and
 * private OWNER. No user keys, RPC endpoints or permission manufacture. */
import assert from 'node:assert/strict';
export function createPagedApprovedContinuationWorkerV4(ports){
 const observingSupported=Object.hasOwn(ports,'observeOriginal');
 assert.deepEqual(Object.keys(ports).sort(),observingSupported?['observeOriginal','readOriginalGrant','stepOriginal']:['readOriginalGrant','stepOriginal']);
 assert.equal(typeof ports.readOriginalGrant,'function');assert.equal(typeof ports.stepOriginal,'function');
 if(observingSupported)assert.equal(typeof ports.observeOriginal,'function');
 let paused=true,closed=false,timer=null,work=null,observing=false,last={state:'PAUSED',code:null};
 function schedule(delay){if(paused||closed||timer!==null||work!==null)return;timer=setTimeout(()=>{timer=null;void run();},delay);timer.unref();}
 async function run(){if(paused||closed||work!==null)return;
  work=(async()=>{const grant=await ports.readOriginalGrant();if(!grant||grant.revoked){last={state:'STOPPED',code:null};paused=true;return;}
   last={state:'RUNNING',code:null};
   if(observing){
    const result=await ports.observeOriginal();
    assert.ok(result&&['READY','PENDING','COMPLETE','STOPPED','BLOCKED'].includes(result.state));
    if(result.state==='READY'){observing=false;last={state:'PROGRESS',code:null};return{state:'PROGRESS'};}
    last={state:result.state==='BLOCKED'?'STOPPED':result.state,code:result.state==='BLOCKED'?'PAGED_CONTINUATION_ORIGINAL_RECOVERY_REQUIRED':null};
    if(['COMPLETE','STOPPED','BLOCKED'].includes(result.state))paused=true;
    return result;
   }
   const result=await ports.stepOriginal();
   assert.ok(result&&['PROGRESS','PENDING','COMPLETE','STOPPED','UNKNOWN','ADVERSE'].includes(result.state));last={state:result.state,code:null};
   if(result.state==='UNKNOWN'&&observingSupported)observing=true;
   else if(['COMPLETE','STOPPED','UNKNOWN','ADVERSE'].includes(result.state))paused=true;
   return result;
  })();
  try{const result=await work;work=null;if(!paused&&!closed)schedule(observing||result?.state==='PENDING'?5000:0);}
  catch(error){work=null;last={state:observingSupported?'UNKNOWN':'STOPPED',code:'PAGED_CONTINUATION_OBSERVATION_REQUIRED'};if(observingSupported){observing=true;if(!paused&&!closed)schedule(5000);}else paused=true;}
 }
 return Object.freeze({wake(){assert.ok(!closed);paused=false;schedule(0);},async pause(){paused=true;if(timer!==null){clearTimeout(timer);timer=null;}if(work)await work.catch(()=>{});},read(){return Object.freeze({...last});},async close(){closed=true;paused=true;if(timer!==null){clearTimeout(timer);timer=null;}if(work)await work.catch(()=>{});}});
}
