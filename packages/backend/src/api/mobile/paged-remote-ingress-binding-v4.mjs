/** Operator-owned transport binding. It never creates a wallet, permission,
 * provider, runtime or spend capability. Public HTTP cannot supply this handle. */
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';
import {networkInterfaces} from 'node:os';

export const PAGED_REMOTE_ORIGIN_V4='https://api.lianum.oryontechnology.com';
export const PAGED_REMOTE_PORT_V4=9445;
const owned=new WeakMap();
function record(value,keys){
 assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype,'PAGED_REMOTE_CONFIG');
 assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),'PAGED_REMOTE_FIELDS');
 for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'),'PAGED_REMOTE_CONFIG');
 return value;
}
function pem(value){assert.ok(typeof value==='string'&&value.length>0&&value.length<=32768,'PAGED_REMOTE_TLS_BOUND');return value;}
function assignedPrivateIPv4(value){
 if(isIP(value)!==4)return false;const [a,b]=value.split('.').map(Number);
 if(!(a===10||a===172&&b>=16&&b<=31||a===192&&b===168))return false;
 return Object.values(networkInterfaces()).some(rows=>(rows??[]).some(row=>row.family==='IPv4'&&!row.internal&&row.address===value));
}
function validLeaf(cert){const now=Date.now();assert.ok(!cert.ca&&Number.isFinite(now)&&Date.parse(cert.validFrom)<=now&&now<Date.parse(cert.validTo),'PAGED_REMOTE_TLS_VALIDITY');}

export function createOriginalPagedRemoteIngressBindingV4(raw){
 assert.equal(arguments.length,1);record(raw,['origin','host','port','privateTLS','publicCertificatePEM']);
 assert.equal(raw.origin,PAGED_REMOTE_ORIGIN_V4,'PAGED_REMOTE_PUBLIC_ORIGIN');
 assert.equal(raw.port,PAGED_REMOTE_PORT_V4,'PAGED_REMOTE_LISTENER_PORT');
 assert.ok(assignedPrivateIPv4(raw.host),'PAGED_REMOTE_ASSIGNED_PRIVATE_HOST');
 record(raw.privateTLS,['key','cert']);
 const key=pem(raw.privateTLS.key),cert=pem(raw.privateTLS.cert),publicCertificatePEM=pem(raw.publicCertificatePEM);
 const privateLeaf=new X509Certificate(cert),publicLeaf=new X509Certificate(publicCertificatePEM);
 validLeaf(privateLeaf);validLeaf(publicLeaf);
 assert.ok(privateLeaf.checkIP(raw.host)&&privateLeaf.checkPrivateKey(createPrivateKey(key)),'PAGED_REMOTE_PRIVATE_TLS_BINDING');
 assert.ok(publicLeaf.checkHost(new URL(raw.origin).hostname),'PAGED_REMOTE_PUBLIC_TLS_HOST');
 const configuration=Object.freeze({origin:raw.origin,host:raw.host,port:raw.port,
  privateTLS:Object.freeze({key,cert}),publicCertificatePEM,
  publicCertificateSHA256:createHash('sha256').update(publicLeaf.raw).digest('hex')});
 const handle=Object.freeze({});owned.set(handle,{configuration,privateLeaf,publicLeaf});return handle;
}

/** Only the privately created handle can select the independent listener port.
 * A copied configuration remains DATA and cannot stand in for this binding. */
export function readOriginalPagedRemoteIngressBindingV4(handle){
 assert.equal(arguments.length,1);const original=owned.get(handle);assert.ok(original,'PAGED_REMOTE_ORIGINAL_BINDING');
 validLeaf(original.privateLeaf);validLeaf(original.publicLeaf);
 assert.ok(assignedPrivateIPv4(original.configuration.host),'PAGED_REMOTE_ASSIGNED_PRIVATE_HOST');
 return original.configuration;
}

export function closeOriginalPagedRemoteIngressBindingV4(handle){
 assert.equal(arguments.length,1);assert.ok(owned.has(handle),'PAGED_REMOTE_ORIGINAL_BINDING');owned.delete(handle);
}
