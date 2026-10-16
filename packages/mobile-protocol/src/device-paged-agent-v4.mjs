/** Public proposal and read-only grant DATA. No financial issuer or key lives
 * here. Financial operation approval remains the original graph/START path. */
import * as P from './device-paged-owner-v3.mjs';
import {normalizeDevicePagedAutomationTermsV4} from './device-paged-automation-v4.mjs';
import {normalizeDevicePagedAutomationTermsAnyV5} from './device-paged-automation-v5.mjs';
import {boundedPermissionSha256V1} from './bounded-permission-sha256-v1.mjs';
export const DEVICE_PAGED_AGENT_PROPOSAL_V4='DEVICE_PAGED_AGENT_NATIVE_PROPOSAL_V4';
export const DEVICE_PAGED_AGENT_READ_GRANT_V4='DEVICE_PAGED_AGENT_OPERATION_READ_GRANT_V4';
export const DEVICE_PAGED_AGENT_PROGRESS_V4='DEVICE_PAGED_AGENT_OPERATION_PROGRESS_V4';
const need=v=>{if(!v)throw Error('PAGED_AGENT_SCOPE');};
const exact=P.pagedOwnerExactV3;
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const hash=v=>{const b=new TextEncoder().encode(v);try{return hex(boundedPermissionSha256V1(b));}finally{b.fill(0);}};
function point(v){need(typeof v==='string'&&/^04[0-9a-f]{128}$/.test(v));return v;}
function id(v){need(typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(v));return v;}
function graph(v){need(typeof v==='string'&&/^paged-graph-[0-9a-f]{32}$/.test(v));return v;}
function array(v,maximum){need(Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=maximum&&Reflect.ownKeys(v).length===v.length+1);for(let i=0;i<v.length;i++){const slot=Object.getOwnPropertyDescriptor(v,String(i));need(slot?.enumerable&&Object.hasOwn(slot,'value'));}return v;}
function integer(v,max){need(Number.isSafeInteger(v)&&v>0&&v<=max);return v;}
export function devicePagedAgentDescriptorSHA256V4(raw){return hash(JSON.stringify(P.normalizeDevicePagedDescriptorV3(raw)));}
export function devicePagedAgentAutomationTermsSHA256V4(raw){return hash(JSON.stringify(normalizeDevicePagedAutomationTermsV4(raw)));}
export function devicePagedAgentAutomationTermsSHA256AnyV5(raw){
 const terms=normalizeDevicePagedAutomationTermsAnyV5(raw);if(terms.profile!=='DEVICE_PAGED_APPROVED_CONTINUATION_V5')return devicePagedAgentAutomationTermsSHA256V4(terms);
 const {executorPayouts,...base}=terms,{payouts,...plan}=executorPayouts;
 let root=hash('LIANUM/AGENT-AUTOMATION-TERMS-HEAD/5\n'+JSON.stringify([base,plan,payouts.length]));
 for(let i=0;i<payouts.length;i++)root=hash('LIANUM/AGENT-AUTOMATION-PAYOUT/5\n'+JSON.stringify([root,i,payouts[i]]));
 return root;
}
export function normalizeDevicePagedAgentProposalV4(raw){
 const p=exact(raw,['profile','descriptorSHA256','agentPublicKey','terms','nodes']);need(p.profile===DEVICE_PAGED_AGENT_PROPOSAL_V4);P.pagedOwnerHexV3(p.descriptorSHA256);point(p.agentPublicKey);
 const t=exact(p.terms,['budget','fundingNotBefore','fundingValidUntil','settleBefore']);for(const k of Object.keys(t))P.pagedOwnerUintV3(t[k],k!=='budget');need(BigInt(t.fundingNotBefore)<BigInt(t.fundingValidUntil)&&BigInt(t.fundingValidUntil)<=BigInt(t.settleBefore));
 const seen=new Set();let total=0n;array(p.nodes,256);need(p.nodes.length>0);p.nodes=p.nodes.map(rawNode=>{const n=exact(rawNode,['id','networkId','recipient','amountAtomic','providerPayoutAtomic','dependsOn']);id(n.id);need(!seen.has(n.id));need(['ethereum-sepolia','bitcoin-testnet','solana-devnet'].includes(n.networkId));need(typeof n.recipient==='string'&&n.recipient.length>=20&&n.recipient.length<=128);P.pagedOwnerUintV3(n.amountAtomic);P.pagedOwnerUintV3(n.providerPayoutAtomic);array(n.dependsOn,256);need(new Set(n.dependsOn).size===n.dependsOn.length&&n.dependsOn.every(dependency=>seen.has(id(dependency))));seen.add(n.id);total+=BigInt(n.providerPayoutAtomic);return n;});need(total<=BigInt(t.budget));return freeze(p);
}
/** Fold bounded nodes so 256 payments never require a larger hash input cap. */
export function devicePagedAgentProposalDigestV4(raw){const p=normalizeDevicePagedAgentProposalV4(raw);let root=hash('LIANUM/AGENT-PROPOSAL-HEAD/4\n'+JSON.stringify([p.profile,p.descriptorSHA256,p.agentPublicKey,p.terms,p.nodes.length]));for(let i=0;i<p.nodes.length;i++){const {dependsOn,...node}=p.nodes[i];let dependencies=hash('LIANUM/AGENT-PROPOSAL-DEPS/4\n'+dependsOn.length);for(const predecessor of dependsOn)dependencies=hash('LIANUM/AGENT-PROPOSAL-DEP/4\n'+JSON.stringify([dependencies,predecessor]));root=hash('LIANUM/AGENT-PROPOSAL-NODE/4\n'+JSON.stringify([root,i,node,dependencies,dependsOn.length]));}return root;}
export function devicePagedAgentProposalMessageV4(raw){const p=normalizeDevicePagedAgentProposalV4(raw);return new TextEncoder().encode('LIANUM/AGENT-PROPOSAL/4\n'+JSON.stringify([devicePagedAgentProposalDigestV4(p),p.agentPublicKey]));}
export function normalizeDevicePagedSignedAgentProposalV4(raw){const s=exact(raw,['proposal','signature']);s.proposal=normalizeDevicePagedAgentProposalV4(s.proposal);need(typeof s.signature==='string'&&/^[0-9a-f]{128}$/.test(s.signature));return freeze(s);}
export function devicePagedAgentReadGrantIdV4(descriptorSHA256,terms,readerPublicKey){P.pagedOwnerHexV3(descriptorSHA256);point(readerPublicKey);return hash('LIANUM/AGENT-READ-GRANT-ID/4\n'+JSON.stringify([descriptorSHA256,devicePagedAgentAutomationTermsSHA256V4(terms),readerPublicKey]));}
export function normalizeDevicePagedAgentReadGrantV4(raw){
 const g=exact(raw,['profile','descriptorSHA256','terms','readerPublicKey','maximumReads','grantId']);need(g.profile===DEVICE_PAGED_AGENT_READ_GRANT_V4);P.pagedOwnerHexV3(g.descriptorSHA256);g.terms=normalizeDevicePagedAutomationTermsV4(g.terms);need(g.terms.descriptorSHA256===g.descriptorSHA256);point(g.readerPublicKey);integer(g.maximumReads,4096);need(g.grantId===devicePagedAgentReadGrantIdV4(g.descriptorSHA256,g.terms,g.readerPublicKey));return freeze(g);
}
export function devicePagedAgentReadGrantMessageV4(raw){return new TextEncoder().encode('LIANUM/AGENT-READ-ONLY-GRANT/4\n'+JSON.stringify(normalizeDevicePagedAgentReadGrantV4(raw)));}
export function normalizeDevicePagedSignedAgentReadGrantV4(raw){const s=exact(raw,['grant','signature']);s.grant=normalizeDevicePagedAgentReadGrantV4(s.grant);need(typeof s.signature==='string'&&/^[0-9a-f]{128}$/.test(s.signature));return freeze(s);}
export function normalizeDevicePagedAgentReadChallengeV4(raw){const c=exact(raw,['profile','descriptorSHA256','grantId','readerPublicKey','action','intentId','challengeId','nonce','issuedAt','expiresAt']);need(c.profile==='DEVICE_PAGED_AGENT_READ_CHALLENGE_V4');P.pagedOwnerHexV3(c.descriptorSHA256);P.pagedOwnerHexV3(c.grantId);point(c.readerPublicKey);need(['READ_PROGRESS','REVOKE_READ_ACCESS'].includes(c.action));for(const k of ['intentId','challengeId','nonce'])P.pagedOwnerHexV3(c[k]);integer(c.issuedAt,Number.MAX_SAFE_INTEGER);need(c.expiresAt===c.issuedAt+15000);return freeze(c);}
export function validateDevicePagedAgentReadChallengeFreshV4(raw){const c=normalizeDevicePagedAgentReadChallengeV4(raw),now=P.devicePagedNowV3();need(now>=c.issuedAt&&now<c.expiresAt);P.assertDevicePagedFrameElapsedV3('agent:challenge:'+c.descriptorSHA256+':'+c.challengeId,c.expiresAt,P.devicePagedWallNowV3());return c;}
export function devicePagedAgentReadChallengeMessageV4(raw){return new TextEncoder().encode('LIANUM/AGENT-READ-ONLY-POP/4\n'+JSON.stringify(normalizeDevicePagedAgentReadChallengeV4(raw)));}
export function normalizeDevicePagedAgentProgressV4(raw){return normalizeProgress(raw,normalizeDevicePagedAutomationTermsV4);}
/** Progress DATA keeps the V5 terms/profile and payout plan intact. Its read
 * envelope is unchanged; the strict V4 financial/grant readers stay separate. */
