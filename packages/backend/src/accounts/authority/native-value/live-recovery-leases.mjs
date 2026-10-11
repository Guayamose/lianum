/** Instance-private lease issuer. The canonical account owner is its sole
 * constructor; another family cannot create leases recognized by that owner. */
import assert from 'node:assert/strict';
/** @typedef {{account:object,bridge:object,clock:object,nativeRuntime:object,closed:boolean,completion:Promise<unknown>|null}} Lease */
/** @typedef {{runtime:object,sourceIdentity():unknown,installLiveRecovery(lease:Lease):void,tickLiveRecovery(lease:Lease):Promise<unknown>}} Account */
/** @param {{assertAccount(account:object):void,readAccount(account:object):Account,assertBridge(bridge:object,account:object):void,
 * assertClock(clock:object,refs:{runtime:object,nativeRuntime:object}):void,
 * assertSourceClock(clock:object,refs:{runtime:object,nativeRuntime:object}):void}} ports */
export function createLiveRecoveryLeaseFamily(ports){
 /** @type {WeakMap<object,Lease>} */
 const leases=new WeakMap();
 /** @param {object} account @param {object} bridge @param {object} clock @param {object} nativeRuntime */
 function create(account,bridge,clock,nativeRuntime){
  assert.equal(arguments.length,4);ports.assertAccount(account);ports.assertBridge(bridge,account);const state=ports.readAccount(account);
  ports.assertClock(clock,{runtime:state.runtime,nativeRuntime});
  const cap=Object.freeze(Object.create(null));
  /** @type {Lease} */
  const row={account,bridge,clock,nativeRuntime,closed:false,completion:null};
  state.installLiveRecovery(row);leases.set(cap,row);return cap;
 }
 /** @param {object} account @param {object} bridge @param {object} clock @param {object} nativeRuntime */
 function createSource(account,bridge,clock,nativeRuntime){
  assert.equal(arguments.length,4);ports.assertAccount(account);ports.assertBridge(bridge,account);const state=ports.readAccount(account);
  state.sourceIdentity();ports.assertSourceClock(clock,{runtime:state.runtime,nativeRuntime});
  const cap=Object.freeze(Object.create(null));
  /** @type {Lease} */
  const row={account,bridge,clock,nativeRuntime,closed:false,completion:null};
  state.installLiveRecovery(row);leases.set(cap,row);return cap;
 }
 /** @param {object} cap */
 function close(cap){assert.equal(arguments.length,1);const row=leases.get(cap);assert.ok(row,'DEVICE_LIVE_RECOVERY_ORIGINAL_LEASE');row.closed=true;return row.completion??Promise.resolve();}
 /** @param {object} cap */
 function tick(cap){assert.equal(arguments.length,1);const row=leases.get(cap);assert.ok(row&&!row.closed,'DEVICE_LIVE_RECOVERY_CLOSED');if(row.completion)return row.completion;
  const task=ports.readAccount(row.account).tickLiveRecovery(row);row.completion=task;
  task.finally(()=>{if(row.completion===task)row.completion=null;}).catch(()=>{});return task;
 }
 return Object.freeze({create,createSource,close,tick});
}
