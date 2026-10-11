/** Retain the original private diagnostic before closing that same backend.
 * Cleanup records observations only; it cannot authorize a retry or effect. */
/** @typedef {{close:()=>Promise<unknown>}} Closable */
/**
 * @param {{failed:boolean,primary:unknown,backend:({call:(action:string)=>Promise<unknown>}&Closable)|null|undefined,host:Closable|null|undefined,witness:Record<string,unknown>|null|undefined,cleanup:{errors:string[],[key:string]:unknown}}} input
 * @param {{retainError:(error:unknown)=>unknown,retainHttpFailure:(failure:unknown)=>unknown}} retention
 */
export async function finishConfirmedSourceResourcesV2(input,retention){
 const {failed,backend,host,witness,cleanup}=input;let {primary}=input;
 if(failed){retention.retainError(primary);try{const failure=await backend?.call('HTTP_FAILURE');if(failure)retention.retainHttpFailure(failure);}catch{}}
 if(witness)for(const value of Object.values(witness))if(Array.isArray(value))value.fill(0);
 /** @type {[string,()=>Promise<unknown>|undefined][]} */
 const resources=[['closedBackend',()=>backend?.close()],['closedMobileHost',()=>host?.close()]];
 for(const [key,close] of resources)try{const value=await close();cleanup[key]=true;cleanup[key+'Receipt']=value;}catch(error){primary??=error;cleanup.errors.push(key);cleanup[key]=false;}
 return primary;
}