export function normalizeDevicePagedAgentProgressAnyV5(raw){return normalizeProgress(raw,normalizeDevicePagedAutomationTermsAnyV5);}
function normalizeProgress(raw,termsNormalizer){
 const p=exact(raw,['profile','descriptorSHA256','graphId','rootId','revision','authorizationRoot','reserveNullifier','phase','pending','automation','execution','observed','current']);need(p.profile===DEVICE_PAGED_AGENT_PROGRESS_V4&&p.current===true);for(const k of ['descriptorSHA256','rootId','authorizationRoot','reserveNullifier'])P.pagedOwnerHexV3(p[k]);graph(p.graphId);integer(p.revision,Number.MAX_SAFE_INTEGER);need(['PREPARED','RESERVED','FULFILLED','RECOVERED'].includes(p.phase)&&typeof p.pending==='boolean');
 if(p.automation!==null){const a=exact(p.automation,['terms','commandsUsed','revoked']);a.terms=termsNormalizer(a.terms);need(Number.isSafeInteger(a.commandsUsed)&&a.commandsUsed>=0&&a.commandsUsed<=a.terms.maxCommands&&typeof a.revoked==='boolean');for(const k of ['descriptorSHA256','graphId','rootId','revision','authorizationRoot','reserveNullifier'])need(a.terms[k]===p[k]);p.automation=a;}
 if(p.execution!==null){const e=exact(p.execution,['completed','total','currentNodeId']);P.pagedOwnerUintV3(e.completed,true);P.pagedOwnerUintV3(e.total,true);need(BigInt(e.completed)<=BigInt(e.total)&&(p.automation===null||e.total===p.automation.terms.nodes));if(e.currentNodeId!==null)id(e.currentNodeId);p.execution=e;}
 const o=exact(p.observed,['blockHash','blockNumber','timestamp','issuedAt','expiresAt']);need(typeof o.blockHash==='string'&&/^0x[0-9a-f]{64}$/.test(o.blockHash));P.pagedOwnerUintV3(o.blockNumber,true);P.pagedOwnerUintV3(o.timestamp,true);integer(o.issuedAt,Number.MAX_SAFE_INTEGER);need(o.expiresAt>o.issuedAt&&o.expiresAt<=o.issuedAt+15000);return freeze(p);
}
export function validateDevicePagedAgentProgressFreshV4(raw){return progressFresh(normalizeDevicePagedAgentProgressV4(raw));}
export function validateDevicePagedAgentProgressFreshAnyV5(raw){return progressFresh(normalizeDevicePagedAgentProgressAnyV5(raw));}
function progressFresh(p){const now=P.devicePagedNowV3();need(now>=p.observed.issuedAt&&now<p.observed.expiresAt);P.assertDevicePagedFrameElapsedV3('agent:progress:'+p.descriptorSHA256+':'+p.graphId+':'+p.observed.issuedAt+':'+p.observed.blockHash,p.observed.expiresAt,P.devicePagedWallNowV3());return p;}
