/** Operation DATA only. Counts the exact original OWNER continuation path;
 * this does not issue a grant or enlarge an already signed START. */
import * as P from './device-paged-owner-v3.mjs';
const need=value=>{if(!value)throw Error('MOBILE_PAGED_AUTOMATION_QUOTA');};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function normalizeDevicePagedAutomationTopologyV4(raw){
 const value=P.pagedOwnerExactV3(raw,['pages','nodes']);P.pagedOwnerUintV3(value.pages);need(Array.isArray(value.nodes)&&Object.getPrototypeOf(value.nodes)===Array.prototype&&value.nodes.length>0&&value.nodes.length<=256&&Reflect.ownKeys(value.nodes).length===value.nodes.length+1&&BigInt(value.pages)<=BigInt(value.nodes.length)&&BigInt(value.nodes.length)<=64n*BigInt(value.pages));const seen=new Set();
 for(let i=0;i<value.nodes.length;i++){const slot=Object.getOwnPropertyDescriptor(value.nodes,String(i));need(slot?.enumerable&&Object.hasOwn(slot,'value'));}
 value.nodes=value.nodes.map((rawNode,index)=>{const slot=Object.getOwnPropertyDescriptor(value.nodes,String(index));need(slot?.enumerable&&Object.hasOwn(slot,'value'));const node=P.pagedOwnerExactV3(rawNode,['id','dependsOn']);need(typeof node.id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(node.id)&&!seen.has(node.id)&&Array.isArray(node.dependsOn)&&node.dependsOn.length<=index&&Object.getPrototypeOf(node.dependsOn)===Array.prototype&&Reflect.ownKeys(node.dependsOn).length===node.dependsOn.length+1);for(let i=0;i<node.dependsOn.length;i++){const dep=Object.getOwnPropertyDescriptor(node.dependsOn,String(i));need(dep?.enumerable&&Object.hasOwn(dep,'value')&&seen.has(dep.value));}need(new Set(node.dependsOn).size===node.dependsOn.length);seen.add(node.id);return node;});return freeze(value);
}
export function devicePagedAutomationCommandQuotaV4(raw){
 const topology=normalizeDevicePagedAutomationTopologyV4(raw),nodes=topology.nodes.length,dependencies=topology.nodes.reduce((sum,node)=>sum+node.dependsOn.length,0),folds=topology.nodes.reduce((sum,node)=>sum+Math.max(1,node.dependsOn.length),0),maxCommands=4+4*nodes+2*folds;
 // R/T each have prove+commit; each node has admission and final node prove+
 // commit, plus one dependency fold per edge (one initialization if no edge).
 need(maxCommands<=4096);return freeze({nodes,pages:Number(topology.pages),dependencies,dependencyFolds:folds,maxCommands,maximumCommands:4096});
}
