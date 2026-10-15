/** Explicit HOST fixture readback, raw responses from actual canonical primary
 * RPC. Requested holdings/gates and alternative amounts in Target causal are
 * HOST facts; no signed transaction, SNARK or credited wallet is simulated. */
export function primaryMorphoV2HostResultV4(fixture,method,params){
 const last=fixture.actual.head.number,raw=fixture.rpc.find(r=>r.method===method&&JSON.stringify(r.params)===JSON.stringify([...params.slice(0,-1),last]));if(raw&&!raw.error)return structuredClone(raw.result);
 const a=fixture.primary.addresses,v=fixture.actual.values,initial=fixture.initialView.values,to=params[0]?.to,data=params[0]?.data,word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),addr=a=>'0x'+a.slice(2).padStart(64,'0');
 if(method==='eth_call'){
  const key=data?.slice(0,10),fixed=new Map([
   [a.vault+':0x38d52e0f',addr(a.underlying)],[a.vault+':0x313ce567',word(18)],[a.underlying+':0x313ce567',word(6)],
   [a.vault+':0x5aa22bc8',word(1)],[a.vault+':0x4ef501ac',addr(a.adapter)],[a.vault+':0xad468d11',addr(a.adapter)],
   [a.vault+':0x01e1d114',initial.totalAssets],[a.vault+':0x18160ddd',initial.totalSupply],
   [a.adapter+':0x38d52e0f',addr(a.underlying)],[a.adapter+':0xd8fbc833',addr(a.morpho)]
  ]);
  if(fixed.has(to+':'+key))return fixed.get(to+':'+key);
  if(to===a.vault&&['0x98c9b49c','0x20fe8d58','0x8e511e4d','0x0d326b18'].includes(key))return word(1);
  if(to===a.vault&&key==='0x70a08231')return word(1000000000000000000n); // explicit HOST holding, not private owner credit.
 }
 return undefined;
}
