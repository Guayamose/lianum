/** Linux guards for the one process group created by this build's spawn. */
import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { nativeProcStatV1 } from '../../../tests/integration/native/native-flow-owned-files-v1.mjs';

const same = (a,b) => a && b && a.pid===b.pid && a.startTimeTicks===b.startTimeTicks;
const live = stat => !/^[ZX]$/.test(stat.state);
const status = pid => readFileSync(`/proc/${pid}/status`,'utf8');
function uidOf(text) {
  const match=/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(text);
  assert.ok(match,'MOBILE_BUILD_PROCESS_UID_UNAVAILABLE');
  const values=match.slice(1).map(Number);
  assert.ok(values.every(value=>value===process.getuid()),'MOBILE_BUILD_PROCESS_UID_CHANGED');
  return values[0];
}
export function ownSpawnedBuildGroup(child) {
  assert.ok(child instanceof ChildProcess,'MOBILE_BUILD_ACTUAL_CHILD_REQUIRED');
  const pgid=child.pid;assert.ok(Number.isSafeInteger(pgid)&&pgid>1&&pgid!==process.pid);
  const initial=nativeProcStatV1(pgid);
  assert.ok(initial&&initial.ppid===process.pid&&initial.pgrp===pgid&&initial.session===pgid,
    'MOBILE_BUILD_SPAWN_GROUP_UNCONFIRMED');
  uidOf(status(pgid));assert.ok(same(initial,nativeProcStatV1(pgid)),'MOBILE_BUILD_SPAWN_IDENTITY_CHANGED');
  const identities=new Map([[pgid,initial]]);
  let gone=false,lost=false;
  function snapshot() {
    if(gone)return {rssBytes:0,liveCount:0,processes:[],gone:true};
    assert.equal(lost,false,'MOBILE_BUILD_GROUP_OWNERSHIP_LOST');
    try {
      const group=[];
      for(const entry of readdirSync('/proc')) {
        if(!/^[1-9]\d*$/.test(entry))continue;
        const stat=nativeProcStatV1(Number(entry));if(!stat)continue;
        if(same(stat,identities.get(stat.pid))&&live(stat))
          assert.ok(stat.pgrp===pgid&&stat.session===pgid,'MOBILE_BUILD_PROCESS_ESCAPED');
        if(stat.pgrp===pgid){assert.equal(stat.session,pgid,'MOBILE_BUILD_GROUP_SESSION_CHANGED');group.push(stat);}
      }
      const leader=group.find(stat=>stat.pid===pgid);
      if(leader)assert.ok(same(leader,initial),'MOBILE_BUILD_GROUP_LEADER_REUSED');
      else if(group.length)assert.ok(group.some(stat=>same(stat,identities.get(stat.pid))),
        'MOBILE_BUILD_GROUP_CONTINUITY_UNCONFIRMED');
      const processes=[];
      for(const stat of group) {
        let text;
        try{text=status(stat.pid);}catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
        const uid=uidOf(text),after=nativeProcStatV1(stat.pid);if(!after)continue;
        assert.ok(same(stat,after)&&after.pgrp===pgid&&after.session===pgid,'MOBILE_BUILD_PROCESS_IDENTITY_CHANGED');
        const rss=/^VmRSS:\s+(\d+)\s+kB$/m.exec(text);
        assert.ok(rss||!live(after),'MOBILE_BUILD_PROCESS_RSS_UNAVAILABLE');
        identities.set(after.pid,after);processes.push({...after,uid,rssBytes:Number(rss?.[1]??0)*1024});
      }
      if(!processes.length) {
        let absent=false;
        try{process.kill(-pgid,0);}catch(error){if(error.code==='ESRCH')absent=true;else throw error;}
        assert.ok(absent,'MOBILE_BUILD_GROUP_SCAN_INCOMPLETE');gone=true;
      }
      return {rssBytes:processes.reduce((sum,stat)=>sum+stat.rssBytes,0),liveCount:processes.filter(live).length,processes,gone};
    }catch(error){lost=true;throw error;}
  }
  function signal(signal) {
    assert.ok(['SIGTERM','SIGKILL'].includes(signal),'MOBILE_BUILD_SIGNAL_KIND');
    if(gone)return {sent:false,gone:true};
    if(lost)return {sent:false,unconfirmed:true};
    try {
      const group=snapshot();
      if(group.gone||!group.liveCount)return {sent:false,gone:group.gone};
      const anchor=group.processes.find(stat=>live(stat)&&same(stat,identities.get(stat.pid)));
      assert.ok(anchor,'MOBILE_BUILD_SIGNAL_ANCHOR_UNCONFIRMED');
      const current=nativeProcStatV1(anchor.pid);uidOf(status(anchor.pid));
      assert.ok(same(anchor,current)&&current.pgrp===pgid&&current.session===pgid,
        'MOBILE_BUILD_SIGNAL_IDENTITY_CHANGED');
      assert.ok(same(current,nativeProcStatV1(anchor.pid)),'MOBILE_BUILD_SIGNAL_IDENTITY_CHANGED');
      process.kill(-pgid,signal);return {sent:true,gone:false};
    }catch(error){if(error.code==='ESRCH'){gone=true;return {sent:false,gone:true};}
      lost=true;return {sent:false,unconfirmed:true,code:String(error.message).match(/MOBILE_BUILD_[A-Z0-9_]+/)?.[0]??'MOBILE_BUILD_SIGNAL_UNCONFIRMED'};}
  }
  return Object.freeze({snapshot,signal,identity:Object.freeze({...initial,uid:process.getuid()})});
}
