/** Signed public association only. Reopening this record never restores custody,
 * graph freshness or authorization; those must come from the original wallet. */
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {devicePagedAgentDescriptorSHA256V4,devicePagedAgentProposalDigestV4} from '@lianum/mobile-protocol/device/paged-agent-v4';
import {verifyDevicePagedAgentNativeProposalV4} from './device-paged-agent-api-v4.mjs';
const PROFILE='DEVICE_PAGED_AGENT_PREPARATION_V5',MAX=1048576,PART=1200;
const need=value=>{if(!value)throw Error('MOBILE_PAGED_AGENT_PREPARATION_BINDING');};
export function normalizeDevicePagedAgentPreparationV5(raw,rawDescriptor){
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),r=P.pagedOwnerExactV3(raw,['profile','descriptorSHA256','proposalSHA256','proposal','source','graphId','maximumReads','readUntilMs']);
 need(r.profile===PROFILE&&r.descriptorSHA256===devicePagedAgentDescriptorSHA256V4(descriptor));
 const proposal=verifyDevicePagedAgentNativeProposalV4(r.proposal);
 need(proposal.proposal.descriptorSHA256===r.descriptorSHA256&&devicePagedAgentProposalDigestV4(proposal.proposal)===r.proposalSHA256);
 P.assertDevicePagedGraphDeadlineV3(descriptor,proposal.proposal.terms.settleBefore);
 const source=P.pagedOwnerExactV3(r.source,['rootId','revision']);P.pagedOwnerHexV3(source.rootId);
 need(Number.isSafeInteger(source.revision)&&source.revision>=0);
 need(r.graphId===null||typeof r.graphId==='string'&&/^paged-graph-[0-9a-f]{32}$/.test(r.graphId));
 need(Number.isSafeInteger(r.maximumReads)&&r.maximumReads>0&&r.maximumReads<=4096);
 need(r.readUntilMs===null||Number.isSafeInteger(r.readUntilMs)&&r.readUntilMs>0&&r.readUntilMs<=descriptor.deadlineMs);
 return Object.freeze({...r,source:Object.freeze({...source}),proposal});
}
export function createDevicePagedAgentPreparationStoreV5(rawDescriptor,storage){
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),prefix='lianum.agent.preparation.v5.'+devicePagedAgentDescriptorSHA256V4(descriptor);
 need(storage&&typeof storage.get==='function'&&typeof storage.set==='function'&&typeof storage.digest==='function');let tail=Promise.resolve();
 const serial=fn=>{const task=tail.then(fn);tail=task.catch(()=>{});return task;};
 async function read(){
  const pointer=await storage.get(prefix);if(pointer===null)return null;
  const p=P.pagedOwnerExactV3(JSON.parse(pointer),['sha256','length','parts']);
  need(/^[a-f0-9]{64}$/.test(p.sha256)&&Number.isSafeInteger(p.length)&&p.length>0&&p.length<=MAX&&p.parts===Math.ceil(p.length/PART));
  let text='';for(let i=0;i<p.parts;i++){const part=await storage.get(prefix+'.'+p.sha256+'.'+i);need(typeof part==='string'&&part.length>0&&part.length<=PART);text+=part;}
  need(text.length===p.length&&await storage.digest(text)===p.sha256&&await storage.get(prefix)===pointer);
  return normalizeDevicePagedAgentPreparationV5(JSON.parse(text),descriptor);
 }
 return Object.freeze({read:()=>serial(read),save:raw=>serial(async()=>{
  const value=normalizeDevicePagedAgentPreparationV5(raw,descriptor),prior=await storage.get(prefix),old=await read();
  if(old){
   for(const key of ['proposalSHA256','descriptorSHA256','maximumReads','readUntilMs'])need(old[key]===value[key]);
   need(JSON.stringify(old.source)===JSON.stringify(value.source)&&JSON.stringify(old.proposal)===JSON.stringify(value.proposal));
   need(old.graphId===null||old.graphId===value.graphId);
  }
  const text=JSON.stringify(value);need(text.length<=MAX);const sha256=await storage.digest(text);need(/^[a-f0-9]{64}$/.test(sha256));
  const pointer=JSON.stringify({sha256,length:text.length,parts:Math.ceil(text.length/PART)});
  for(let i=0;i<Math.ceil(text.length/PART);i++){const key=prefix+'.'+sha256+'.'+i,part=text.slice(i*PART,(i+1)*PART),existing=await storage.get(key);need(existing===null||existing===part);if(existing===null)await storage.set(key,part);need(await storage.get(key)===part);}
  need(await storage.get(prefix)===prior);await storage.set(prefix,pointer);need(await storage.get(prefix)===pointer);return read();
 })});
}
