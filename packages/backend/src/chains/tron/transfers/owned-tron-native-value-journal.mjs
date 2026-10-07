/** Pure append-only state model. JSON history does not confer provenance. */
import assert from 'node:assert/strict';
import { exact,hex,clone,digest,normalizeBinding,bindOwnedTronSigned,encodeOwnedTronUnsigned,validateOwnedTronPreparation } from './owned-tron-native-value-profile.mjs';
export const JOURNAL_SCHEMA='LIANUM_OWNED_TRON_ORIGINAL_JOURNAL_V1';
export const MAX_EVENTS=32;
export function emptyTronJournal(binding){return clone({schema:JOURNAL_SCHEMA,binding:normalizeBinding(binding),events:[]});}
export function readTronJournal(raw){exact(raw,['schema','binding','events']);assert.equal(raw.schema,JOURNAL_SCHEMA);const binding=normalizeBinding(raw.binding);
  assert.ok(Array.isArray(raw.events)&&raw.events.length<=MAX_EVENTS,'OWNED_TRON_JOURNAL_BOUND');
  let state={phase:'BOUND',prepared:null,signed:null,providerAttested:false,keyStarted:false,sendStarted:false,uncertainty:null,adverse:false},previous='0'.repeat(64);
  for(const e of raw.events){exact(e,['sequence','previous','kind','data','hash']);assert.equal(e.sequence,String(raw.events.indexOf(e)));assert.equal(e.previous,previous);
    assert.equal(e.hash,digest({sequence:e.sequence,previous:e.previous,kind:e.kind,data:e.data}),'OWNED_TRON_JOURNAL_HASH');previous=e.hash;
    const d=e.data,phase=state.phase;assert.ok(!state.adverse,'OWNED_TRON_ADVERSE_LATCHED');
    if(e.kind==='PREPARED'){assert.equal(phase,'BOUND');assert.deepEqual(d.binding,binding);assert.equal(d.unsignedWire,encodeOwnedTronUnsigned(d.transaction));state.prepared=validateOwnedTronPreparation(d);state.phase='PREPARED';}
    else if(e.kind==='KEY_PENDING'){assert.equal(phase,'PREPARED');assert.equal(d,null);state.keyStarted=true;state.phase='KEY_PENDING';}
    else if(e.kind==='SIGNED'){assert.equal(phase,'KEY_PENDING');assert.deepEqual(d,bindOwnedTronSigned(state.prepared.transaction,d.nativeWire));state.signed=clone(d);state.phase='SIGNED';}
    else if(e.kind==='PROVIDER_RETAINED'){assert.equal(phase,'SIGNED');assert.equal(d,null);state.providerAttested=true;state.phase='ATTESTED';}
    else if(e.kind==='SEND_PENDING'){assert.equal(phase,'ATTESTED');assert.equal(d,null);state.sendStarted=true;state.phase='SEND_PENDING';}
    else if(e.kind==='BROADCAST'){assert.equal(phase,'SEND_PENDING');exact(d,['nativeId']);assert.equal(d.nativeId,state.signed.nativeId);state.phase='BROADCAST';}
    else if(e.kind==='UNKNOWN'){assert.ok(phase!=='BOUND');exact(d,['cause']);assert.ok(['native-key','persistence','provider-retention','original-broadcast','observation'].includes(d.cause));
      state.uncertainty=state.uncertainty??d.cause;state.phase='UNKNOWN';}
    else if(e.kind==='OBSERVATION'){assert.ok(state.signed);exact(d,['status','nativeId','nativeWire']);assert.equal(d.nativeId,state.signed.nativeId,'OWNED_TRON_ORIGINAL_ONLY');
      assert.ok(['observed','pending','unknown','adverse'].includes(d.status));assert.equal(d.nativeWire,d.status==='observed'?state.signed.nativeWire:null);
      if(d.status==='adverse'){state.adverse=true;state.phase='ADVERSE';}else if(d.status==='observed')state.phase='OBSERVED';else state.phase='UNKNOWN';
      // Observation never clears key/provider/persistence uncertainty or creates
      // new mutation authority. Even observed originals have no replay/reset.
    }else throw new Error('OWNED_TRON_JOURNAL_EVENT_DENIED');
  }
  return clone(state);
}
export function appendTronEvent(raw,kind,data){readTronJournal(raw);assert.ok(raw.events.length<MAX_EVENTS,'OWNED_TRON_JOURNAL_FULL');const value=structuredClone(raw);
  const e={sequence:String(value.events.length),previous:value.events.at(-1)?.hash??'0'.repeat(64),kind,data:structuredClone(data)};value.events.push({...e,hash:digest(e)});readTronJournal(value);return clone(value);}
