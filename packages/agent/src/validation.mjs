export const fail=code=>{throw Error('NATIVE_AGENT_'+code);};
export const need=(value,code='DATA')=>{if(!value)fail(code);};
export function exact(value,keys,optional=[]){need(value&&Object.getPrototypeOf(value)===Object.prototype&&keys.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>keys.includes(key)||optional.includes(key)));return value;}
export function boundedText(value,max=2000){need(typeof value==='string'&&value.trim().length>0&&value.length<=max);return value.trim();}
export function uuid(value){need(typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value));return value;}
export const ownerId=value=>{need(typeof value==='string'&&/^[0-9a-f]{64}$/.test(value),'IDENTITY');return value;};
export function remoteId(value){need(typeof value==='string'&&/^[-a-zA-Z0-9_:.]{1,200}$/.test(value),'PROVIDER_RESPONSE');return value;}
